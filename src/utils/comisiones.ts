/**
 * Comisiones estructuradas (reu Karen 16-sep, punto B). Cultura y Desarrollo
 * (Diego) necesita saber CÓMO se gana la comisión para armar el contrato: hoy
 * los líderes pegaban una tabla sin contexto. La vacante guarda:
 *
 *  - comision_tipo: 'ninguna' | 'presupuesto' | 'indicadores' | 'mixta'.
 *    null = vacante creada antes de este cambio ("sin clasificar"): se sigue
 *    mostrando el texto libre que tenga.
 *  - comision_base: cuál presupuesto / cuáles indicadores.
 *  - comision_medicion: cómo se mide y se paga (periodicidad, %, tabla).
 *  - comision_aplica_bolsa + comision_bolsa_detalle (caso técnicos).
 *  - comisiones_texto: concepto/resumen para el candidato (texto libre de siempre).
 *
 * ESPEJO en functions/src/utils/comisiones.ts (functions no importa de src).
 */

export const COMISION_TIPOS = ['ninguna', 'presupuesto', 'indicadores', 'mixta'] as const;
export type ComisionTipo = (typeof COMISION_TIPOS)[number];

export const COMISION_TIPO_LABEL: Record<ComisionTipo, string> = {
  ninguna: 'Sin comisiones',
  presupuesto: 'Por cumplimiento de presupuesto',
  indicadores: 'Por indicadores',
  mixta: 'Por presupuesto e indicadores',
};

/** Etiqueta del campo "base" según el tipo (qué presupuesto / qué indicadores). */
export function etiquetaBaseComision(tipo: ComisionTipo | null | undefined): string {
  if (tipo === 'presupuesto') return 'Presupuesto';
  if (tipo === 'indicadores') return 'Indicadores';
  return 'Presupuesto e indicadores';
}

export interface ComisionesCampos {
  comision_tipo?: ComisionTipo | null;
  comision_base?: string;
  comision_medicion?: string;
  comision_aplica_bolsa?: boolean;
  comision_bolsa_detalle?: string;
  comisiones_texto?: string;
}

/** ¿La vacante paga comisiones? (null = vieja: se decide por el texto libre). */
export function tieneComisiones(v: ComisionesCampos): boolean {
  const tipo = v.comision_tipo ?? null;
  if (tipo === null) return !!(v.comisiones_texto ?? '').trim();
  return tipo !== 'ninguna';
}

/**
 * Líneas para pintar/exportar: tipo, base, medición, bolsa y concepto. Vacía si
 * no hay comisiones. Una vacante vieja sin clasificar devuelve solo su texto.
 */
export function lineasComisiones(v: ComisionesCampos): string[] {
  const tipo = v.comision_tipo ?? null;
  const concepto = (v.comisiones_texto ?? '').trim();
  if (tipo === null) return concepto ? [concepto] : [];
  if (tipo === 'ninguna') return [];
  const base = (v.comision_base ?? '').trim();
  const medicion = (v.comision_medicion ?? '').trim();
  const bolsa = (v.comision_bolsa_detalle ?? '').trim();
  const out = [COMISION_TIPO_LABEL[tipo]];
  if (base) out.push(`${etiquetaBaseComision(tipo)}: ${base}`);
  if (medicion) out.push(`Medición: ${medicion}`);
  if (v.comision_aplica_bolsa) out.push(`Aplica bolsa${bolsa ? `: ${bolsa}` : ''}`);
  if (concepto) out.push(`Concepto: ${concepto}`);
  return out;
}

/** Texto único (multilínea por defecto) o "No aplica". */
export function textoComisiones(v: ComisionesCampos, separador = '\n'): string {
  const lineas = lineasComisiones(v);
  return lineas.length ? lineas.join(separador) : 'No aplica';
}
