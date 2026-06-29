import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * repostularCandidato · mueve un candidato que no quedó apto en una vacante a
 * OTRA vacante activa SIN volver a registrarlo (reu 26-jun). Cada vacante es un
 * proceso separado: se COPIA la info del candidato (no se fusionan procesos).
 *
 * Resultado: el candidato queda
 *  - ACTIVO en el destino → postulación nueva (estado 'postulado' fresco),
 *    reusando el mismo candidato_id (no se duplica el candidato).
 *  - REPOSTULADO en el origen → estado 'repostulado' + traza de a qué vacante se
 *    movió (repostulado_a_vacante_id/_consecutivo).
 *
 * Permisos: analista / coordinador / admin (el líder y GH no repostulan).
 *
 * Integridad: el chequeo de doble repostulación, la validación del estado de
 * origen y las tres escrituras corren dentro de UNA transacción → ni se duplica
 * el candidato en el destino por concurrencia, ni se puede repostular (y así
 * destruir) un proceso ya 'contratado' o 'repostulado'.
 */

const ROLES = ['analista', 'coordinador', 'admin'];
// Vacantes destino que aún reciben candidatos a su pool.
const ESTADOS_DESTINO_OK = ['lista_para_publicar', 'publicada', 'en_proceso'];
// Estados de origen NO repostulables: 'contratado' protege el invariante de
// 1 contratado/vacante; 'repostulado' ya se movió. Espeja el guard de la UI.
const ESTADOS_ORIGEN_BLOQUEADOS = ['contratado', 'repostulado'];

export const repostularCandidato = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const rol = String((req.auth.token as Record<string, unknown>).rol ?? '');
  if (!ROLES.includes(rol)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para repostular candidatos.');
  }

  const origenId = String(req.data?.postulacion_origen_id ?? '').trim();
  const destinoVacanteId = String(req.data?.vacante_destino_id ?? '').trim();
  if (!origenId || !destinoVacanteId) {
    throw new HttpsError('invalid-argument', 'Faltan datos (postulación de origen o vacante destino).');
  }

  const origenRef = db.collection('postulaciones').doc(origenId);

  // Destino se lee fuera de la transacción (datos denormalizados + estado).
  const destinoSnap = await db.collection('vacantes').doc(destinoVacanteId).get();
  if (!destinoSnap.exists) throw new HttpsError('not-found', 'La vacante destino no existe.');
  const destino = destinoSnap.data() as Record<string, unknown>;
  if (!ESTADOS_DESTINO_OK.includes(String(destino.estado ?? ''))) {
    throw new HttpsError(
      'failed-precondition',
      'La vacante destino no está abierta para recibir candidatos.',
    );
  }
  const consecutivoDestino = String(destino.consecutivo ?? '');

  const nuevaPostulacionId = await db.runTransaction(async (tx) => {
    const origenSnap = await tx.get(origenRef);
    if (!origenSnap.exists) throw new HttpsError('not-found', 'La postulación de origen no existe.');
    const origen = origenSnap.data() as Record<string, unknown>;

    if (origen.vacante_id === destinoVacanteId) {
      throw new HttpsError('failed-precondition', 'El candidato ya pertenece a esa vacante.');
    }
    if (ESTADOS_ORIGEN_BLOQUEADOS.includes(String(origen.estado ?? ''))) {
      throw new HttpsError(
        'failed-precondition',
        'Este candidato ya está contratado o repostulado; no se puede mover.',
      );
    }

    const candidatoId = String(origen.candidato_id ?? '');
    if (!candidatoId) {
      throw new HttpsError('failed-precondition', 'La postulación no tiene candidato asociado.');
    }

    // Bloqueo de doble repostulación (atómico dentro de la transacción).
    const yaSnap = await tx.get(
      db
        .collection('postulaciones')
        .where('vacante_id', '==', destinoVacanteId)
        .where('candidato_id', '==', candidatoId)
        .limit(1),
    );
    if (!yaSnap.empty) {
      throw new HttpsError('already-exists', 'El candidato ya tiene una postulación en esa vacante.');
    }

    const ahora = FieldValue.serverTimestamp();
    const nuevaRef = db.collection('postulaciones').doc();

    // 1) Nueva postulación en el destino (estado 'postulado' fresco, mismo candidato).
    tx.set(nuevaRef, {
      candidato_id: candidatoId,
      proceso_id: destino.proceso_activo_id ?? null,
      vacante_id: destinoVacanteId,
      vacante_consecutivo: consecutivoDestino,
      cargo_nombre: destino.cargo_nombre ?? '',
      candidato_nombre: origen.candidato_nombre ?? '',
      candidato_email: origen.candidato_email ?? '',
      candidato_telefono: origen.candidato_telefono ?? '',
      candidato_cv_url: origen.candidato_cv_url ?? null,
      estado: 'postulado',
      cumple_criterios: null,
      fuente: origen.fuente ?? 'postulacion_directa',
      fuente_detalle: `Repostulado desde ${origen.vacante_consecutivo ?? 'otra vacante'}`,
      marcas: { postulado_en: ahora, repostulado_desde_en: ahora },
      fecha_postulacion: ahora,
      ultima_transicion_estado: ahora,
      origen_publicacion_id: null,
      motivo_descarte: null,
      razon_descarte: null,
      descarte_etapa: null,
      repostulado_a_vacante_id: null,
      repostulado_a_vacante_consecutivo: null,
      repostulacion_origen_id: origenId,
      referido_por_cedula: origen.referido_por_cedula ?? null,
      referido_por_nombre: origen.referido_por_nombre ?? null,
      referido_generacion_id: null,
      referencias_no_aplica: origen.referencias_no_aplica ?? false,
      referencias_aportadas: origen.referencias_aportadas ?? [],
      analista_uid: destino.analista_uid ?? null,
      creado_en: ahora,
      creado_por: req.auth!.uid,
      actualizado_en: ahora,
      actualizado_por: req.auth!.uid,
    });

    // 2) Origen: queda repostulado, con traza de a dónde se movió.
    tx.update(origenRef, {
      estado: 'repostulado',
      repostulado_a_vacante_id: destinoVacanteId,
      repostulado_a_vacante_consecutivo: consecutivoDestino,
      'marcas.repostulado_en': ahora,
      ultima_transicion_estado: ahora,
      actualizado_en: ahora,
      actualizado_por: req.auth!.uid,
    });

    // 3) Candidato: metadata denormalizada de su última postulación.
    tx.update(db.collection('candidatos').doc(candidatoId), {
      total_postulaciones: FieldValue.increment(1),
      ultima_vacante_id: destinoVacanteId,
      ultima_vacante_consecutivo: consecutivoDestino,
      fecha_ultima_postulacion: ahora,
      actualizado_en: ahora,
      actualizado_por: req.auth!.uid,
    });

    return nuevaRef.id;
  });

  logger.info('repostularCandidato', {
    origen: origenId,
    destino: destinoVacanteId,
    por: req.auth.uid,
  });
  return {
    ok: true as const,
    nueva_postulacion_id: nuevaPostulacionId,
    vacante_destino_consecutivo: consecutivoDestino,
  };
});
