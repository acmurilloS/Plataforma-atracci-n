import type { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { interpolar } from './plantillasMensajes';

/**
 * Configuración del reloj del líder tras el Concepto (reu Karen 09-sep, punto 7):
 * al enviarle el Concepto de Atracción, el líder tiene un plazo para dar la fecha
 * de la entrevista; si no, recordatorio y luego suspensión del proceso.
 *
 * Vive en `configuracion_global/reloj_lider`, editable por admin desde Catálogos
 * → "Mensajes y reglas". FAIL-CLOSED: sin doc, apagado, con cualquier valor
 * inválido o con error de lectura → APAGADO (no arma relojes, no avisa, no pausa).
 * El espejo de estas validaciones para la UI está en
 * src/schemas/configuracionSchema.ts (validarRelojLider): si cambia una, cambia
 * la otra.
 */

export type ModoPlazo = 'calendario' | 'dias_habiles';

export interface ConfigRelojLider {
  efectivo: boolean;
  motivoApagado: string | null;
  vigenteDesdeMs: number;
  modoPlazo: ModoPlazo;
  horasRecordatorio: number;
  horasPausa: number;
  textoAvisoLider: string;
  textoRecordatorioLider: string;
  textoPausaLider: string;
  textoPausaEquipo: string;
  destinatariosEquipoUids: string[];
}

const MAX_TEXTO = 3000;

function apagado(motivo: string): ConfigRelojLider {
  return {
    efectivo: false,
    motivoApagado: motivo,
    vigenteDesdeMs: 0,
    modoPlazo: 'dias_habiles',
    horasRecordatorio: 24,
    horasPausa: 48,
    textoAvisoLider: '',
    textoRecordatorioLider: '',
    textoPausaLider: '',
    textoPausaEquipo: '',
    destinatariosEquipoUids: [],
  };
}

/** Texto limpio; null si supera el límite. */
function limpiar(v: unknown): string | null {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\r\n?/g, '\n').trim();
  return t.length > MAX_TEXTO ? null : t;
}

export async function leerConfigRelojLider(ahoraMs = Date.now()): Promise<ConfigRelojLider> {
  try {
    const snap = await db.collection('configuracion_global').doc('reloj_lider').get();
    if (!snap.exists) return apagado('sin configuración');
    const c = (snap.data() ?? {}) as Record<string, unknown>;
    if (c.activo !== true) return apagado('apagado');

    const vd = c.vigente_desde as Timestamp | undefined | null;
    const vigenteDesdeMs = vd && typeof vd.toMillis === 'function' ? vd.toMillis() : 0;
    if (!vigenteDesdeMs || vigenteDesdeMs > ahoraMs) return apagado('sin fecha de vigencia válida');

    const modo = c.modo_plazo;
    if (modo !== 'calendario' && modo !== 'dias_habiles') return apagado('modo de plazo inválido');

    const hr = c.horas_recordatorio;
    const hp = c.horas_pausa;
    if (
      typeof hr !== 'number' ||
      typeof hp !== 'number' ||
      !Number.isInteger(hr) ||
      !Number.isInteger(hp) ||
      hr <= 0 ||
      hr >= hp ||
      hp > 240
    ) {
      return apagado('horas inválidas');
    }
    if (modo === 'dias_habiles' && (hr % 24 !== 0 || hp % 24 !== 0)) {
      return apagado('en días hábiles el plazo debe ser en días completos');
    }

    const textos = [
      limpiar(c.texto_aviso_lider),
      limpiar(c.texto_recordatorio_lider),
      limpiar(c.texto_pausa_lider),
      limpiar(c.texto_pausa_equipo),
    ];
    if (textos.some((t) => t === null)) return apagado('un texto supera el límite');
    if (textos.some((t) => !t)) return apagado('faltan textos');
    const [aviso, recordatorio, pausaLider, pausaEquipo] = textos as string[];

    const destinatarios = Array.isArray(c.destinatarios_equipo_uids)
      ? (c.destinatarios_equipo_uids as unknown[]).filter(
          (x): x is string => typeof x === 'string' && x.length > 0,
        )
      : [];

    return {
      efectivo: true,
      motivoApagado: null,
      vigenteDesdeMs,
      modoPlazo: modo,
      horasRecordatorio: hr,
      horasPausa: hp,
      textoAvisoLider: aviso,
      textoRecordatorioLider: recordatorio,
      textoPausaLider: pausaLider,
      textoPausaEquipo: pausaEquipo,
      destinatariosEquipoUids: destinatarios,
    };
  } catch (e) {
    logger.warn('[reloj líder] no se pudo leer la configuración', { e: String(e) });
    return apagado('error de lectura');
  }
}

export interface VarsReloj {
  /** Primer nombre del líder. */
  nombre: string;
  cargo: string;
  consecutivo: string;
  empresa: string;
  sede: string;
  fecha_limite: string;
  horas: string;
  link: string;
}

/** Texto plano interpolado; onNotificacionCreate lo escapa al armar el correo. */
export function textoReloj(plantilla: string, vars: VarsReloj): string {
  return interpolar(plantilla, { ...vars });
}

/**
 * Destinatarios del aviso interno de suspensión/bloqueo: la lista de la config
 * si existe; si no, coordinadores y admins activos (sin cuentas `.test`). Siempre
 * se suma la analista asignada. Sin duplicados.
 */
export async function destinatariosEquipo(
  cfg: ConfigRelojLider,
  analistaUid: string | null | undefined,
): Promise<string[]> {
  const uids = new Set<string>();
  if (cfg.destinatariosEquipoUids.length > 0) {
    cfg.destinatariosEquipoUids.forEach((u) => uids.add(u));
  } else {
    // Solo igualdad sobre un campo (sin índice compuesto); el rol se filtra aquí.
    const snap = await db.collection('usuarios').where('activo', '==', true).get();
    for (const d of snap.docs) {
      const u = d.data();
      const rol = String(u.rol ?? '');
      const email = String(u.email ?? '').toLowerCase();
      if ((rol === 'coordinador' || rol === 'admin') && !email.endsWith('.test')) uids.add(d.id);
    }
  }
  if (analistaUid) uids.add(analistaUid);
  return [...uids];
}
