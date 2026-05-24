import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarEmail } from './enviarEmail';

/**
 * Reloj de 48h del líder (paso 13 del flujograma).
 *
 * Ataca el Dolor #3 ("líderes demoran hasta una semana en dar agenda").
 *
 * Mecánica acordada con Maribel/Karen (2026-05-22):
 *  - T+0h:  analista cierra terna → `vacantes.terna_enviada_en = now` → primer correo.
 *  - T+24h: si el líder no ha respondido, recordatorio "te quedan 24h".
 *  - T+48h: si sigue sin responder, vacante pasa a `pausada` + se notifica al
 *           coordinador (Karen). Mensaje al líder es diplomático.
 *
 * Los flags `recordatorio_*_enviado_en` evitan duplicados si la función se
 * ejecuta dos veces dentro de la misma ventana.
 *
 * Los tiempos están en este archivo como constantes — cuando Karen los
 * ajuste sólo se cambia este bloque.
 */

const VENTANA_24H_MS = 24 * 60 * 60 * 1000;
const VENTANA_48H_MS = 48 * 60 * 60 * 1000;

interface VacanteSnap {
  id: string;
  consecutivo: string;
  cargo_nombre: string;
  empresa_nombre: string;
  sede_nombre: string;
  lider_uid: string;
  lider_nombre: string;
  terna_enviada_en: Timestamp | null;
  terna_respondida_en: Timestamp | null;
  recordatorio_48h_enviado_en: Timestamp | null;
  recordatorio_24h_enviado_en: Timestamp | null;
  recordatorio_expirado_en: Timestamp | null;
  estado: string;
}

async function emailDeUid(uid: string): Promise<string | null> {
  try {
    const u = await getAuth().getUser(uid);
    return u.email ?? null;
  } catch {
    return null;
  }
}

async function notificacionInApp(opciones: {
  destinatario_uid: string;
  tipo:
    | 'terna_recordatorio_48h'
    | 'terna_recordatorio_24h'
    | 'terna_expirada_lider'
    | 'terna_expirada_coordinador';
  titulo: string;
  mensaje: string;
  link: string;
}): Promise<void> {
  await db.collection('notificaciones').add({
    destinatario_uid: opciones.destinatario_uid,
    tipo: opciones.tipo,
    titulo: opciones.titulo,
    mensaje: opciones.mensaje,
    link: opciones.link,
    leida: false,
    leida_en: null,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: 'system',
  });
}

