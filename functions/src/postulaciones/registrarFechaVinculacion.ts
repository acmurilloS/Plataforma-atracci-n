import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * registrarFechaVinculacion · reu Karen 27-ago. Al registrar la FECHA DE
 * VINCULACIÓN del candidato, el proceso debe CERRARSE automáticamente (antes solo
 * cerraba cuando GH aprobaba la carpeta, que a veces se demora y la vacante seguía
 * "abierta"). Registrar la fecha de vinculación = la persona ya está contratada.
 *
 * Hace lo mismo que `aprobarCarpeta` pero disparado por la fecha: en una
 * transacción marca la postulación `contratado` + cierra la vacante, con la misma
 * guarda de unicidad (no puede haber 2 contratados en una vacante). Es idempotente:
 * si ya está contratado, solo actualiza la fecha. Cuando GH apruebe la carpeta
 * DESPUÉS, `aprobarCarpeta` verá `contratado` y reconciliará sin chocar.
 *
 * Las reglas de Firestore impiden setear `contratado` desde el cliente, así que
 * esta callable (Admin SDK) es el único camino; el trigger `onCandidatoContratado`
 * (conexión/dotación) se dispara igual al detectar `contratado`.
 */

const ROLES = ['analista', 'coordinador', 'gh', 'admin'];
const EDITABLES = ['en_contratacion', 'contratado'];

export const registrarFechaVinculacion = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!ROLES.includes(rol ?? '')) {
    throw new HttpsError('permission-denied', 'Rol no autorizado.');
  }
  const uid = req.auth.uid;

  const postId = String(req.data?.postulacion_id ?? '').trim();
  const fechaIso = String(req.data?.fecha ?? '').trim(); // 'YYYY-MM-DD'
  if (!postId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
    throw new HttpsError('invalid-argument', 'Fecha inválida (usa YYYY-MM-DD).');
  }
  const fechaTs = Timestamp.fromDate(new Date(`${fechaIso}T12:00:00`));

  const resultado = await db.runTransaction(async (tx) => {
    // ── Lecturas primero ──────────────────────────────────────────────────
    const postRef = db.collection('postulaciones').doc(postId);
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw new HttpsError('not-found', 'La postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const estado = String(post.estado ?? '');
    if (!EDITABLES.includes(estado)) {
      throw new HttpsError(
        'failed-precondition',
        'Solo se registra la fecha de vinculación de un candidato en contratación.',
      );
    }

    const vacanteId = String(post.vacante_id ?? '');
    const vacRef = vacanteId ? db.collection('vacantes').doc(vacanteId) : null;
    const vacSnap = vacRef ? await tx.get(vacRef) : null;
    const vac = vacSnap && vacSnap.exists ? (vacSnap.data() as Record<string, unknown>) : null;

    // Otros contratados en la misma vacante (defensa de unicidad).
    let hayOtroContratado = false;
    if (vacanteId) {
      const otras = await tx.get(
        db
          .collection('postulaciones')
          .where('vacante_id', '==', vacanteId)
          .where('estado', '==', 'contratado'),
      );
      hayOtroContratado = otras.docs.some((d) => d.id !== postId);
    }

    const ahora = FieldValue.serverTimestamp();
    const patchPost: Record<string, unknown> = {
      fecha_vinculacion: fechaTs,
      fecha_vinculacion_registrada_por: uid,
      fecha_vinculacion_registrada_en: ahora,
      actualizado_en: ahora,
      actualizado_por: uid,
    };

    // Ya contratado → solo actualiza la fecha (y asegura vacante cerrada).
    if (estado === 'contratado') {
      tx.update(postRef, patchPost);
      if (vac && vacRef && vac.estado !== 'cerrada') {
        tx.update(vacRef, { estado: 'cerrada', cerrada_en: ahora, actualizado_en: ahora, actualizado_por: uid });
      }
      return { vacanteId, cerroAhora: false, yaContratado: true };
    }

    // en_contratacion → contratar + cerrar. Unicidad: nadie más contratado / cerrada.
    if ((vac && vac.estado === 'cerrada') || hayOtroContratado) {
      throw new HttpsError(
        'failed-precondition',
        'Ya hay un candidato contratado en esta vacante. Solo puede quedar uno.',
      );
    }
    tx.update(postRef, {
      ...patchPost,
      estado: 'contratado',
      ultima_transicion_estado: ahora,
      'marcas.contratado_en': ahora,
    });
    if (vac && vacRef) {
      tx.update(vacRef, { estado: 'cerrada', cerrada_en: ahora, actualizado_en: ahora, actualizado_por: uid });
    }
    return { vacanteId, cerroAhora: !!vac, yaContratado: false };
  });

  await db.collection('eventos').add({
    tipo: 'fecha_vinculacion_registrada',
    postulacion_id: postId,
    vacante_id: resultado.vacanteId,
    fecha_vinculacion: fechaIso,
    cerro_vacante: resultado.cerroAhora,
    ya_contratado: resultado.yaContratado,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: uid,
  });

  logger.info('[registrarFechaVinculacion]', { postId, fechaIso, ...resultado });
  return { ok: true as const, cerroVacante: resultado.cerroAhora, yaContratado: resultado.yaContratado };
});
