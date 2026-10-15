import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { avisarCondicionesCultura } from './avisarCondicionesCultura';
import {
  describirCambios,
  ErrorValidacion,
  motivosAval,
  normalizarCambios,
  textoMotivoAval,
  tomarSnapshot,
} from './condicionesSolicitud';

/**
 * Revisión de GH de una solicitud de vacante (reu Karen + Diego 08-oct).
 *
 * Antes, "Rechazar" en Aprobaciones dejaba la vacante `cancelada` desde el
 * cliente: desaparecía del tablero de coordinación, se perdía el consecutivo y
 * el líder tenía que crear otra. Ahora:
 *
 *  - `decidirSolicitudVacante` (GH / coordinación / admin): aprueba o DEVUELVE.
 *    Devolver deja la vacante en `devuelta` (no es un cierre), guarda el motivo y
 *    una foto de las condiciones, y avisa al líder y a coordinación.
 *  - `reenviarSolicitudVacante` (el líder dueño, o coordinación en su nombre):
 *    corrige las condiciones y la devuelve a `borrador` (pendiente de GH), con la
 *    lista de qué cambió. Le llega de nuevo el correo a Diego.
 *
 * Todo pasa en una transacción (estado + bitácora + avisos): nunca queda una
 * vacante devuelta sin su entrada en `vacante_novedades` ni sin el aviso.
 * `dry_run: true` responde lo que haría sin escribir nada (para verificar en prod).
 */

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const ROLES_DECIDEN = ['gh', 'coordinador', 'admin'];
/** Corrigen y reenvían EN NOMBRE del líder (como al crear "en nombre de"). */
const ROLES_CORRIGEN_POR_LIDER = ['coordinador', 'admin'];

type Notif = {
  destinatario_uid: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  solo_campana?: boolean;
};

async function nombreDe(uid: string, token: Record<string, unknown>): Promise<string> {
  try {
    const d = (await db.collection('usuarios').doc(uid).get()).data() ?? {};
    const n = `${String(d.nombre ?? '')} ${String(d.apellido ?? '')}`.trim();
    if (n) return n;
  } catch (e) {
    logger.warn('[revisionSolicitud] no se pudo leer el nombre', { uid, e: String(e) });
  }
  return String(token.name ?? token.email ?? 'Usuario');
}

/**
 * Coordinación = coordinadores + admins ACTIVOS. Karen y Mari tienen cuenta
 * admin (no hay coordinadores activos en prod): mismo criterio que los avisos de
 * exámenes (`destinatariosExamen`).
 */
async function uidsCoordinacion(): Promise<string[]> {
  const uids = new Set<string>();
  for (const rol of ['coordinador', 'admin']) {
    const snap = await db.collection('usuarios').where('rol', '==', rol).where('activo', '==', true).get();
    snap.forEach((d) => uids.add(d.id));
  }
  return [...uids];
}

function notificacionDoc(n: Notif, vacanteId: string, autor: string) {
  return {
    destinatario_uid: n.destinatario_uid,
    tipo: n.tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    link: `/vacantes/${vacanteId}`,
    vacante_id: vacanteId,
    leida: false,
    leida_en: null,
    ...(n.solo_campana ? { solo_campana: true } : {}),
    creado_en: FieldValue.serverTimestamp(),
    creado_por: autor,
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: autor,
  };
}

function etiquetaVacante(v: Record<string, unknown>): string {
  const cargo = String(v.cargo_nombre ?? '').trim() || 'la vacante';
  const consecutivo = String(v.consecutivo ?? '').trim();
  return `${cargo}${consecutivo ? ` (${consecutivo})` : ''}`;
}

