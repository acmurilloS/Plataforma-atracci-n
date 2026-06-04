import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * Karen confirma que copió y pegó las invitaciones. El doc en
 * `referidos_generaciones/{id}` queda marcado para que la UI muestre
 * "Invitaciones enviadas hace X · regenerar".
 *
 * Es idempotente: si se llama dos veces, mantiene el primer timestamp.
 */
export const marcarComoEnviadasReferidos = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const generacionId = String(req.data?.generacion_id ?? '');
    if (!generacionId) {
      throw new HttpsError('invalid-argument', 'Falta generacion_id.');
    }

    const ref = db.collection('referidos_generaciones').doc(generacionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Generación no existe.');
    }

    const data = snap.data() as Record<string, unknown>;
    if (data.marcada_como_enviada === true) {
      // Ya estaba marcada — devolvemos OK sin tocar el timestamp original.
      return { ok: true as const, ya_estaba_marcada: true };
    }

    const ahora = Timestamp.now();
    await ref.update({
      marcada_como_enviada: true,
      marcada_enviada_en: ahora,
      marcada_enviada_por_uid: req.auth.uid,
      actualizado_en: ahora,
      actualizado_por: req.auth.uid,
    });

    await db.collection('eventos').add({
      tipo: 'referidos_marcadas_enviadas',
      generacion_id: generacionId,
      vacante_id: data.vacante_id ?? null,
      marcada_por_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { ok: true as const, ya_estaba_marcada: false };
  },
);
