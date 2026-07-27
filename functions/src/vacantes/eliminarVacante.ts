import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * eliminarVacante · SOLO admin. Borra una vacante y TODO lo que cuelga de ella
 * (postulaciones, procesos, carpetas, documentos, entrevistas, exámenes,
 * informes, decisiones, solicitudes, novedades, notificaciones, tickets). NO
 * borra los `candidatos` (son el pool cross-vacante) — sólo sus postulaciones a
 * ESTA vacante; el candidato queda disponible para reubicarse.
 *
 * Guard anti-borrado accidental: el cliente debe confirmar el `consecutivo`. Si
 * no coincide con el de la vacante, se rechaza. Registra un evento append-only
 * en `eventos` con los conteos (quién borró qué y cuándo).
 *
 * `allow delete` de vacantes en firestore.rules = false → esta callable
 * (Admin SDK) es la ÚNICA vía de borrado, incluso para un admin.
 */

// Colecciones que denormalizan `vacante_id`.
const COLS_POR_VACANTE = [
  'postulaciones',
  'procesos',
  'carpetas_digitales',
  'documentos_candidato',
  'entrevistas',
  'examenes_medicos',
  'informes',
  'decisiones',
  'solicitudes_integrante',
  'vacante_novedades',
  'notificaciones',
  'tickets_conexion',
];

// Satélites que sólo referencian la postulación (por si algún doc no trae
// vacante_id denormalizado). Se consultan por cada postulación de la vacante.
const COLS_POR_POSTULACION = [
  'documentos_candidato',
  'entrevistas',
  'examenes_medicos',
  'informes',
  'decisiones',
  'carpetas_digitales',
  'notificaciones',
  'tickets_conexion',
  'referencias',
  'pruebas',
];

export const eliminarVacante = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const rol = String((req.auth.token as Record<string, unknown>).rol ?? '');
  if (rol !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador puede eliminar una vacante.');
  }

  const vacanteId = String(req.data?.vacante_id ?? '').trim();
  const confirmar = String(req.data?.confirmar_consecutivo ?? '').trim();
  if (!vacanteId) throw new HttpsError('invalid-argument', 'Falta la vacante.');

  const vacRef = db.collection('vacantes').doc(vacanteId);
  const vacSnap = await vacRef.get();
  if (!vacSnap.exists) throw new HttpsError('not-found', 'La vacante no existe.');
  const vac = vacSnap.data() as Record<string, unknown>;
  const consecutivo = String(vac.consecutivo ?? '');

  // Guard: si la vacante tiene consecutivo, el confirmado debe calzar exacto.
  if (consecutivo && confirmar !== consecutivo) {
    throw new HttpsError(
      'failed-precondition',
      'El consecutivo de confirmación no coincide con la vacante.',
    );
  }

  // Reunir todas las refs a borrar (union por ruta, sin duplicar).
  const refs = new Map<string, DocumentReference>();
  const add = (r: DocumentReference) => refs.set(r.path, r);

  const postIds: string[] = [];
  for (const col of COLS_POR_VACANTE) {
    const snap = await db.collection(col).where('vacante_id', '==', vacanteId).get();
    snap.forEach((d) => {
      add(d.ref);
      if (col === 'postulaciones') postIds.push(d.id);
    });
  }
  for (const postId of postIds) {
    for (const col of COLS_POR_POSTULACION) {
      const snap = await db.collection(col).where('postulacion_id', '==', postId).get();
      snap.forEach((d) => add(d.ref));
    }
  }

  const total = refs.size;
  const all = [...refs.values()];
  // Lotes de 400 (límite de batch = 500).
  for (let i = 0; i < all.length; i += 400) {
    const batch = db.batch();
    all.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  // La vacante al final (así, si algo falla antes, la vacante sigue existiendo).
  await vacRef.delete();

  // Auditoría append-only.
  await db.collection('eventos').add({
    tipo: 'vacante_eliminada_admin',
    entidad_tipo: 'vacante',
    entidad_id: vacanteId,
    autor_uid: req.auth.uid,
    autor_rol: 'admin',
    payload: {
      consecutivo,
      cargo: String(vac.cargo_nombre ?? ''),
      docs_borrados: total,
      postulaciones: postIds.length,
    },
    creado_en: FieldValue.serverTimestamp(),
  });

  logger.info('eliminarVacante', { vacanteId, consecutivo, total, por: req.auth.uid });
  return {
    ok: true as const,
    consecutivo,
    docs_borrados: total,
    postulaciones: postIds.length,
  };
});