export const decidirSolicitudVacante = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const uid = req.auth.uid;
  const token = req.auth.token as Record<string, unknown>;
  const rol = String(token.rol ?? '');
  if (!ROLES_DECIDEN.includes(rol)) {
    throw new HttpsError('permission-denied', 'Solo GH o coordinación pueden aprobar o devolver solicitudes.');
  }

  const vacanteId = String(req.data?.vacante_id ?? '').trim();
  const decision = String(req.data?.decision ?? '').trim();
  const nota = String(req.data?.nota ?? '').trim().slice(0, 1500);
  const dryRun = req.data?.dry_run === true;
  if (!vacanteId) throw new HttpsError('invalid-argument', 'Falta la vacante.');
  if (decision !== 'aprobar' && decision !== 'devolver') {
    throw new HttpsError('invalid-argument', 'Decisión inválida.');
  }
  if (decision === 'devolver' && nota.length < 5) {
    throw new HttpsError(
      'invalid-argument',
      'Escribe el motivo de la devolución: el líder lo necesita para corregir la solicitud.',
    );
  }

  const nombre = await nombreDe(uid, token);
  const coordinacion = decision === 'devolver' ? await uidsCoordinacion() : [];
  const ref = db.collection('vacantes').doc(vacanteId);

  const plan = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'La solicitud no existe.');
    const v = snap.data() as Record<string, unknown>;
    const estado = String(v.estado ?? '');
    if (estado !== 'borrador') {
      throw new HttpsError(
        'failed-precondition',
        estado === 'devuelta'
          ? 'Esta solicitud ya está devuelta al líder; espera a que la corrija y la reenvíe.'
          : `Esta solicitud ya fue revisada (estado actual: ${estado.replace(/_/g, ' ')}). Recarga la página.`,
      );
    }

    const etiqueta = etiquetaVacante(v);
    const consecutivo = String(v.consecutivo ?? '').trim();
    const liderUid = String(v.lider_uid ?? '').trim();
    const liderNombre = String(v.lider_nombre ?? '').trim() || 'el líder';
    const ahora = FieldValue.serverTimestamp();

    let patch: Record<string, unknown>;
    let motivoNovedad: string;
    let estadoNuevo: string;
    const notifs: Notif[] = [];

    if (decision === 'aprobar') {
      // Aval obligatorio (reu 08-oct): "una limitante para que más adelante yo
      // continúe o no". Sin el PDF no se aprueba: se devuelve para que lo adjunten.
      const motivos = motivosAval(v);
      if (motivos.length && !String(v.aval_url ?? '').trim()) {
        throw new HttpsError(
          'failed-precondition',
          `${textoMotivoAval(motivos)} y la solicitud no tiene el aval firmado. Recházala para que el líder lo adjunte.`,
        );
      }
      estadoNuevo = 'aprobada';
      patch = {
        estado: estadoNuevo,
        aval_aprobado_por: uid,
        aval_aprobado_en: ahora,
        aval_observaciones: nota || null,
        actualizado_en: ahora,
        actualizado_por: uid,
      };
      motivoNovedad = `Aprobada por ${nombre} (GH).${nota ? `\nObservaciones: ${nota}` : ''}`;
      if (liderUid) {
        notifs.push({
          destinatario_uid: liderUid,
          tipo: 'aval_aprobado',
          titulo: 'Aval aprobado · vacante lista para perfilamiento',
          mensaje: `${etiqueta} fue aprobada por ${nombre}.${nota ? ` Nota: ${nota}` : ''}`,
        });
      }
    } else {
      estadoNuevo = 'devuelta';
      patch = {
        estado: estadoNuevo,
        aval_rechazo_motivo: nota,
        devuelta_en: ahora,
        devuelta_por: uid,
        devuelta_por_nombre: nombre,
        devoluciones: FieldValue.increment(1),
        devolucion_snapshot: tomarSnapshot(v),
        actualizado_en: ahora,
        actualizado_por: uid,
      };
      motivoNovedad = `Devuelta por ${nombre} (GH) para corregir.\nMotivo: ${nota}`;
      if (liderUid) {
        notifs.push({
          destinatario_uid: liderUid,
          tipo: 'aval_rechazado',
          titulo: `Solicitud devuelta para corregir · ${consecutivo || etiqueta}`,
          mensaje:
            `${nombre} revisó ${etiqueta} y te la devolvió para que la corrijas.\n\n` +
            `Motivo: ${nota}\n\n` +
            'Entra a la plataforma, ajusta lo que te piden y usa el botón «Corregir y reenviar». ' +
            'La solicitud conserva el mismo consecutivo: no hace falta crear una vacante nueva.',
        });
      }
      // Coordinación + la analista ya asignada (si la hay): la solicitud sigue viva.
      const otros = new Set(coordinacion);
      const analista = String(v.analista_uid ?? '').trim();
      if (analista) otros.add(analista);
      otros.delete(uid);
      otros.delete(liderUid);
      for (const d of otros) {
        notifs.push({
          destinatario_uid: d,
          tipo: 'aval_rechazado',
          titulo: `GH devolvió ${consecutivo || etiqueta} al líder`,
          mensaje:
            `${nombre} devolvió ${etiqueta} a ${liderNombre} para corregir.\n\n` +
            `Motivo: ${nota}\n\n` +
            'La solicitud sigue en el tablero (fase Aprobación) con su consecutivo hasta que el líder la corrija y la reenvíe.',
        });
      }
    }

    if (!dryRun) {
      tx.update(ref, patch);
      const novRef = db.collection('vacante_novedades').doc();
      tx.set(novRef, {
        id: novRef.id,
        vacante_id: vacanteId,
        vacante_consecutivo: consecutivo,
        tipo: decision === 'aprobar' ? 'aprobacion_gh' : 'devolucion_gh',
        motivo: motivoNovedad,
        estado_anterior: estado,
        estado_nuevo: estadoNuevo,
        registrado_por_nombre: nombre,
        creado_en: ahora,
        creado_por: uid,
        actualizado_en: ahora,
        actualizado_por: uid,
      });
      for (const n of notifs) {
        tx.set(db.collection('notificaciones').doc(), notificacionDoc(n, vacanteId, uid));
      }
    }
    return {
      estado_anterior: estado,
      estado_nuevo: estadoNuevo,
      consecutivo,
      destinatarios: notifs.map((n) => n.destinatario_uid),
    };
  });

  logger.info('[revisionSolicitud] decisión', { vacanteId, decision, uid, rol, dryRun, ...plan });
  return { ok: true as const, dry_run: dryRun, ...plan };
});

