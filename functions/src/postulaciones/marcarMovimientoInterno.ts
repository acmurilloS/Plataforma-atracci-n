import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * marcarMovimientoInterno · reu Karen sep-2026.
 *
 * Un MOVIMIENTO INTERNO es una persona que YA es empleada y solo cambia de cargo
 * (vertical = ascenso, horizontal = mismo nivel, transversal = otra área). No hay
 * que reclutarla ni evaluarla: se saltan Reclutamiento, Selección y Decisión
 * (pasos 3–14) y entra directo a la fase de Ingreso, donde solo se exige el
 * reporte de novedad / solicitud de integrante y la aceptación de condiciones;
 * exámenes, aval y conexión/dotación quedan como opcionales/manuales.
 *
 * En una transacción: marca la postulación (`movimiento_interno`) y la pasa a
 * `en_contratacion`; marca la vacante (`es_movimiento_interno` + tipo) y la salta
 * también a `en_contratacion` si venía de una fase anterior. Guarda de unicidad
 * (no puede haber otro contratado en la vacante). No dispara exámenes (esos son
 * manuales para movimientos).
 */

const ROLES = ['analista', 'coordinador', 'gh', 'admin'];
const TIPOS = ['vertical', 'horizontal', 'transversal'];
const NO_MARCABLES = [
  'contratado',
  'repostulado',
  'desistio_candidato',
  'filtrado_no_cumple',
  'pre_entrevistado_no_interesado',
  'descartado_por_lider',
  'descartado_entrevista_analista',
  'descartado_examenes_medicos',
];
const VACANTE_PREVIOS = [
  'borrador',
  'aprobada',
  'lista_para_publicar',
  'publicada',
  'en_proceso',
  'terna_enviada',
  'seleccionado',
];

export const marcarMovimientoInterno = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!ROLES.includes(rol ?? '')) throw new HttpsError('permission-denied', 'Rol no autorizado.');
  const uid = req.auth.uid;

  const postId = String(req.data?.postulacion_id ?? '').trim();
  const tipo = String(req.data?.tipo ?? '').trim();
  if (!postId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
  if (!TIPOS.includes(tipo)) throw new HttpsError('invalid-argument', 'Tipo de movimiento inválido.');

  const resultado = await db.runTransaction(async (tx) => {
    const postRef = db.collection('postulaciones').doc(postId);
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw new HttpsError('not-found', 'La postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;
    const estado = String(post.estado ?? '');
    if (NO_MARCABLES.includes(estado)) {
      throw new HttpsError('failed-precondition', 'Este candidato ya terminó su proceso; no se puede marcar.');
    }

    const vacanteId = String(post.vacante_id ?? '');
    const vacRef = vacanteId ? db.collection('vacantes').doc(vacanteId) : null;
    const vacSnap = vacRef ? await tx.get(vacRef) : null;
    const vac = vacSnap && vacSnap.exists ? (vacSnap.data() as Record<string, unknown>) : null;

    if (vacanteId) {
      const otras = await tx.get(
        db.collection('postulaciones').where('vacante_id', '==', vacanteId).where('estado', '==', 'contratado'),
      );
      if (otras.docs.some((d) => d.id !== postId)) {
        throw new HttpsError('failed-precondition', 'Ya hay un candidato contratado en esta vacante.');
      }
    }

    const ahora = FieldValue.serverTimestamp();
    tx.update(postRef, {
      'movimiento_interno.tipo': tipo,
      'movimiento_interno.marcado_en': ahora,
      'movimiento_interno.marcado_por': uid,
      estado: 'en_contratacion',
      ultima_transicion_estado: ahora,
      'marcas.en_contratacion_en': ahora,
      actualizado_en: ahora,
      actualizado_por: uid,
    });

    let vacanteSaltada = false;
    if (vac && vacRef) {
      const patchVac: Record<string, unknown> = {
        es_movimiento_interno: true,
        tipo_movimiento: vac.tipo_movimiento ?? tipo,
        actualizado_en: ahora,
        actualizado_por: uid,
      };
      if (VACANTE_PREVIOS.includes(String(vac.estado ?? ''))) {
        patchVac.estado = 'en_contratacion';
        vacanteSaltada = true;
      }
      tx.update(vacRef, patchVac);
    }
    return { vacanteId, estadoPrevio: estado, vacanteSaltada };
  });

  await db.collection('eventos').add({
    tipo: 'movimiento_interno_marcado',
    postulacion_id: postId,
    vacante_id: resultado.vacanteId,
    tipo_movimiento: tipo,
    estado_previo: resultado.estadoPrevio,
    vacante_saltada: resultado.vacanteSaltada,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: uid,
  });
  logger.info('[marcarMovimientoInterno]', { postId, tipo, ...resultado });
  return { ok: true as const, ...resultado };
});
