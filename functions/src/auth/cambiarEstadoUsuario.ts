import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * cambiarEstadoUsuario · admin-only. Activa o DESACTIVA una cuenta (reu 03-jul).
 *
 * Desactivar es real: deshabilita la cuenta de Firebase Auth (no puede volver a
 * iniciar sesión) y revoca sus tokens (cae la sesión abierta en el próximo
 * refresco), además de marcar `activo:false` en el doc `usuarios`. Reactivar
 * revierte todo. Un admin no puede desactivarse a sí mismo.
 */
export const cambiarEstadoUsuario = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  if ((req.auth.token as Record<string, unknown>).rol !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador puede activar o desactivar usuarios.');
  }

  const uid = String(req.data?.uid ?? '').trim();
  const activo = req.data?.activo === true; // estado DESTINO
  if (!uid) throw new HttpsError('invalid-argument', 'Falta el usuario.');
  if (uid === req.auth.uid && !activo) {
    throw new HttpsError('failed-precondition', 'No puedes desactivarte a ti mismo.');
  }

  try {
    await getAuth().updateUser(uid, { disabled: !activo });
    if (!activo) await getAuth().revokeRefreshTokens(uid);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('cambiarEstadoUsuario · Auth', { uid, msg });
    throw new HttpsError('internal', `No se pudo cambiar el estado en Auth: ${msg}`);
  }

  await db.collection('usuarios').doc(uid).update({
    activo,
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: req.auth.uid,
  });

  logger.info('cambiarEstadoUsuario', { uid, activo, por: req.auth.uid });
  return { ok: true as const, uid, activo };
});
