import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';

export const onCandidatoCreate = onDocumentCreated(
  { document: 'candidatos/{candidatoId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const docTipo = data.documento_tipo as string | null;
    const docNumero = data.documento_numero as string | null;
    if (!docTipo || !docNumero) {
      return;
    }

    try {
      const existing = await db
        .collection('candidatos')
        .where('documento_tipo', '==', docTipo)
        .where('documento_numero', '==', docNumero)
        .get();

      const duplicados = existing.docs.filter((d) => d.id !== snap.id);
      if (duplicados.length > 0) {
        const canonico = duplicados[0].id;
        await snap.ref.update({
          duplicado_de: canonico,
          duplicado_detectado_en: FieldValue.serverTimestamp(),
          actualizado_en: FieldValue.serverTimestamp(),
        });

        await db.collection('eventos').add({
          tipo: 'candidato.duplicado_detectado',
          entidad_tipo: 'candidato',
          entidad_id: snap.id,
          vacante_id: null,
          autor_uid: 'system',
          autor_rol: 'system',
          payload: { nuevo: snap.id, canonico },
          creado_en: FieldValue.serverTimestamp(),
        });

        logger.warn('Candidato duplicado detectado', { id: snap.id, canonico });
      }
    } catch (err) {
      logger.error('Error en dedupe candidato', { id: snap.id, err: String(err) });
    }
  },
);
