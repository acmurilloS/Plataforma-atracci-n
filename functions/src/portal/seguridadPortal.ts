import { db } from '../utils/admin';

/**
 * seguridadPortal · parámetros (CONFIGURABLES) del rate limiting del acceso por
 * cédula del Portal del Candidato. Nada hardcodeado: se leen de
 * `configuracion_global/portal_seguridad` y se editan sin redeploy.
 *
 * Dos dimensiones, complementarias:
 *  - por TOKEN (verificarCedula): el freno INDIVIDUAL — cada candidato tiene su
 *    token, el error de uno no toca a los demás. `max_intentos_cedula` /
 *    `minutos_bloqueo_cedula`.
 *  - por IP (rateLimitIp): una RED DE SEGURIDAD contra fuerza bruta que rota
 *    tokens. Cuenta SOLO los fallos y con umbral alto, para que una oficina/NAT
 *    (muchas personas tras la misma IP pública) NUNCA se bloquee por uso normal.
 *    `max_intentos_ip` / `ventana_ip_min` / `bloqueo_ip_min`.
 */

export interface ConfigSeguridadPortal {
  /** Fallos por TOKEN antes de bloquear ese token. */
  max_intentos_cedula: number;
  /** Duración (min) del bloqueo por token. */
  minutos_bloqueo_cedula: number;
  /** Fallos por IP en la ventana antes de bloquear esa IP (red de seguridad). */
  max_intentos_ip: number;
  /** Ventana (min) de conteo por IP. */
  ventana_ip_min: number;
  /** Duración (min) del bloqueo por IP. */
  bloqueo_ip_min: number;
}

export const DEFAULTS_SEGURIDAD_PORTAL: ConfigSeguridadPortal = {
  max_intentos_cedula: 5,
  minutos_bloqueo_cedula: 15,
  max_intentos_ip: 60,
  ventana_ip_min: 15,
  bloqueo_ip_min: 30,
};

/** Entero positivo dentro de [min, max]; si el valor es inválido usa `def`. */
function entero(v: unknown, def: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) return def;
  return n;
}

/**
 * Lee `configuracion_global/portal_seguridad` con DEFAULTS seguros (mismo patrón
 * que `leerConfigExamenes()`/`leerPlantillas()`). Sin doc o con valores fuera de
 * rango → defaults: nunca deja la protección apagada ni con valores absurdos.
 */
export async function leerConfigSeguridadPortal(): Promise<ConfigSeguridadPortal> {
  try {
    const snap = await db.collection('configuracion_global').doc('portal_seguridad').get();
    const d = (snap.exists ? snap.data() : {}) ?? {};
    return {
      max_intentos_cedula: entero(d.max_intentos_cedula, DEFAULTS_SEGURIDAD_PORTAL.max_intentos_cedula, 1, 100),
      minutos_bloqueo_cedula: entero(d.minutos_bloqueo_cedula, DEFAULTS_SEGURIDAD_PORTAL.minutos_bloqueo_cedula, 1, 1440),
      max_intentos_ip: entero(d.max_intentos_ip, DEFAULTS_SEGURIDAD_PORTAL.max_intentos_ip, 1, 100000),
      ventana_ip_min: entero(d.ventana_ip_min, DEFAULTS_SEGURIDAD_PORTAL.ventana_ip_min, 1, 1440),
      bloqueo_ip_min: entero(d.bloqueo_ip_min, DEFAULTS_SEGURIDAD_PORTAL.bloqueo_ip_min, 1, 1440),
    };
  } catch {
    return { ...DEFAULTS_SEGURIDAD_PORTAL };
  }
}
