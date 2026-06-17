import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * aceptarCondicionesLaborales · E (lote GH 16-jun).
 *
 * El candidato acepta, desde su portal público, las condiciones laborales que le
 * envió el analista. Guarda la aceptación (fecha + evidencia) en la postulación.
 */
export const aceptarCondicionesLaborales = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');

  const tSnap = await db.collection('portal_candidato_tokens').doc(token).get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const postId = String((tSnap.data() as Record<string, unknown>).postulacion_id ?? '');
  if (!postId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  const postRef = db.collection('postulaciones').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
  const pd = postSnap.data() as Record<string, unknown>;
  if (!pd.condiciones_enviadas_en) {
    throw new HttpsError('failed-precondition', 'Aún no te han enviado las condiciones.');
  }
  if (pd.condiciones_aceptadas_en) {
    return { ok: true as const, yaAceptado: true }; // idempotente: no pisa la aceptación
  }

  const raw = req.rawRequest as unknown as {
    ip?: string;
    headers?: Record<string, string | undefined>;
  };
  const ip = String(raw?.ip ?? '').slice(0, 64);
  const ua = String(raw?.headers?.['user-agent'] ?? '').slice(0, 256);

  await postRef.update({
    condiciones_aceptadas_en: FieldValue.serverTimestamp(),
    condiciones_aceptadas_evidencia: { ip, user_agent: ua, via: 'portal_candidato' },
  });
  await db.collection('eventos').add({
    tipo: 'condiciones_laborales_aceptadas',
    postulacion_id: postId,
    evidencia_ip: ip,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  logger.info('[condiciones] aceptadas en portal', { postId });
  return { ok: true as const };
});
