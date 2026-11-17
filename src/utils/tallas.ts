/**
 * Tallas de dotación (DotaTrack 17-nov, A3): las 6 prendas son obligatorias para
 * pedir la dotación y la que no se usa se escribe "NO APLICA" (no vacía).
 *
 * ESPEJO de functions/src/dotacion/tallas.ts. Si cambia uno, cambia el otro.
 */

export const NO_APLICA = 'NO APLICA';

export const PRENDAS = [
  { key: 'talla_calzado', label: 'Calzado', ayuda: 'No. calzado' },
  { key: 'talla_pantalon', label: 'Pantalón', ayuda: 'Ej. 32' },
  { key: 'talla_chaleco', label: 'Chaleco', ayuda: 'Ej. M' },
  { key: 'talla_guantes', label: 'Guantes', ayuda: 'Ej. 9' },
  { key: 'talla_overol', label: 'Overol', ayuda: 'Ej. M' },
  { key: 'talla_camisa_blusa', label: 'Camisa / blusa', ayuda: 'Ej. M' },
] as const;

export type PrendaKey = (typeof PRENDAS)[number]['key'];

export function esNoAplica(v: unknown): boolean {
  return /^(no\s*aplica|n\s*\/?\s*a|no\s*usa|no\s*requiere)\.?$/i.test(String(v ?? '').trim());
}

/** Etiquetas de las prendas obligatorias vacías. */
export function prendasFaltantes(d: Record<string, unknown> | null | undefined): string[] {
  return PRENDAS.filter((p) => !String(d?.[p.key] ?? '').trim()).map((p) => p.label);
}
