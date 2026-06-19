import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { notificarCarpetaListaValidarCore } from './notificarCarpetaListaValidarCore';

/**
 * notificarCarpetaListaValidar · C.1 (lote GH 16-jun).
 *
 * Cuando TODOS los documentos obligatorios de la carpeta del candidato ya están
 * cargados (lo detecta el tab Documentos), avisa a Gestión Humana (rol gh) que la
 * carpeta está completa y lista para validar. La lógica vive en el core
 * compartido (también lo usa el trigger de auto-armado F5).
 *
 * No manda correo directamente (lo hace onNotificacionCreate), así que no
 * necesita los secrets de Gmail.
 */
export const notificarCarpetaListaValidar = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
    throw new HttpsError('permission-denied', 'Rol no autorizado.');
  }
  const postulacionId = String(req.data?.postulacion_id ?? '').trim();
  if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

  const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
  if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');

  return notificarCarpetaListaValidarCore(postulacionId, req.auth.uid);
});
