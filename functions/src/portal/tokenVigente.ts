/**
 * Vigencia del token del portal del candidato.
 *
 * Un token deja de servir si fue revocado (revocado=true) o si pasó su fecha de
 * caducidad (expira_en). Los tokens viejos sin expira_en se tratan como vigentes
 * (no caducan) para no romper enlaces ya enviados antes de esta medida.
 */
export function tokenVigente(t: Record<string, unknown>): boolean {
  if (t.revocado === true) return false;
  const exp = t.expira_en as { toMillis?: () => number } | undefined;
  if (exp && typeof exp.toMillis === 'function' && exp.toMillis() < Date.now()) return false;
  return true;
}

/** Días de vigencia por defecto del token desde que se envía/reenvía el portal. */
export const DIAS_VIGENCIA_TOKEN = 90;
