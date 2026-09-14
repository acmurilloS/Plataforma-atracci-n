import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import {
  destinatariosEquipo,
  leerConfigRelojLider,
  textoReloj,
  type ConfigRelojLider,
  type VarsReloj,
} from './configRelojLider';
import { esHorarioLaboral, formatearFechaBogota } from './plazoRelojLider';
import { ESTADOS_RELOJ_APLICA, liderYaRespondio, tsMs } from './relojLiderComun';

const APP_URL = 'https://ptm-atraccion.web.app';
const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

/**
 * Reloj del líder tras el Concepto (reu Karen 09-sep, punto 7) · programador.
 *
 * Reemplaza el reloj viejo, que solo miraba vacantes en 'terna_enviada' (nadie
 * usaba "Cerrar terna": había 0) y mandaba Gmail directo + notificación (doble
 * correo). Ahora el reloj lo arma onVacanteEnvioLider en `vacantes.reloj_lider` y
 * aquí, cada hora, por cada reloj 'corriendo':
 *  (a) inicio anterior a la vigencia → detenido (config_reiniciada), sin avisos;
 *  (b) la vacante salió de los estados que aplican → detenido;
 *  (c) el líder ya respondió (entrevista con líder, candidato avanzado, descarte,
 *      decisión de terna) → detenido;
 *  (d) el correo del aviso inicial no salió (error o 2 h sin salir) → 'bloqueado'
 *      y aviso al equipo. NUNCA suspende sin aviso confirmado;
 *  (e) recordatorio al líder (con copia a la analista) al llegar recordatorio_en;
 *      si queda menos de media ventana, se corre vence_en;
 *  (f) suspensión SOLO si venció, hubo recordatorio con correo confirmado y pasó
 *      la ventana desde ese recordatorio: vacante 'pausada' + estado_previo_pausa +
 *      novedad 'suspension' en la bitácora + avisos al líder y al equipo.
 * Recordatorios y suspensiones solo en horario laboral. Todo va en transacciones
 * que releen la vacante (un doble disparo no duplica).
 *
 * Config APAGADA (o inválida) → no escribe nada. La callable acepta
 * { simular: true } (por defecto) y solo reporta qué haría.
 */

interface Accion {
  consecutivo: string;
  accion: 'ninguna' | 'esperar' | 'detener' | 'bloquear' | 'recordar' | 'suspender' | 'error';
  motivo?: string;
}

function notificacion(
  destinatario: string,
  tipo: string,
  titulo: string,
  mensaje: string,
  link: string,
  vacanteId: string,
): Record<string, unknown> {
  return {
    destinatario_uid: destinatario,
    tipo,
    titulo,
    mensaje,
    link,
    vacante_id: vacanteId,
    leida: false,
    leida_en: null,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: 'system',
  };
}

function varsDe(
  v: FirebaseFirestore.DocumentData,
  vacanteId: string,
  venceMs: number,
  cfg: ConfigRelojLider,
): VarsReloj {
  return {
    nombre: String(v.lider_nombre ?? '').split(' ')[0] ?? '',
    cargo: String(v.cargo_nombre ?? ''),
    consecutivo: String(v.consecutivo ?? ''),
    empresa: String(v.empresa_nombre ?? ''),
    sede: String(v.sede_nombre ?? ''),
    fecha_limite: formatearFechaBogota(new Date(venceMs)),
    horas: String(cfg.horasPausa),
    link: `${APP_URL}/vacantes/${vacanteId}/concepto-atraccion`,
  };
}

