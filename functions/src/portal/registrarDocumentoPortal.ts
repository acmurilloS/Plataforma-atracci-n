import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { verificarCedula } from './verificarCedula';
import { urlPortalDocValida } from './urlPortalDocValida';

/**
 * registrarDocumentoPortal · registra un documento que el candidato subió desde
 * su portal público (`/portal/{token}`).
 *
 * El archivo se sube a Storage desde el cliente (auth anónima) y esta callable
 * deja el registro en `documentos_portal/{id}`, que el analista ve en la pestaña
 * Documentos de la postulación. Callable pública: el portador del token es el
 * candidato (el link llegó a su correo). Igual que la subida a la carpeta real,
 * revalida la cédula (2º factor) antes de escribir.
 */
export const registrarDocumentoPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const cedula = String(req.data?.cedula ?? '').trim();
  const nombreArchivo = String(req.data?.nombre_archivo ?? '').trim().slice(0, 160);
  const url = String(req.data?.url ?? '').trim();

  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');
  if (!nombreArchivo) throw new HttpsError('invalid-argument', 'Falta el nombre del archivo.');
  // Solo aceptamos URLs de Storage que apunten al propio path del token
  // (portal_docs/{token}/…), para que nadie registre un enlace externo ni el de
  // otro token.
  if (!urlPortalDocValida(url, token)) {
    throw new HttpsError('invalid-argument', 'URL del archivo inválida.');
  }

  const tokenRef = db.collection('portal_candidato_tokens').doc(token);
  const tSnap = await tokenRef.get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
  if (!tokenVigente(t)) {
    throw new HttpsError(
      'failed-precondition',
      'El enlace expiró o fue revocado. Pídele al equipo de Atracción que te reenvíe tu portal.',
    );
  }

  // 2º factor obligatorio para escribir (verificación transaccional).
  const ced = await verificarCedula(tokenRef, cedula);
  if (!ced.ok) {
    if (ced.bloqueado) {
      throw new HttpsError('resource-exhausted', 'Demasiados intentos. Intenta de nuevo más tarde.');
    }
    throw new HttpsError('permission-denied', 'Verifica tu número de cédula para continuar.');
  }

  const postulacionId = String(t.postulacion_id ?? '');
  if (!postulacionId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  await db.collection('documentos_portal').add({
    postulacion_id: postulacionId,
    candidato_id: t.candidato_id ?? null,
    nombre_archivo: nombreArchivo,
    url,
    via: 'portal_candidato',
    subido_en: FieldValue.serverTimestamp(),
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  await db.collection('eventos').add({
    tipo: 'documento_portal_subido',
    postulacion_id: postulacionId,
    nombre_archivo: nombreArchivo,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  logger.info('[portal] documento subido', { postulacionId, nombreArchivo });
  return { ok: true as const };
});