export const reenviarSolicitudVacante = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    const uid = req.auth.uid;
    const token = req.auth.token as Record<string, unknown>;
    const rol = String(token.rol ?? '');

    const vacanteId = String(req.data?.vacante_id ?? '').trim();
    const nota = String(req.data?.nota ?? '').trim().slice(0, 1500);
    const dryRun = req.data?.dry_run === true;
    if (!vacanteId) throw new HttpsError('invalid-argument', 'Falta la vacante.');
    const crudos = req.data?.cambios;
    if (crudos !== undefined && (typeof crudos !== 'object' || crudos === null || Array.isArray(crudos))) {
      throw new HttpsError('invalid-argument', 'Cambios inválidos.');
    }

    let cambios: Record<string, unknown>;
    try {
      cambios = normalizarCambios((crudos ?? {}) as Record<string, unknown>);
    } catch (e) {
      if (e instanceof ErrorValidacion) throw new HttpsError('invalid-argument', e.message);
      throw e;
    }

    const nombre = await nombreDe(uid, token);
    const coordinacion = await uidsCoordinacion();
    const ref = db.collection('vacantes').doc(vacanteId);

    const plan = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'La solicitud no existe.');
      const v = snap.data() as Record<string, unknown>;

      const liderUid = String(v.lider_uid ?? '').trim();
      const esLider = liderUid === uid;
      if (!esLider && !ROLES_CORRIGEN_POR_LIDER.includes(rol)) {
        throw new HttpsError(
          'permission-denied',
          'Solo el líder que hizo la solicitud (o coordinación) puede corregirla y reenviarla.',
        );
      }
      const estado = String(v.estado ?? '');
      if (estado !== 'devuelta') {
        throw new HttpsError(
          'failed-precondition',
          estado === 'borrador'
            ? 'Esta solicitud ya fue reenviada a GH y está pendiente de revisión.'
            : 'Solo se pueden reenviar las solicitudes que GH devolvió para corregir.',
        );
      }

      const final = { ...v, ...cambios };
      // Reglas que dependen de la vacante completa (no solo de lo que llegó):
      // aval obligatorio y garantizado mayor que el básico (reu 08-oct).
      const motivos = motivosAval(final);
      if (motivos.length && !String(final.aval_url ?? '').trim()) {
        throw new HttpsError(
          'failed-precondition',
          `${textoMotivoAval(motivos)}: adjunta el aval firmado antes de reenviar.`,
        );
      }
      if (final.garantizado_total_mes != null && Number(final.garantizado_total_mes) <= Number(final.salario_base)) {
        throw new HttpsError(
          'invalid-argument',
          'El garantizado total mensual debe ser MAYOR que el salario básico (es básico + lo que se garantiza).',
        );
      }
      const antes = (v.devolucion_snapshot as Record<string, unknown> | null | undefined) ?? tomarSnapshot(v);
      const lista = describirCambios(antes, tomarSnapshot(final));
      if (lista.length === 0 && !nota) {
        throw new HttpsError(
          'failed-precondition',
          'No hay cambios: corrige lo que pidió GH o explica en la nota por qué se mantiene igual.',
        );
      }

      const etiqueta = etiquetaVacante(v);
      const consecutivo = String(v.consecutivo ?? '').trim();
      const ahora = FieldValue.serverTimestamp();
      const patch: Record<string, unknown> = {
        ...cambios,
        estado: 'borrador',
        reenviada_en: ahora,
        reenviada_por: uid,
        reenviada_por_nombre: nombre,
        reenvio_nota: nota || null,
        reenvio_cambios: lista,
        reenvios: FieldValue.increment(1),
        correo_cultura_error: null,
        actualizado_en: ahora,
        actualizado_por: uid,
      };
      const quien = esLider ? nombre : `${nombre} (coordinación, en nombre de ${String(v.lider_nombre ?? 'el líder')})`;
      const motivoNovedad =
        `Corregida por ${quien} y reenviada a GH.` +
        (lista.length ? `\nCambios: ${lista.join('; ')}` : '\nSin cambios en las condiciones.') +
        (nota ? `\nNota para GH: ${nota}` : '');

      // Coordinación (solo campana: ya la ve en el tablero) + la analista; si
      // corrigió coordinación, también el líder, para que sepa qué se envió.
      const notifs: Notif[] = [];
      const otros = new Set(coordinacion);
      const analista = String(v.analista_uid ?? '').trim();
      if (analista) otros.add(analista);
      if (!esLider && liderUid) otros.add(liderUid);
      otros.delete(uid);
      for (const d of otros) {
        notifs.push({
          destinatario_uid: d,
          tipo: 'generica',
          titulo: `${consecutivo || etiqueta} corregida y reenviada a GH`,
          mensaje: `${quien} corrigió ${etiqueta} y la reenvió a Cultura y Desarrollo.${
            lista.length ? ` Cambios: ${lista.join('; ')}.` : ''
          }`,
          solo_campana: true,
        });
      }

      if (!dryRun) {
        tx.update(ref, patch);
        const novRef = db.collection('vacante_novedades').doc();
        tx.set(novRef, {
          id: novRef.id,
          vacante_id: vacanteId,
          vacante_consecutivo: consecutivo,
          tipo: 'reenvio_correccion',
          motivo: motivoNovedad,
          estado_anterior: 'devuelta',
          estado_nuevo: 'borrador',
          registrado_por_nombre: nombre,
          creado_en: ahora,
          creado_por: uid,
          actualizado_en: ahora,
          actualizado_por: uid,
        });
        for (const n of notifs) {
          tx.set(db.collection('notificaciones').doc(), notificacionDoc(n, vacanteId, uid));
        }
      }
      return {
        cambios: lista,
        campos: Object.keys(cambios),
        consecutivo,
        motivo: String(v.aval_rechazo_motivo ?? '').trim(),
        destinatarios: notifs.map((n) => n.destinatario_uid),
      };
    });

    // Correo a Cultura y Desarrollo (Diego) con lo corregido. Va después de la
    // transacción: un fallo de correo no deshace el reenvío (queda rastro en la
    // vacante y coordinación recibe el aviso, ver avisarCondicionesCultura).
    let correo = 'no_enviado_dry_run';
    if (!dryRun) {
      try {
        const r = await avisarCondicionesCultura(vacanteId, {
          forzar: true,
          reenvio: { motivo: plan.motivo, nota, cambios: plan.cambios, por: nombre },
        });
        correo = r.estado;
      } catch (e) {
        correo = 'error';
        logger.error('[revisionSolicitud] aviso a cultura falló', {
          vacanteId,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logger.info('[revisionSolicitud] reenvío', { vacanteId, uid, rol, dryRun, correo, cambios: plan.cambios });
    return {
      ok: true as const,
      dry_run: dryRun,
      cambios: plan.cambios,
      campos: plan.campos,
      destinatarios: plan.destinatarios,
      correo,
    };
  },
);
