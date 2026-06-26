import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';

/**
 * onPostulacionEnExamenes · paso 15 (raíz).
 *
 * Asegura que exista la solicitud `examenes_medicos/examen_{postulacion_id}`
 * cuando una postulación ENTRA al estado `en_examenes_medicos`, sin importar el
 * camino: aprobación del líder en TernaPage O un cambio de estado manual.
 *
 * Antes la solicitud se creaba SOLO dentro de TernaPage.aprobar(), así que si el
 * estado se ponía por otra vía el flujo quedaba muerto: el candidato no salía en
 * el paso 15, los gestores no recibían la orden y el paso 16 no tenía qué enviar.
 *
 * Id determinístico (`examen_{id}`) + transacción set-if-not-exists → idempotente
 * (no duplica si un reintento del trigger ya la creó). La creación dispara
 * onExamenMedicoCreate, que manda el correo a los gestores SST.
 */
export const onPostulacionEnExamenes = onDocumentUpdated(
  { document: 'postulaciones/{id}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    const estadoNuevo = String(after.estado ?? '');
    if (String(before?.estado ?? '') === estadoNuevo) return; // sin cambio de estado
    if (estadoNuevo !== 'en_examenes_medicos') return;

    const postId = event.params.id;
    const examenRef = db.collection('examenes_medicos').doc(`examen_${postId}`);

    // Snapshot autosuficiente (igual al que armaba TernaPage). Empresa/unidad/sede
    // y, como respaldo, cargo/consecutivo salen de la vacante.
    const vacanteId = String(after.vacante_id ?? '');
    let empresaNombre = '';
    let empresaCodigo = '';
    let unidadNombre = '';
    let sedeNombre = '';
    let sedeCodigo = '';
    let cargoNombre = String(after.cargo_nombre ?? '');
    let consecutivo = String(after.vacante_consecutivo ?? '');
    let procesoId = String(after.proceso_id ?? '');
    try {
      if (vacanteId) {
        const v = await db.collection('vacantes').doc(vacanteId).get();
        if (v.exists) {
          const vd = v.data() ?? {};
          empresaNombre = String(vd.empresa_nombre ?? '');
          empresaCodigo = String(vd.empresa_codigo ?? '');
          unidadNombre = String(vd.unidad_nombre ?? '');
          sedeNombre = String(vd.sede_nombre ?? '');
          sedeCodigo = String(vd.sede_codigo ?? '');
          if (!cargoNombre) cargoNombre = String(vd.cargo_nombre ?? '');
          if (!consecutivo) consecutivo = String(vd.consecutivo ?? '');
          if (!procesoId) procesoId = String(vd.proceso_activo_id ?? '');
        }
      }
    } catch (e) {
      logger.warn('onPostulacionEnExamenes · no se pudo leer la vacante', {
        post_id: postId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await db.runTransaction(async (tx) => {
        // Idempotencia POR CONTENIDO (no solo por id): si ya existe CUALQUIER
        // examen para esta postulación —incluyendo los legacy con id
        // auto-generado de la TernaPage vieja— no creamos otro. Evita duplicados
        // si el candidato re-entra a en_examenes_medicos.
        const previos = await tx.get(
          db.collection('examenes_medicos').where('postulacion_id', '==', postId).limit(1),
        );
        if (!previos.empty) return;
        tx.set(examenRef, {
          postulacion_id: postId,
          candidato_id: String(after.candidato_id ?? ''),
          vacante_id: vacanteId,
          proceso_id: procesoId,
          candidato_nombre: String(after.candidato_nombre ?? ''),
          cargo_nombre: cargoNombre,
          vacante_consecutivo: consecutivo,
          empresa_codigo: empresaCodigo,
          empresa_nombre: empresaNombre,
          unidad_nombre: unidadNombre,
          sede_codigo: sedeCodigo,
          sede_nombre: sedeNombre,
          solicitada_en: FieldValue.serverTimestamp(),
          // Sin uid humano (lo dispara el estado). El acuse de ordenGestores cae
          // al analista de la vacante, no a este campo.
          solicitada_por_uid: '',
          orden_url: null,
          enviada_al_candidato_en: null,
          centro_medico: null,
          orden_direccion: null,
          orden_instrucciones: null,
          concepto_recibido_en: null,
          concepto_url: null,
          apto: null,
          recomendaciones: null,
          estado: 'solicitada',
          creado_en: FieldValue.serverTimestamp(),
          creado_por: 'system_estado',
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: 'system_estado',
        });
      });
      logger.info('onPostulacionEnExamenes · solicitud de examen asegurada', { post_id: postId });
    } catch (e) {
      logger.error('onPostulacionEnExamenes · no se pudo crear la solicitud de examen', {
        post_id: postId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  },
);
