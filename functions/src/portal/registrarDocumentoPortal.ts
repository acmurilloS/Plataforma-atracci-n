import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * registrarDocumentoPortal · registra un documento que el candidato subió desde
 * su portal público (`/portal/{token}`).
 *
 * El archivo se sube a Storage desde el cliente (auth anónima) y esta callable
 * deja el registro en `documentos_portal/{id}`, que el analista ve en la pestaña
 * Documentos de la postulación. Callable pública: el portador del token es el
 * candidato (el link llegó a su correo).
 */
export const registrarDocumentoPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const nombreArchivo = String(req.data?.nombre_archivo ?? '').trim().slice(0, 160);
  const url = String(req.data?.url ?? '').trim();

  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');
  if (!nombreArchivo) throw new HttpsError('invalid-argument', 'Falta el nombre del archivo.');
  if (!/^https:\/\//.test(url)) {
    throw new HttpsError('invalid-argument', 'URL del archivo inválida.');
  }

  const tSnap = await db.collection('portal_candidato_tokens').doc(token).get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
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
