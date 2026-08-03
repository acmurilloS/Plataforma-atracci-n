import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * asignarAnalista · el STAFF (admin/coordinador) asigna MANUALMENTE la analista
 * responsable de una vacante (petición Karen/Mari, reu 26-jun). Antes quedaba
 * auto-asignada la analista que entraba a perfilar; ahora el trabajo se reparte
 * (una recluta, otra ejecuta), así que la asignación es a mano.
 *
 * - Solo admin/coordinador. Una analista NO se autoasigna vacantes ajenas: las
 *   firestore.rules bloquean cambiar analista_uid/nombre desde el cliente, por
 *   lo que esta callable (Admin SDK) es la ÚNICA vía de asignación.
 * - Reasignable: se puede volver a llamar para cambiar la analista.
 * - Auditoría: analista_asignado_por/_en en la vacante + entrada append-only en
 *   vacante_novedades + notificación a la analista asignada.
 */

const STAFF = ['admin', 'coordinador'];

export const asignarAnalista = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const tokenCaller = req.auth.token as Record<string, unknown>;
  const rolCaller = String(tokenCaller.rol ?? '');
  if (!STAFF.includes(rolCaller)) {
    throw new HttpsError('permission-denied', 'Solo admin o coordinación pueden asignar la analista.');
  }

  const vacanteId = String(req.data?.vacante_id ?? '').trim();
  const analistaUid = String(req.data?.analista_uid ?? '').trim();
  if (!vacanteId || !analistaUid) {
    throw new HttpsError('invalid-argument', 'Faltan datos (vacante o analista).');
  }

  const vacRef = db.collection('vacantes').doc(vacanteId);
  const vacSnap = await vacRef.get();
  if (!vacSnap.exists) throw new HttpsError('not-found', 'La vacante no existe.');
  const vac = vacSnap.data() as Record<string, unknown>;

  // La persona asignada debe ser staff ACTIVO (analista o coordinador/admin, que
  // también pueden llevar procesos — reu Karen 28-jul).
  const usrSnap = await db.collection('usuarios').doc(analistaUid).get();
  if (!usrSnap.exists) throw new HttpsError('not-found', 'El usuario seleccionado no existe.');
  const usr = usrSnap.data() as Record<string, unknown>;
  if (!['analista', 'coordinador', 'admin'].includes(String(usr.rol))) {
    throw new HttpsError(
      'failed-precondition',
      'Solo puedes asignar analistas, coordinación o admin.',
    );
  }
  if (usr.activo === false) {
    throw new HttpsError('failed-precondition', 'Ese usuario está inactivo.');
  }
  const analistaNombre =
    `${usr.nombre ?? ''} ${usr.apellido ?? ''}`.trim() || String(usr.email ?? '') || 'Analista';

  const anteriorUid = (vac.analista_uid as string | null) ?? null;
  const anteriorNombre = (vac.analista_nombre as string | null) ?? null;
  if (anteriorUid === analistaUid) {
    return {
      ok: true as const,
      sin_cambio: true,
      analista_uid: analistaUid,
      analista_nombre: analistaNombre,
    };
  }

  const ahora = FieldValue.serverTimestamp();

  // Asignación + auditoría + notificación TODO-O-NADA (un solo batch): así la
  // vacante nunca queda reasignada sin su entrada en la bitácora ni el aviso.
  const batch = db.batch();

  batch.update(vacRef, {
    analista_uid: analistaUid,
    analista_nombre: analistaNombre,
    analista_asignado_por: req.auth.uid,
    analista_asignado_en: ahora,
    actualizado_por: req.auth.uid,
    actualizado_en: ahora,
  });

  // Bitácora append-only de la vacante (vacante_novedades) — visible en el detalle.
  const novRef = db.collection('vacante_novedades').doc();
  batch.set(novRef, {
    id: novRef.id,
    vacante_id: vacanteId,
    vacante_consecutivo: String(vac.consecutivo ?? ''),
    tipo: 'asignacion_analista',
    motivo: anteriorNombre
      ? `Analista reasignada: ${anteriorNombre} → ${analistaNombre}.`
      : `Analista asignada: ${analistaNombre}.`,
    estado_anterior: null,
    estado_nuevo: null,
    registrado_por_nombre: String(tokenCaller.name ?? 'Staff'),
    creado_en: ahora,
    creado_por: req.auth.uid,
    actualizado_en: ahora,
    actualizado_por: req.auth.uid,
  });

  // Notificar (campana) a la analista asignada.
  const notiRef = db.collection('notificaciones').doc();
  batch.set(notiRef, {
    destinatario_uid: analistaUid,
    tipo: 'generica',
    titulo: 'Te asignaron una vacante',
    mensaje: `Quedaste como analista responsable de ${vac.cargo_nombre ?? 'una vacante'}${
      vac.consecutivo ? ` (${vac.consecutivo})` : ''
    }. Entra a gestionarla.`,
    link: `/vacantes/${vacanteId}`,
    leida: false,
    leida_en: null,
    creado_en: ahora,
    creado_por: req.auth.uid,
    actualizado_en: ahora,
    actualizado_por: req.auth.uid,
  });

  await batch.commit();

  logger.info('asignarAnalista', {
    vacante: vacanteId,
    analista: analistaUid,
    anterior: anteriorUid,
    por: req.auth.uid,
  });
  return { ok: true as const, analista_uid: analistaUid, analista_nombre: analistaNombre };
});