async function procesarVacante(
  doc: DocumentSnapshot,
  cfg: ConfigRelojLider,
  ahora: Date,
  laboral: boolean,
  simular: boolean,
): Promise<Accion> {
  const v = doc.data() ?? {};
  const r = (v.reloj_lider ?? {}) as Record<string, unknown>;
  const vacRef = doc.ref;
  const consecutivo = String(v.consecutivo ?? doc.id);
  const envioMs = Number(r.envio_ms);
  const inicioMs = tsMs(r.inicio) ?? 0;
  const ahoraMs = ahora.getTime();
  const linkConcepto = `/vacantes/${doc.id}/concepto-atraccion`;

  /** Relee y confirma que sigue siendo el mismo reloj corriendo. */
  const mismoReloj = (data: FirebaseFirestore.DocumentData | undefined) => {
    const rr = data?.reloj_lider;
    return !!rr && rr.estado === 'corriendo' && Number(rr.envio_ms) === envioMs;
  };

  const detener = async (motivo: string): Promise<Accion> => {
    if (!simular) {
      await db.runTransaction(async (tx) => {
        const s = await tx.get(vacRef);
        if (!mismoReloj(s.data())) return;
        tx.update(vacRef, {
          'reloj_lider.estado': 'detenido',
          'reloj_lider.detenido_en': FieldValue.serverTimestamp(),
          'reloj_lider.motivo': motivo,
        });
      });
    }
    return { consecutivo, accion: 'detener', motivo };
  };

  const bloquear = async (motivo: string): Promise<Accion> => {
    if (!simular) {
      const equipo = await destinatariosEquipo(cfg, v.analista_uid);
      await db.runTransaction(async (tx) => {
        const s = await tx.get(vacRef);
        if (!mismoReloj(s.data())) return;
        tx.update(vacRef, { 'reloj_lider.estado': 'bloqueado', 'reloj_lider.motivo': motivo });
        const mensaje =
          `No pudimos confirmar el correo al líder ${String(v.lider_nombre ?? '')} sobre ` +
          `${String(v.cargo_nombre ?? '')} (${consecutivo}). El plazo para agendar la entrevista ` +
          'NO corre y la vacante no se suspenderá: avísale por otro medio o reenvía el Concepto.';
        for (const uid of equipo) {
          tx.set(
            db.collection('notificaciones').doc(),
            notificacion(uid, 'reloj_lider_bloqueado', `Reloj del líder sin correo · ${consecutivo}`, mensaje, linkConcepto, doc.id),
          );
        }
      });
    }
    return { consecutivo, accion: 'bloquear', motivo };
  };

  // (a) Reloj de una vigencia anterior (se apagó y se volvió a encender).
  if (inicioMs < cfg.vigenteDesdeMs) return detener('config_reiniciada');
  // (b) La vacante ya no está en un estado donde el reloj aplique.
  if (!ESTADOS_RELOJ_APLICA.includes(String(v.estado ?? ''))) return detener('estado_no_aplica');
  // (c) El líder ya respondió.
  const respuesta =
    (await liderYaRespondio(doc.id, inicioMs)) ??
    ((tsMs(v.terna_respondida_en) ?? 0) >= inicioMs ? 'decision_lider' : null);
  if (respuesta) return detener(respuesta);

  // (d) El aviso inicial tiene que haber salido por correo.
  const avisoId = String(r.aviso_notificacion_id ?? '');
  const aviso = avisoId ? (await db.collection('notificaciones').doc(avisoId).get()).data() : undefined;
  if (!aviso?.email_enviado_en) {
    if (aviso?.email_error || ahoraMs - inicioMs > DOS_HORAS_MS) return bloquear('aviso_sin_correo');
    return { consecutivo, accion: 'esperar', motivo: 'el aviso aún no sale por correo' };
  }

  const recordatorioEnMs = tsMs(r.recordatorio_en) ?? 0;
  const venceEnMs = tsMs(r.vence_en) ?? 0;
  const recordatorioEnviadoMs = tsMs(r.recordatorio_enviado_en);
  const ventanaMs = (cfg.horasPausa - cfg.horasRecordatorio) * 60 * 60 * 1000;

  // (e) Recordatorio.
  if (recordatorioEnviadoMs === null) {
    if (ahoraMs < recordatorioEnMs) return { consecutivo, accion: 'ninguna' };
    if (!laboral) return { consecutivo, accion: 'esperar', motivo: 'fuera de horario laboral' };
    if (simular) return { consecutivo, accion: 'recordar' };
    // Nunca se suspende sin dejar al líder media ventana después del recordatorio.
    const venceFinalMs = venceEnMs - ahoraMs < ventanaMs / 2 ? ahoraMs + ventanaMs : venceEnMs;
    await db.runTransaction(async (tx) => {
      const s = await tx.get(vacRef);
      const data = s.data();
      if (!mismoReloj(data) || data?.reloj_lider?.recordatorio_enviado_en) return;
      const notiRef = db.collection('notificaciones').doc();
      tx.set(
        notiRef,
        notificacion(
          String(r.lider_uid ?? v.lider_uid ?? ''),
          'reloj_lider_recordatorio',
          `Recordatorio: agenda la entrevista · ${consecutivo}`,
          textoReloj(cfg.textoRecordatorioLider, varsDe(v, doc.id, venceFinalMs, cfg)),
          linkConcepto,
          doc.id,
        ),
      );
      if (v.analista_uid) {
        tx.set(
          db.collection('notificaciones').doc(),
          notificacion(
            String(v.analista_uid),
            'reloj_lider_recordatorio',
            `Recordatorio enviado al líder · ${consecutivo}`,
            `Le recordamos a ${String(v.lider_nombre ?? 'el líder')} que dé la fecha de la entrevista de ` +
              `${String(v.cargo_nombre ?? '')} (${consecutivo}); el plazo vence el ` +
              `${formatearFechaBogota(new Date(venceFinalMs))}. Si ya te la dio, agenda la entrevista con ` +
              'el líder o detén el reloj desde el Concepto de Atracción.',
            linkConcepto,
            doc.id,
          ),
        );
      }
      tx.update(vacRef, {
        'reloj_lider.recordatorio_enviado_en': FieldValue.serverTimestamp(),
        'reloj_lider.recordatorio_notificacion_id': notiRef.id,
        ...(venceFinalMs !== venceEnMs ? { 'reloj_lider.vence_en': Timestamp.fromMillis(venceFinalMs) } : {}),
      });
    });
    return { consecutivo, accion: 'recordar' };
  }

  // (f) Suspensión.
  if (ahoraMs < venceEnMs || ahoraMs < recordatorioEnviadoMs + ventanaMs) {
    return { consecutivo, accion: 'ninguna' };
  }
  const recId = String(r.recordatorio_notificacion_id ?? '');
  const rec = recId ? (await db.collection('notificaciones').doc(recId).get()).data() : undefined;
  if (!rec?.email_enviado_en) {
    if (rec?.email_error || ahoraMs - recordatorioEnviadoMs > DOS_HORAS_MS) {
      return bloquear('recordatorio_sin_correo');
    }
    return { consecutivo, accion: 'esperar', motivo: 'el recordatorio aún no sale por correo' };
  }
  if (!laboral) return { consecutivo, accion: 'esperar', motivo: 'fuera de horario laboral' };
  if (simular) return { consecutivo, accion: 'suspender' };

  const equipo = await destinatariosEquipo(cfg, v.analista_uid);
  let suspendio = false;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(vacRef);
    const vv = s.data();
    if (!vv || !mismoReloj(vv) || !ESTADOS_RELOJ_APLICA.includes(String(vv.estado ?? ''))) return;
    const estadoAnterior = String(vv.estado);
    const liderUid = String(vv.reloj_lider?.lider_uid ?? vv.lider_uid ?? '');
    tx.update(vacRef, {
      estado: 'pausada',
      estado_previo_pausa: estadoAnterior,
      'reloj_lider.estado': 'pausada',
      'reloj_lider.pausada_en': FieldValue.serverTimestamp(),
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });
    const novRef = db.collection('vacante_novedades').doc();
    tx.set(novRef, {
      id: novRef.id,
      vacante_id: s.id,
      vacante_consecutivo: String(vv.consecutivo ?? ''),
      tipo: 'suspension',
      motivo:
        'Suspensión automática: el líder no dio fecha de entrevista dentro del plazo ' +
        `(vencía ${formatearFechaBogota(new Date(venceEnMs))}).`,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'pausada',
      registrado_por_nombre: 'Sistema · reloj del líder',
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });
    const vars = varsDe(vv, s.id, venceEnMs, cfg);
    if (liderUid) {
      tx.set(
        db.collection('notificaciones').doc(),
        notificacion(liderUid, 'reloj_lider_pausa', `Proceso suspendido · ${consecutivo}`, textoReloj(cfg.textoPausaLider, vars), linkConcepto, s.id),
      );
    }
    for (const uid of equipo) {
      if (uid === liderUid) continue;
      tx.set(
        db.collection('notificaciones').doc(),
        notificacion(uid, 'reloj_lider_pausa_equipo', `Vacante suspendida por el reloj del líder · ${consecutivo}`, textoReloj(cfg.textoPausaEquipo, vars), `/vacantes/${s.id}`, s.id),
      );
    }
    suspendio = true;
  });
  return { consecutivo, accion: suspendio ? 'suspender' : 'ninguna' };
}

