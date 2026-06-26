import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * aprobarCarpeta · BUG 3 + 4 (2026-06-24).
 *
 * Aprobar la carpeta es el cierre del proceso (paso 19→20): la persona queda
 * `contratado` y la vacante pasa a `cerrada`. Antes esto lo hacía la UI con 3
 * updates sueltos, sin validar unicidad ni atomicidad. Ahora vive en una callable
 * (Admin SDK) que, dentro de una transacción:
 *
 *  - Valida server-side que NO exista otro `contratado` en la misma vacante (la
 *    vacante ya `cerrada` o cualquier otra postulación contratada lo delatan).
 *    Como la transacción LEE la vacante, dos aprobaciones concurrentes de la
 *    misma vacante chocan y solo una gana → imposible terminar con 2 contratados,
 *    incluso saltándose la UI.
 *  - Marca contratado + cierra la vacante + aprueba la carpeta de forma atómica.
 *  - Es idempotente: si la postulación ya está contratada, solo reconcilia.
 *
 * Los tickets de conexión (paso 20) NO se crean aquí: ya se crean en el paso 14
 * (terna) con `crearTicketsConexion`, con el esquema CANÓNICO (tipo, criticidad,
 * área, según herramientas_requeridas). `onCandidatoContratado` envía los correos
 * de conexión/dotación al detectar `contratado` leyendo esos tickets canónicos.
 * Las reglas Firestore impiden setear `contratado` desde el cliente, así que esta
 * callable es el único camino.
 */

const ROLES_AUTORIZADOS = ['analista', 'coordinador', 'gh', 'admin'];

export const aprobarCarpeta = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!ROLES_AUTORIZADOS.includes(rol ?? '')) {
    throw new HttpsError('permission-denied', 'Rol no autorizado para aprobar carpetas.');
  }
  const carpetaId = String(req.data?.carpeta_id ?? '').trim();
  if (!carpetaId) throw new HttpsError('invalid-argument', 'Falta carpeta_id.');

  const uid = req.auth.uid;

  const resultado = await db.runTransaction(async (tx) => {
    // ── Lecturas (todas antes de cualquier escritura) ──────────────────────
    const carpetaRef = db.collection('carpetas_digitales').doc(carpetaId);
    const carpetaSnap = await tx.get(carpetaRef);
    if (!carpetaSnap.exists) throw new HttpsError('not-found', 'La carpeta no existe.');
    const carpeta = carpetaSnap.data() as Record<string, unknown>;

    const postId = String(carpeta.postulacion_id ?? '');
    const vacanteId = String(carpeta.vacante_id ?? '');
    if (!postId || !vacanteId) {
      throw new HttpsError('failed-precondition', 'La carpeta no tiene postulación o vacante.');
    }

    const postRef = db.collection('postulaciones').doc(postId);
    const vacRef = db.collection('vacantes').doc(vacanteId);
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw new HttpsError('not-found', 'La postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;
    const vacSnap = await tx.get(vacRef);
    const vac = vacSnap.exists ? (vacSnap.data() as Record<string, unknown>) : null;

    // Defensa adicional: otras postulaciones ya contratadas en la vacante.
    const otrasSnap = await tx.get(
      db
        .collection('postulaciones')
        .where('vacante_id', '==', vacanteId)
        .where('estado', '==', 'contratado'),
    );
    const hayOtroContratado = otrasSnap.docs.some((d) => d.id !== postId);

    // ── Idempotencia: si esta postulación YA está contratada, solo reconcilia ──
    if (post.estado === 'contratado') {
      if (carpeta.estado !== 'aprobada') {
        tx.update(carpetaRef, {
          estado: 'aprobada',
          aprobada_en: FieldValue.serverTimestamp(),
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: uid,
        });
      }
      if (vac && vac.estado !== 'cerrada') {
        tx.update(vacRef, {
          estado: 'cerrada',
          cerrada_en: FieldValue.serverTimestamp(),
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: uid,
        });
      }
      return { postId, vacanteId, yaContratado: true };
    }

    // ── Unicidad: la vacante cerrada o cualquier otro contratado lo impiden ──
    if ((vac && vac.estado === 'cerrada') || hayOtroContratado) {
      throw new HttpsError(
        'failed-precondition',
        'Ya hay un candidato contratado en esta vacante. Solo puede quedar uno; descarta este o reabre el proceso.',
      );
    }

    const ahora = FieldValue.serverTimestamp();
    tx.update(postRef, {
      estado: 'contratado',
      ultima_transicion_estado: ahora,
      'marcas.contratado_en': ahora,
      actualizado_en: ahora,
      actualizado_por: uid,
    });
    if (vac) {
      tx.update(vacRef, {
        estado: 'cerrada',
        cerrada_en: ahora,
        actualizado_en: ahora,
        actualizado_por: uid,
      });
    }
    tx.update(carpetaRef, {
      estado: 'aprobada',
      aprobada_en: ahora,
      actualizado_en: ahora,
      actualizado_por: uid,
    });

    return { postId, vacanteId, yaContratado: false };
  });

  await db.collection('eventos').add({
    tipo: 'carpeta_aprobada_contratado',
    postulacion_id: resultado.postId,
    vacante_id: resultado.vacanteId,
    carpeta_id: carpetaId,
    ya_contratado: resultado.yaContratado,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: uid,
  });

  logger.info('[aprobarCarpeta] aprobada', {
    carpetaId,
    postId: resultado.postId,
    yaContratado: resultado.yaContratado,
  });

  return { ok: true as const, yaContratado: resultado.yaContratado };
});
