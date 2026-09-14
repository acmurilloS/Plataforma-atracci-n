import type { Timestamp } from 'firebase/firestore';

/**
 * Configuraciones editables desde Admin → Catálogos → "Mensajes y reglas"
 * (reu Karen 09-sep, puntos 6 y 7). Ambas quedan APAGADAS mientras el doc no
 * exista o no valide: no se envía nada a nadie ni se pausa ninguna vacante.
 *
 * ESPEJO de las validaciones del servidor:
 *  - functions/src/notificaciones/avisoCompromiso.ts (leerAvisoCompromiso)
 *  - functions/src/notificaciones/configRelojLider.ts (leerConfigRelojLider)
 * Si cambia una, cambia la otra.
 */

/** `configuracion_global/aviso_compromiso` · aviso al candidato en la citación. */
export interface ConfigAvisoCompromisoDoc {
  id: string;
  activo?: boolean;
  titulo?: string;
  /** Texto plano; variables {{nombre}} y {{cargo}}. */
  texto?: string;
  en_entrevista_analista?: boolean;
  en_entrevista_lider?: boolean;
  en_portal?: boolean;
  actualizado_en?: Timestamp | null;
  actualizado_por?: string;
}

export type ModoPlazoReloj = 'calendario' | 'dias_habiles';

/** `configuracion_global/reloj_lider` · plazo del líder tras el Concepto. */
export interface ConfigRelojLiderDoc {
  id: string;
  activo?: boolean;
  /** Solo cuentan los Conceptos enviados desde aquí (se fija al encender). */
  vigente_desde?: Timestamp | null;
  modo_plazo?: ModoPlazoReloj;
  horas_recordatorio?: number;
  horas_pausa?: number;
  texto_aviso_lider?: string;
  texto_recordatorio_lider?: string;
  texto_pausa_lider?: string;
  texto_pausa_equipo?: string;
  /** Vacío = coordinadores y admins activos (sin cuentas de prueba). */
  destinatarios_equipo_uids?: string[];
  actualizado_en?: Timestamp | null;
  actualizado_por?: string;
}

export const MAX_TITULO_AVISO = 120;
export const MAX_TEXTO_AVISO = 2000;
export const MAX_TEXTO_RELOJ = 3000;

export const VARIABLES_AVISO = ['nombre', 'cargo'] as const;
export const VARIABLES_RELOJ = [
  'nombre',
  'cargo',
  'consecutivo',
  'empresa',
  'sede',
  'fecha_limite',
  'horas',
  'link',
] as const;

export interface EstadoConfig {
  efectivo: boolean;
  motivo: string | null;
}

export function validarAvisoCompromiso(d?: ConfigAvisoCompromisoDoc | null): EstadoConfig {
  if (!d) return { efectivo: false, motivo: 'sin configuración' };
  const texto = (d.texto ?? '').trim();
  if (texto.length > MAX_TEXTO_AVISO) return { efectivo: false, motivo: 'el texto supera el límite' };
  if (d.activo !== true) return { efectivo: false, motivo: 'apagado' };
  if (!texto) return { efectivo: false, motivo: 'falta el texto' };
  return { efectivo: true, motivo: null };
}

export function validarRelojLider(
  d?: ConfigRelojLiderDoc | null,
  ahoraMs = Date.now(),
): EstadoConfig {
  if (!d) return { efectivo: false, motivo: 'sin configuración' };
  if (d.activo !== true) return { efectivo: false, motivo: 'apagado' };
  const vd = d.vigente_desde?.toMillis?.() ?? 0;
  if (!vd || vd > ahoraMs) return { efectivo: false, motivo: 'sin fecha de vigencia válida' };
  return validarCamposReloj(d);
}

/** Validación de los campos (sin mirar activo/vigencia): la usa también el formulario. */
export function validarCamposReloj(d: ConfigRelojLiderDoc): EstadoConfig {
  const modo = d.modo_plazo;
  if (modo !== 'calendario' && modo !== 'dias_habiles') {
    return { efectivo: false, motivo: 'modo de plazo inválido' };
  }
  const hr = d.horas_recordatorio;
  const hp = d.horas_pausa;
  if (
    typeof hr !== 'number' ||
    typeof hp !== 'number' ||
    !Number.isInteger(hr) ||
    !Number.isInteger(hp) ||
    hr <= 0 ||
    hr >= hp ||
    hp > 240
  ) {
    return { efectivo: false, motivo: 'horas inválidas (recordatorio menor que suspensión, máx. 240 h)' };
  }
  if (modo === 'dias_habiles' && (hr % 24 !== 0 || hp % 24 !== 0)) {
    return { efectivo: false, motivo: 'en días hábiles el plazo debe ser en días completos' };
  }
  const textos = [
    d.texto_aviso_lider,
    d.texto_recordatorio_lider,
    d.texto_pausa_lider,
    d.texto_pausa_equipo,
  ].map((t) => (t ?? '').trim());
  if (textos.some((t) => t.length > MAX_TEXTO_RELOJ)) {
    return { efectivo: false, motivo: 'un texto supera el límite' };
  }
  if (textos.some((t) => !t)) return { efectivo: false, motivo: 'faltan textos' };
  return { efectivo: true, motivo: null };
}

/** Variables {{x}} usadas en el texto que no están permitidas (se verían vacías). */
export function variablesDesconocidas(texto: string, permitidas: readonly string[]): string[] {
  const usadas = [...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(usadas.filter((v) => !permitidas.includes(v)))];
}
