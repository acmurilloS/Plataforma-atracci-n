import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * revocarPortalCandidato · cierra el enlace del portal del candidato.
 *
 * El analista puede revocar el portal (p. ej. cuando el candidato ya terminó de
 * firmar/aceptar, o si el proceso se cae), cerrando la ventana del bearer-token.
 * Marca revocado=true en el token; el resolver y las callables de escritura lo
 * rechazan (helper tokenVigente). Se puede reabrir con "Reenviar portal".
 */
export const revocarPortalCandidato = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
    throw new HttpsError('permission-denied', 'Rol no autorizado.');
  }
  const postulacionId = String(req.data?.postulacion_id ?? '').trim();
  if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

  const postRef = db.collection('postulaciones').doc(postulacionId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
  const token = String(postSnap.data()?.portal_token ?? '').trim();
  if (!token) {
    throw new HttpsError('failed-precondition', 'Esta postulación no tiene portal activo.');
  }

  await db.collection('portal_candidato_tokens').doc(token).set(
    { revocado: true, revocado_en: FieldValue.serverTimestamp(), revocado_por: req.auth.uid },
    { merge: true },
  );
  await postRef.update({ portal_revocado_en: FieldValue.serverTimestamp() });

  logger.info('[portal] token revocado', { postulacionId, token });
  return { ok: true as const };
});
