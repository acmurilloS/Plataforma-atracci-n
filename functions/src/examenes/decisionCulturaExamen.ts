import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { crearNotificacionExamen, destinatariosExamen } from './notificarExamen';

// Decide la novedad: don Diego / Paola (rol gh) + coordinación + admin.
const ROLES_DECIDE = ['gh', 'coordinador', 'admin'];

/**
 * decisionCulturaExamen · cuando un examen quedó `en_revision_cd` (con novedad),
 * don Diego (Cultura y Desarrollo) marca en la plataforma si la contratación
 * CONTINÚA o NO CONTINÚA (reu Karen 09-jul). Este es el único camino para
 * resolver una novedad — el gestor no decide, y GH ya no puentea con el viejo
 * botón apto/no-apto.
 *
 *  - continua   → estado 'apto', postulación a `en_contratacion`, vacante igual.
 *  - no_continua→ estado 'no_apto', postulación a `descartado_examenes_medicos`
 *    + denormaliza `no_apto_medico` al candidato (fuera del pool).
 */
export const decisionCulturaExamen = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const rol = String(req.auth.token.rol ?? '');
  if (!ROLES_DECIDE.includes(rol)) {
    throw new HttpsError('permission-denied', 'Solo Cultura y Desarrollo decide la novedad.');
  }
  const uid = req.auth.uid;

  const examenId = String(req.data?.examen_id ?? '').trim();
  const decision = String(req.data?.decision ?? '').trim();
  const observaciones = String(req.data?.observaciones ?? '').trim().slice(0, 2000);
  if (!examenId) throw new HttpsError('invalid-argument', 'Falta examen_id.');
  if (decision !== 'continua' && decision !== 'no_continua') {
    throw new HttpsError('invalid-argument', 'Marca "continúa" o "no continúa".');
  }

  const exRef = db.collection('examenes_medicos').doc(examenId);
  const exSnap = await exRef.get();
  if (!exSnap.exists) throw new HttpsError('not-found', 'La solicitud de exámenes no existe.');
  const ex = exSnap.data() as Record<string, unknown>;
  if (String(ex.estado ?? '') !== 'en_revision_cd') {
    throw new HttpsError('failed-precondition', 'Este examen no está en revisión de C&D.');
  }

  const postId = String(ex.postulacion_id ?? '');
  const vacanteId = String(ex.vacante_id ?? '');
  const candidatoId = String(ex.candidato_id ?? '');
  const candidatoNombre = String(ex.candidato_nombre ?? '') || '(integrante)';
  const consecutivo = String(ex.vacante_consecutivo ?? '');
  const ahora = FieldValue.serverTimestamp();
  const continua = decision === 'continua';

  // Transacción: re-valida que el examen siga 'en_revision_cd' (anti doble-submit)
  // y solo transiciona la postulación/vacante si la postulación sigue en
  // 'en_examenes_medicos' (no resucita una que ya desistió). Examen + postulación
  // + vacante quedan atómicos.
  await db.runTransaction(async (tx) => {
    const exFresh = await tx.get(exRef);
    if (String(exFresh.data()?.estado ?? '') !== 'en_revision_cd') {
      throw new HttpsError('failed-precondition', 'Este examen ya fue resuelto.');
    }
    const postRef = postId ? db.collection('postulaciones').doc(postId) : null;
    const postSnap = postRef ? await tx.get(postRef) : null;
    const postEnExamenes =
      !!postSnap && String(postSnap.data()?.estado ?? '') === 'en_examenes_medicos';

    tx.update(exRef, {
      estado: continua ? 'apto' : 'no_apto',
      apto: continua,
      decision_cd: decision,
      decision_cd_por: uid,
      decision_cd_en: ahora,
      decision_cd_obs: observaciones || null,
      actualizado_en: ahora,
      actualizado_por: uid,
    });
    if (postRef && postEnExamenes) {
      tx.update(postRef, {
        estado: continua ? 'en_contratacion' : 'descartado_examenes_medicos',
        ultima_transicion_estado: ahora,
        [`marcas.${continua ? 'apto_medico_en' : 'descartado_examenes_medicos_en'}`]: ahora,
      });
      if (continua && vacanteId) {
        tx.update(db.collection('vacantes').doc(vacanteId), { estado: 'en_contratacion' });
      }
    }
  });

  if (!continua && candidatoId) {
    // no_apto médico → denormaliza al candidato (mismo shape que
    // actualizarResultadoCandidato del cliente): lo saca del pool futuro.
    try {
      await db.collection('candidatos').doc(candidatoId).update({
        resultado_ultima_postulacion: 'no_apto_medico',
        fecha_ultima_postulacion: ahora,
        ultima_vacante_id: vacanteId,
        ultima_vacante_consecutivo: consecutivo,
        apto_para_pool_futuro: false,
        motivo_no_apto_pool: 'No apto en exámenes médicos',
        actualizado_en: ahora,
        actualizado_por: req.auth.uid,
      });
    } catch (e) {
      logger.warn('[decisionCulturaExamen] no se pudo denormalizar el candidato', {
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    await db.collection('eventos').add({
      tipo: continua ? 'examen.cd_continua' : 'examen.cd_no_continua',
      entidad_tipo: 'examen_medico',
      entidad_id: examenId,
      vacante_id: vacanteId,
      postulacion_id: postId,
      autor_uid: req.auth.uid,
      autor_rol: rol,
      creado_en: ahora,
      creado_por: req.auth.uid,
    });
  } catch (e) {
    logger.warn('[decisionCulturaExamen] no se pudo registrar el evento', {
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  const dests = await destinatariosExamen(vacanteId);
  for (const uid of dests) {
    await crearNotificacionExamen({
      destinatario_uid: uid,
      tipo: 'examen_decision_cd',
      titulo: continua
        ? 'C&D aprobó: continúa la contratación'
        : 'C&D: no continúa por examen médico',
      mensaje: `${candidatoNombre}${consecutivo ? ` (${consecutivo})` : ''}: Cultura y Desarrollo decidió ${
        continua ? 'CONTINUAR → en contratación.' : 'NO continuar → descartado.'
      }`,
      link: '/examenes-medicos',
    });
  }

  return { ok: true as const, estado: continua ? 'apto' : 'no_apto' };
});