async function procesarVacante(v: VacanteSnap, ahora: number): Promise<{
  accion: 'ninguna' | 'recordatorio_24h' | 'expirado';
}> {
  if (!v.terna_enviada_en) return { accion: 'ninguna' };
  if (v.terna_respondida_en) return { accion: 'ninguna' };

  const inicio = v.terna_enviada_en.toMillis();
  const transcurridoMs = ahora - inicio;

  const ref = db.collection('vacantes').doc(v.id);
  const link = `/vacantes/${v.id}/terna`;
  const liderEmail = (await emailDeUid(v.lider_uid)) ?? `${v.lider_uid}@desconocido`;

  // ─── Ventana de 24h: recordatorio "te quedan 24h" ───────────────────
  if (
    transcurridoMs >= VENTANA_24H_MS &&
    transcurridoMs < VENTANA_48H_MS &&
    !v.recordatorio_24h_enviado_en
  ) {
    const asunto = `⏰ Te quedan 24h · Terna de ${v.cargo_nombre} (${v.consecutivo})`;
    const mensaje = `Hola ${v.lider_nombre.split(' ')[0]},

Ya te conseguimos candidatos para tu vacante de ${v.cargo_nombre} en ${v.empresa_nombre} - ${v.sede_nombre}. Te quedan aproximadamente 24 horas para revisar la terna y dar feedback antes de que el proceso se pause.

Entra al portal: https://atraccion.equitel.com.co${link}

Gracias,
Equipo de Atracción de Talento`;

    await enviarEmail({
      destinatario_email: liderEmail,
      destinatario_uid: v.lider_uid,
      destinatario_nombre: v.lider_nombre,
      asunto,
      mensaje_texto: mensaje,
      origen: 'recordatorio_lider_24h',
      contexto: { vacante_id: v.id, consecutivo: v.consecutivo },
    });

    await notificacionInApp({
      destinatario_uid: v.lider_uid,
      tipo: 'terna_recordatorio_24h',
      titulo: `Te quedan 24h para revisar tu terna · ${v.consecutivo}`,
      mensaje: `${v.cargo_nombre} (${v.empresa_nombre} - ${v.sede_nombre}). Revisa los candidatos antes de que se pause.`,
      link,
    });

    await ref.update({
      recordatorio_24h_enviado_en: FieldValue.serverTimestamp(),
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });

    return { accion: 'recordatorio_24h' };
  }

  // ─── Ventana de 48h: expirada, pausar vacante + notificar a coord ──
  if (transcurridoMs >= VENTANA_48H_MS && !v.recordatorio_expirado_en) {
    const asuntoLider = `Pausamos temporalmente · ${v.cargo_nombre} (${v.consecutivo})`;
    const mensajeLider = `Hola ${v.lider_nombre.split(' ')[0]},

No pudimos contactarte sobre la terna de ${v.cargo_nombre} (${v.empresa_nombre} - ${v.sede_nombre}) en estos dos días. Para no perder los candidatos sin tu decisión, pausamos temporalmente el proceso.

Cuando puedas retomarlo, contáctanos o entra al portal: https://atraccion.equitel.com.co${link}

Sin presión,
Equipo de Atracción de Talento`;

    await enviarEmail({
      destinatario_email: liderEmail,
      destinatario_uid: v.lider_uid,
      destinatario_nombre: v.lider_nombre,
      asunto: asuntoLider,
      mensaje_texto: mensajeLider,
      origen: 'recordatorio_lider_expirado',
      contexto: { vacante_id: v.id, consecutivo: v.consecutivo },
    });

    await notificacionInApp({
      destinatario_uid: v.lider_uid,
      tipo: 'terna_expirada_lider',
      titulo: `Pausamos tu vacante · ${v.consecutivo}`,
      mensaje: `${v.cargo_nombre}. Cuando puedas retomarla, entra al portal.`,
      link,
    });

    // Notificar a coordinadores (rol coordinador) para que decidan reasignar
    const coords = await db
      .collection('usuarios')
      .where('rol', '==', 'coordinador')
      .where('activo', '==', true)
      .get();

    for (const c of coords.docs) {
      await notificacionInApp({
        destinatario_uid: c.id,
        tipo: 'terna_expirada_coordinador',
        titulo: `Líder no respondió en 48h · ${v.consecutivo}`,
        mensaje: `${v.lider_nombre} no entró a revisar la terna de ${v.cargo_nombre}. Vacante pausada. Decide si insistir, reasignar o declarar desierta.`,
        link,
      });
    }

    await ref.update({
      estado: 'pausada',
      razon_cierre: 'Líder no respondió en 48h tras envío de terna (paso 13).',
      recordatorio_expirado_en: FieldValue.serverTimestamp(),
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });

    return { accion: 'expirado' };
  }

  return { accion: 'ninguna' };
}

async function correr(): Promise<{ revisadas: number; recordatorios24h: number; expiradas: number }> {
  const ahora = Date.now();
  const snap = await db
    .collection('vacantes')
    .where('estado', '==', 'terna_enviada')
    .get();

  let recordatorios24h = 0;
  let expiradas = 0;
  for (const d of snap.docs) {
    const v = { id: d.id, ...(d.data() as Omit<VacanteSnap, 'id'>) };
    try {
      const res = await procesarVacante(v, ahora);
      if (res.accion === 'recordatorio_24h') recordatorios24h += 1;
      if (res.accion === 'expirado') expiradas += 1;
    } catch (err) {
      logger.error('[recordatoriosLider] error procesando vacante', {
        vacante_id: v.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('[recordatoriosLider] ciclo completado', {
    revisadas: snap.size,
    recordatorios24h,
    expiradas,
  });
  return { revisadas: snap.size, recordatorios24h, expiradas };
}

// Scheduled: cada hora en punto, Bogotá. Karen ajustará la frecuencia si hace falta.
export const revisarRecordatoriosLider = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'America/Bogota',
    region: 'us-central1',
  },
  async () => {
    await correr();
  },
);

// Callable para disparar manualmente desde el panel admin (útil en QA/emulador).
export const revisarRecordatoriosLiderCallable = onCall(
  { region: 'us-central1' },
  async (req) => {
    const esEmulador = !!process.env.FUNCTIONS_EMULATOR;
    if (!esEmulador && req.auth?.token.rol !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin.');
    }
    return await correr();
  },
);
