import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';

/**
 * onEntrevistaLiderDetieneReloj · el líder dio fecha (punto 7).
 *
 * Al crearse una entrevista tipo 'lider' (no cancelada), detiene el reloj del
 * líder de su vacante si está corriendo. Va separado de onEntrevistaCreate a
 * propósito: ese trigger sale temprano (ya enviado, sin secretos de Gmail, sin
 * fecha) y la parada no debe depender del correo. Si esto fallara, el programador
 * vuelve a verificar las entrevistas antes de recordar o suspender.
 */
export const onEntrevistaLiderDetieneReloj = onDocumentCreated(
  { document: 'entrevistas/{id}', region: 'us-central1' },
  async (event) => {
    const e = event.data?.data();
    if (!e || e.tipo !== 'lider' || e.estado === 'cancelada') return;

    const postId = String(e.postulacion_id ?? '');
    if (!postId) return;
    // Las entrevistas no traen vacante_id: se resuelve por la postulación.
    const post = await db.collection('postulaciones').doc(postId).get();
    const vacanteId = String(post.data()?.vacante_id ?? '');
    if (!vacanteId) return;

    const vacRef = db.collection('vacantes').doc(vacanteId);
    const detuvo = await db.runTransaction(async (tx) => {
      const snap = await tx.get(vacRef);
      const reloj = snap.data()?.reloj_lider;
      if (!reloj || reloj.estado !== 'corriendo') return false;
      tx.update(vacRef, {
        'reloj_lider.estado': 'detenido',
        'reloj_lider.detenido_en': FieldValue.serverTimestamp(),
        'reloj_lider.motivo': 'entrevista_lider',
      });
      return true;
    });
    if (detuvo) {
      logger.info('[reloj líder] detenido por entrevista con el líder', {
        vacanteId,
        entrevista_id: event.params.id,
      });
    }
  },
);
