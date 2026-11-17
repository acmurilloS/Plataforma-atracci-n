/**
 * Tallas de dotación (DGH-F-05 → solicitud a compras/gestores → API de DotaTrack).
 *
 * DotaTrack 17-nov (A3): "Que Atracción no deje enviar la solicitud de dotación
 * sin tallas. Y cuando una prenda no aplica al cargo, que venga marcada como «no
 * aplica» en vez de vacía". Por eso:
 *  - las 6 prendas son OBLIGATORIAS para pedir la dotación (calzado, pantalón,
 *    chaleco, guantes, overol, camisa/blusa); "otros" es libre;
 *  - una prenda que no usa se diligencia como "NO APLICA" (el portal y el modal
 *    lo escriben así; se aceptan variantes como N/A) y la API la entrega como
 *    `no_aplica`.
 *
 * ESPEJO en el front: src/utils/tallas.ts. Si cambia uno, cambia el otro.
 */

export const NO_APLICA = 'NO APLICA';

/** Prendas obligatorias para pedir la dotación, con su campo en Datos Básicos. */
export const PRENDAS = [
  { key: 'talla_calzado', api: 'calzado', label: 'Calzado' },
  { key: 'talla_pantalon', api: 'pantalon', label: 'Pantalón' },
  { key: 'talla_chaleco', api: 'chaleco', label: 'Chaleco' },
  { key: 'talla_guantes', api: 'guantes', label: 'Guantes' },
  { key: 'talla_overol', api: 'overol', label: 'Overol' },
  { key: 'talla_camisa_blusa', api: 'camisa_blusa', label: 'Camisa / blusa' },
] as const;

/** ¿El valor dice que la prenda no aplica? (NO APLICA, No aplica, N/A, NA…). */
export function esNoAplica(v: unknown): boolean {
  return /^(no\s*aplica|n\s*\/?\s*a|no\s*usa|no\s*requiere)\.?$/i.test(String(v ?? '').trim());
}

/** Valor para la API: '' si falta, 'no_aplica' si no aplica, si no la talla tal cual. */
export function tallaApi(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  return esNoAplica(t) ? 'no_aplica' : t;
}

/** Etiquetas de las prendas obligatorias que siguen vacías. */
export function prendasFaltantes(d: Record<string, unknown> | null | undefined): string[] {
  return PRENDAS.filter((p) => !String(d?.[p.key] ?? '').trim()).map((p) => p.label);
}

/** ¿Están las 6 prendas diligenciadas (con talla o "no aplica")? */
export function tallasCompletas(d: Record<string, unknown> | null | undefined): boolean {
  return !!d && prendasFaltantes(d).length === 0;
}