export async function correrRelojLider(simular: boolean): Promise<{
  apagado: boolean;
  motivo: string | null;
  simular: boolean;
  horario_laboral: boolean;
  revisadas: number;
  acciones: Accion[];
}> {
  const cfg = await leerConfigRelojLider();
  if (!cfg.efectivo) {
    logger.info('[recordatoriosLider] apagado; no se hace nada', { motivo: cfg.motivoApagado });
    return { apagado: true, motivo: cfg.motivoApagado, simular, horario_laboral: false, revisadas: 0, acciones: [] };
  }
  const ahora = new Date();
  const laboral = await esHorarioLaboral(ahora);
  // Igualdad sobre un solo campo: índice automático.
  const snap = await db.collection('vacantes').where('reloj_lider.estado', '==', 'corriendo').get();
  const acciones: Accion[] = [];
  for (const d of snap.docs) {
    try {
      acciones.push(await procesarVacante(d, cfg, ahora, laboral, simular));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[recordatoriosLider] error procesando vacante', { vacante_id: d.id, msg });
      acciones.push({ consecutivo: String(d.data()?.consecutivo ?? d.id), accion: 'error', motivo: msg });
    }
  }
  logger.info('[recordatoriosLider] ciclo completado', {
    simular,
    horario_laboral: laboral,
    revisadas: snap.size,
    acciones: acciones.filter((a) => a.accion !== 'ninguna'),
  });
  return { apagado: false, motivo: null, simular, horario_laboral: laboral, revisadas: snap.size, acciones };
}

// Scheduled: cada hora en punto, Bogotá.
export const revisarRecordatoriosLider = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'America/Bogota',
    region: 'us-central1',
  },
  async () => {
    await correrRelojLider(false);
  },
);

// Callable admin: por defecto SIMULA (no escribe ni envía); { simular: false } ejecuta.
export const revisarRecordatoriosLiderCallable = onCall({ region: 'us-central1' }, async (req) => {
  const esEmulador = !!process.env.FUNCTIONS_EMULATOR;
  if (!esEmulador && req.auth?.token.rol !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo admin.');
  }
  const simular = (req.data as { simular?: boolean } | undefined)?.simular !== false;
  return await correrRelojLider(simular);
});
