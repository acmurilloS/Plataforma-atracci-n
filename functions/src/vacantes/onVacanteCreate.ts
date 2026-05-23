import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';

function formatearConsecutivo(empresa: string, sede: string, anio: number, numero: number): string {
  return `${empresa}-${sede}-${anio}-${String(numero).padStart(4, '0')}`;
}

export const onVacanteCreate = onDocumentCreated(
  { document: 'vacantes/{vacanteId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();

    if (typeof data.consecutivo === 'string' && data.consecutivo.length > 0) {
      return;
    }

    const empresa = String(data.empresa_codigo ?? '');
    const sede = String(data.sede_codigo ?? '');
    if (!empresa || !sede) {
      logger.error('Vacante sin empresa_codigo o sede_codigo', { id: snap.id });
      return;
    }

    const creadoEn = data.creado_en?.toDate?.() ?? new Date();
    const anio = creadoEn.getFullYear();
    const contadorId = `${empresa}_${sede}_${anio}`;
    const contadorRef = db.collection('contadores').doc(contadorId);

    try {
      const numero = await db.runTransaction(async (tx) => {
        const doc = await tx.get(contadorRef);
        const current = doc.exists ? Number(doc.data()?.ultimo_numero ?? 0) : 0;
        const next = current + 1;
        if (doc.exists) {
          tx.update(contadorRef, {
            ultimo_numero: next,
            actualizado_en: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(contadorRef, {
            id: contadorId,
            empresa_codigo: empresa,
            sede_codigo: sede,
            anio,
            ultimo_numero: next,
            creado_en: FieldValue.serverTimestamp(),
            actualizado_en: FieldValue.serverTimestamp(),
          });
        }
        return next;
      });

      const consecutivo = formatearConsecutivo(empresa, sede, anio, numero);
      await snap.ref.update({
        consecutivo,
        actualizado_en: FieldValue.serverTimestamp(),
      });

      await db.collection('eventos').add({
        tipo: 'vacante.consecutivo_asignado',
        entidad_tipo: 'vacante',
        entidad_id: snap.id,
        vacante_id: snap.id,
        autor_uid: 'system',
        autor_rol: 'system',
        payload: { consecutivo, numero },
        creado_en: FieldValue.serverTimestamp(),
      });

      logger.info('Consecutivo asignado', { vacante_id: snap.id, consecutivo });
    } catch (err) {
      logger.error('Error asignando consecutivo', { vacante_id: snap.id, err: String(err) });
    }
  },
);
