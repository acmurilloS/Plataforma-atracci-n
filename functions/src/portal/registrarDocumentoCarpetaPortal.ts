import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { verificarCedula } from './verificarCedula';
import { urlPortalDocValida } from './urlPortalDocValida';
import { CLAVES_APORTA_CANDIDATO, ITEM_POR_CLAVE } from '../documentos/catalogoCarpeta';

/**
 * registrarDocumentoCarpetaPortal · F4.
 *
 * El candidato sube un documento desde su portal directo a un SLOT pre-etiquetado
 * de su carpeta real (`documentos_candidato`), que es la misma que ve GH en la
 * pestaña Documentos. El binario vive en Storage `portal_docs/{token}/…` (único
 * path donde el candidato anónimo puede escribir); este registro lógico apunta
 * allí y deja el slot en estado `entregado` para que GH lo verifique.
 *
 * Garantías de aislamiento:
 *  - Solo claves con `aporta_candidato:true` (los slots del candidato).
 *  - Upsert por (postulacion_id, clave): NUNCA crea duplicados ni pisa un
 *    documento ya `verificado` por GH.
 *  - 2º factor (cédula) revalidado en cada escritura.
 */
export const registrarDocumentoCarpetaPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const cedula = String(req.data?.cedula ?? '').trim();
  const clave = String(req.data?.clave ?? '').trim();
  const nombreArchivo = String(req.data?.nombre_archivo ?? '')
    .trim()
    .slice(0, 160);
  const url = String(req.data?.url ?? '').trim();
  const tamanoBytes = Number(req.data?.tamano_bytes ?? 0) || null;

  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');
  if (!clave || !CLAVES_APORTA_CANDIDATO.includes(clave)) {
    throw new HttpsError('invalid-argument', 'Documento no válido para el candidato.');
  }
  if (!nombreArchivo) throw new HttpsError('invalid-argument', 'Falta el nombre del archivo.');
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

  const item = ITEM_POR_CLAVE[clave];

  // candidato_id / nombre: preferir la postulación; fallback al snapshot del token.
  let candidatoId = String(t.candidato_id ?? '');
  let candidatoNombre = String(t.candidato_nombre ?? '');
  try {
    const p = await db.collection('postulaciones').doc(postulacionId).get();
    if (p.exists) {
      const pd = p.data() ?? {};
      candidatoId = String(pd.candidato_id ?? candidatoId);
      candidatoNombre = String(pd.candidato_nombre ?? candidatoNombre);
    }
  } catch {
    /* usar snapshot del token */
  }

  const ahora = Timestamp.now();

  // Upsert por (postulacion_id, clave): query-first para no chocar con el doc
  // que GH ya pudo haber creado a mano (id aleatorio).
  const existentes = await db
    .collection('documentos_candidato')
    .where('postulacion_id', '==', postulacionId)
    .where('clave', '==', clave)
    .limit(1)
    .get();

  if (!existentes.empty) {
    const docRef = existentes.docs[0].ref;
    const actual = existentes.docs[0].data() as Record<string, unknown>;
    if (String(actual.estado ?? '') === 'verificado') {
      // Ya lo aprobó GH: no permitir re-subir (evita reabrir algo cerrado).
      throw new HttpsError(
        'failed-precondition',
        'Este documento ya fue verificado. Si necesitas cambiarlo, contacta al equipo de Atracción.',
      );
    }
    await docRef.update({
      archivo_url: url,
      nombre_archivo: nombreArchivo,
      tamano_bytes: tamanoBytes,
      estado: 'entregado',
      fecha_entrega: ahora,
      verificado_en: null,
      verificado_por_uid: null,
      verificado_por_nombre: null,
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'candidato_portal',
    });
  } else {
    await db.collection('documentos_candidato').add({
      postulacion_id: postulacionId,
      candidato_id: candidatoId,
      candidato_nombre: candidatoNombre,
      clave,
      seccion: item?.seccion ?? 'hoja_vida',
      nombre: item?.nombre ?? clave,
      estado: 'entregado',
      archivo_url: url,
      nombre_archivo: nombreArchivo,
      tamano_bytes: tamanoBytes,
      observaciones: '',
      fecha_entrega: ahora,
      verificado_en: null,
      verificado_por_uid: null,
      verificado_por_nombre: null,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'candidato_portal',
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'candidato_portal',
    });
  }

  await db.collection('eventos').add({
    tipo: 'documento_carpeta_portal_subido',
    postulacion_id: postulacionId,
    clave,
    nombre_archivo: nombreArchivo,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  logger.info('[portal] documento de carpeta subido', { postulacionId, clave });
  return { ok: true as const };
});
