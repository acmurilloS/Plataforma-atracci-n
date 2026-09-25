/**
 * Espejo de src/utils/comisiones.ts (functions no importa de src). Mantener en
 * sync si cambian los tipos o los textos. Reu Karen 16-sep, punto B.
 */

export const COMISION_TIPO_LABEL: Record<string, string> = {
  ninguna: 'Sin comisiones',
  presupuesto: 'Por cumplimiento de presupuesto',
  indicadores: 'Por indicadores',
  mixta: 'Por presupuesto e indicadores',
};

function etiquetaBase(tipo: string): string {
  if (tipo === 'presupuesto') return 'Presupuesto';
  if (tipo === 'indicadores') return 'Indicadores';
  return 'Presupuesto e indicadores';
}

/** Líneas de la comisión a partir del doc crudo de la vacante. */
export function lineasComisiones(v: Record<string, unknown>): string[] {
  const tipoRaw = v.comision_tipo;
  const tipo =
    typeof tipoRaw === 'string' && Object.prototype.hasOwnProperty.call(COMISION_TIPO_LABEL, tipoRaw)
      ? tipoRaw
      : null;
  const concepto = String(v.comisiones_texto ?? '').trim();
  if (tipo === null) return concepto ? [concepto] : [];
  if (tipo === 'ninguna') return [];
  const base = String(v.comision_base ?? '').trim();
  const medicion = String(v.comision_medicion ?? '').trim();
  const bolsa = String(v.comision_bolsa_detalle ?? '').trim();
  const out = [COMISION_TIPO_LABEL[tipo]];
  if (base) out.push(`${etiquetaBase(tipo)}: ${base}`);
  if (medicion) out.push(`Medición: ${medicion}`);
  if (v.comision_aplica_bolsa === true) out.push(`Aplica bolsa${bolsa ? `: ${bolsa}` : ''}`);
  if (concepto) out.push(`Concepto: ${concepto}`);
  return out;
}

export function textoComisiones(v: Record<string, unknown>, separador = ' · '): string {
  const lineas = lineasComisiones(v);
  return lineas.length ? lineas.join(separador) : 'No aplica';
}
