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
 * El proceso de origen se CIERRA del todo (reu Karen 10-sep: la carpeta vieja de
 * un repostulado de CU-BOG-1240 le quedó a GH en Carpetas al 92% sin poderse
 * aprobar, y su portal seguía abierto):
 *  - sus carpetas_digitales no aprobadas pasan a 'anulada' (con anulada_motivo y
 *    reemplazada_por_postulacion_id) → GH no las aprueba ni van a Drive;
 *  - si tenía portal, el token queda REVOCADO (revocado_motivo 'repostulado') →
 *    el candidato ya no sube documentos al proceso viejo.
 * Los documentos NO se copian: la postulación destino arma su propia carpeta
 * (y recibe su propio portal) cuando llegue a esa etapa.
 *
 * Permisos: analista / coordinador / admin (el líder y GH no repostulan).
 *
 * Integridad: el chequeo de doble repostulación, la validación del estado de
 * origen y TODAS las escrituras (destino, origen, candidato, carpetas y token)
 * corren dentro de UNA transacción, con todas las lecturas antes de la primera
 * escritura → ni se duplica el candidato en el destino por concurrencia, ni se
 * puede repostular (y así destruir) un proceso ya 'contratado' o 'repostulado',
 * ni queda viva la carpeta o el portal de un proceso que ya se movió.
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

  const resultado = await db.runTransaction(async (tx) => {
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

    // Carpetas del proceso de origen (última lectura, antes de escribir). Se anulan
    // abajo; una 'aprobada' implicaría un contratado (ya bloqueado arriba) y una
    // 'anulada' ya tiene su traza → esas dos no se tocan.
    const carpetasSnap = await tx.get(
      db.collection('carpetas_digitales').where('postulacion_id', '==', origenId),
    );
    const carpetasAAnular = carpetasSnap.docs.filter((d) => {
      const estado = String(d.data().estado ?? '');
      return estado !== 'aprobada' && estado !== 'anulada';
    });
    const portalToken = String(origen.portal_token ?? '').trim();

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

    // 2) Origen: queda repostulado, con traza de a dónde se movió. Si tenía portal,
    //    portal_revocado_en hace que la UI lo muestre revocado (ver paso 5).
    tx.update(origenRef, {
      estado: 'repostulado',
      repostulado_a_vacante_id: destinoVacanteId,
      repostulado_a_vacante_consecutivo: consecutivoDestino,
      'marcas.repostulado_en': ahora,
      ultima_transicion_estado: ahora,
      ...(portalToken ? { portal_revocado_en: ahora } : {}),
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

    // 4) Carpetas del origen: anuladas, con traza de la postulación que la reemplaza.
    //    CarpetasPage deja de ofrecerlas y aprobarCarpeta / el depósito a Drive las
    //    rechazan.
    const motivoAnulacion = `Repostulado a ${consecutivoDestino || 'otra vacante'}`;
    for (const c of carpetasAAnular) {
      tx.update(c.ref, {
        estado: 'anulada',
        anulada_motivo: motivoAnulacion,
        reemplazada_por_postulacion_id: nuevaRef.id,
        anulada_en: ahora,
        actualizado_en: ahora,
        actualizado_por: req.auth!.uid,
      });
    }

    // 5) Portal del origen: revocado con el mismo formato que revocarPortalCandidato
    //    + motivo. "Reenviar portal" no lo reabre: enviarPortalCandidato rechaza
    //    postulaciones terminales.
    if (portalToken) {
      tx.set(
        db.collection('portal_candidato_tokens').doc(portalToken),
        {
          revocado: true,
          revocado_en: ahora,
          revocado_por: req.auth!.uid,
          revocado_motivo: 'repostulado',
        },
        { merge: true },
      );
    }

    return {
      nuevaPostulacionId: nuevaRef.id,
      carpetasAnuladas: carpetasAAnular.length,
      portalRevocado: Boolean(portalToken),
    };
  });

  logger.info('repostularCandidato', {
    origen: origenId,
    destino: destinoVacanteId,
    carpetas_anuladas: resultado.carpetasAnuladas,
    portal_revocado: resultado.portalRevocado,
    por: req.auth.uid,
  });
  return {
    ok: true as const,
    nueva_postulacion_id: resultado.nuevaPostulacionId,
    vacante_destino_consecutivo: consecutivoDestino,
  };
});
