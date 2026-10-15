import { formatearCOP } from './moneda';

/**
 * Garantizado DESGLOSADO (reu Karen + Diego 08-oct): "si el garantizado es
 * 3.500.000, que me salga básico 1.750.000 y garantizado la diferencia
 * 1.750.000", sin mezclar el rodamiento. La vacante guarda el TOTAL mensual
 * (`garantizado_total_mes`, incluye el básico) y la duración; aquí se calcula el
 * resto. En el VIDA-F-01 el básico es el "valor prestacional" y la diferencia el
 * "valor no prestacional".
 *
 * Espejo en functions/src/vacantes/condicionesSolicitud.ts (textoGarantizado).
 */

export interface DatosGarantizado {
  salario_base?: number | null;
  garantizado_total_mes?: number | null;
  garantizado_duracion?: string | null;
  garantizado_texto?: string | null;
}

export interface DesgloseGarantizado {
  total: number;
  basico: number;
  /** Lo que se garantiza por encima del básico = valor NO prestacional. */
  diferencia: number;
  duracion: string;
}

export function desgloseGarantizado(v: DatosGarantizado): DesgloseGarantizado | null {
  const total = Number(v.garantizado_total_mes);
  const basico = Number(v.salario_base);
  if (v.garantizado_total_mes == null || !Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(basico) || basico <= 0) return null;
  return {
    total,
    basico,
    diferencia: Math.max(0, total - basico),
    duracion: (v.garantizado_duracion ?? '').trim(),
  };
}

/** Línea del desglose: "Total mes $3.500.000 = básico $1.750.000 + $1.750.000 no prestacional · 3 meses". */
export function lineaDesglose(d: DesgloseGarantizado): string {
  return `Total mes ${formatearCOP(d.total)} = básico ${formatearCOP(d.basico)} + ${formatearCOP(
    d.diferencia,
  )} no prestacional${d.duracion ? ` · ${d.duracion}` : ''}`;
}

/** Texto completo (desglose + observaciones), o el texto libre de las vacantes viejas. */
export function textoGarantizado(v: DatosGarantizado): string {
  const d = desgloseGarantizado(v);
  const obs = (v.garantizado_texto ?? '').trim();
  if (d) return obs ? `${lineaDesglose(d)}\n${obs}` : lineaDesglose(d);
  return obs || 'No aplica';
}
