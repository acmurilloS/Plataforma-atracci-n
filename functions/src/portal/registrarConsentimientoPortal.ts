import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { upsertFormatoEnCarpeta } from './upsertFormatoEnCarpeta';
import { urlPortalDocValida } from './urlPortalDocValida';
import { verificarCedula } from './verificarCedula';

/**
 * registrarConsentimientoPortal · registra que el candidato ACEPTÓ, desde su
 * portal público, el tratamiento de datos o el acuerdo de imagen y voz.
 *
 * Callable pública: el portador del token es el candidato (el link llegó a su
 * correo), igual que un enlace mágico. Guarda fecha + evidencia (IP / navegador)
 * en la postulación y deja registro en eventos/.
 */
export const registrarConsentimientoPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const tipo = String(req.data?.tipo ?? '').trim();

  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!['datos', 'imagen'].includes(tipo)) {
    throw new HttpsError('invalid-argument', 'Tipo de consentimiento inválido.');
  }
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) {
    throw new HttpsError('not-found', 'Token inválido.');
  }

  // URL del PDF firmado (D.2). Opcional para no romper aceptaciones sin firma.
  const firmaUrl = String(req.data?.firma_url ?? '').trim();
  if (firmaUrl && !urlPortalDocValida(firmaUrl, token)) {
    throw new HttpsError('invalid-argument', 'URL de firma inválida.');
  }
  // Imagen (PNG) de la firma, para incrustarla en el documento del staff.
  const firmaImagenUrl = String(req.data?.firma_imagen_url ?? '').trim();
  if (firmaImagenUrl && !urlPortalDocValida(firmaImagenUrl, token)) {
    throw new HttpsError('invalid-argument', 'URL de firma (imagen) inválida.');
  }

  const ref = db.collection('portal_candidato_tokens').doc(token);
  const tSnap = await ref.get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
  if (!tokenVigente(t)) {
    throw new HttpsError(
      'failed-precondition',
      'El enlace expiró o fue revocado. Pídele al equipo de Atracción que te reenvíe tu portal.',
    );
  }
  // 2º factor: la cédula. Sin esto, quien conociera el token de 8-12 chars podía
  // FORJAR el consentimiento firmado sin ser el candidato (revisión 16-jul). Los
  // otros formularios del portal ya la exigían; este se había quedado sin ella.
  const cedula = String(req.data?.cedula ?? '').trim();
  const ced = await verificarCedula(ref, cedula);
  if (!ced.ok) {
    throw new HttpsError('permission-denied', 'Cédula incorrecta o bloqueada. Verifica e intenta de nuevo.');
  }
  const postulacionId = String(t.postulacion_id ?? '');
  if (!postulacionId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  const raw = req.rawRequest as unknown as {
    ip?: string;
    headers?: Record<string, string | undefined>;
  };
  const ip = String(raw?.ip ?? '').slice(0, 64);
  const ua = String(raw?.headers?.['user-agent'] ?? '').slice(0, 256);

  const campo = tipo === 'datos' ? 'consentimiento_datos' : 'consentimiento_imagen';

  const update: Record<string, unknown> = {
    [`${campo}_aceptado_en`]: FieldValue.serverTimestamp(),
    [`${campo}_evidencia`]: { ip, user_agent: ua, via: 'portal_candidato' },
  };
  if (firmaUrl) update[`${campo}_firma_url`] = firmaUrl;
  if (firmaImagenUrl) update[`${campo}_firma_imagen_url`] = firmaImagenUrl;
  await db.collection('postulaciones').doc(postulacionId).update(update);

  // El PDF firmado queda visible para el analista en la carpeta (DocumentosTab).
  if (firmaUrl) {
    // Refleja el PDF firmado como documento ENTREGADO en la carpeta real
    // (documentos_candidato), igual que SAGRILAFT: aparece con "Ver PDF", cuenta
    // en la completitud y evita que el equipo tenga que descargarlo del portal y
    // volver a subirlo a mano (reu Karen 11-ago). 'datos' → slot autorizacion_datos
    // (obligatorio); 'imagen' → slot acuerdo_imagen_voz (opcional).
    await upsertFormatoEnCarpeta({
      postulacionId,
      clave: tipo === 'datos' ? 'autorizacion_datos' : 'acuerdo_imagen_voz',
      pdfUrl: firmaUrl,
      candidatoId: String(t.candidato_id ?? ''),
      candidatoNombre: String(t.candidato_nombre ?? ''),
    });

    const titulo =
      tipo === 'datos'
        ? 'Autorización tratamiento de datos (firmada)'
        : 'Acuerdo de imagen y voz (firmado)';
    await db.collection('documentos_portal').add({
      postulacion_id: postulacionId,
      candidato_id: t.candidato_id ?? null,
      nombre_archivo: titulo,
      url: firmaUrl,
      via: 'firma_portal',
      subido_en: FieldValue.serverTimestamp(),
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'candidato_portal',
    });
  }

  await db.collection('eventos').add({
    tipo: 'consentimiento_aceptado',
    consentimiento_tipo: tipo,
    postulacion_id: postulacionId,
    token,
    evidencia_ip: ip,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  logger.info('[portal] consentimiento aceptado', { token, tipo, postulacionId });
  return { ok: true as const };
});
