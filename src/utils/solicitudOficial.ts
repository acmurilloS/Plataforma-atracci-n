import { formatearFecha } from './fechas';
import { lineasComisiones } from './comisiones';
import { desgloseGarantizado } from './garantizado';
import type { SolicitudEstampado } from './estamparSolicitudIntegrante';
import type { SolicitudIntegranteDoc, VacanteDoc } from '../schemas';

/**
 * Datos del formato OFICIAL VIDA-F-01 a partir de la vacante + lo que Atracción
 * diligenció en `solicitudes_integrante`. Lo comparten la página de la Solicitud
 * de Integrantes (edición) y el visor que abre Diego desde Aprobaciones (reu
 * Karen + Diego 08-oct: "él quiere ver los dos", la previsualización y el
 * original que se descarga).
 */

/** Campos del formato que la vacante no captura (editables por Atracción). */
export interface CamposSolicitud {
  cargo_solicitante: string;
  cargo_reporta: string;
  tipo_vinculacion: string;
  sistemas: string;
  preferible_poseer: string;
  disponibilidad_viajar: string;
  trabajo_en: string;
  rodamiento_valor: string;
  bonificaciones_texto: string;
  garantizado_total: string;
  valor_prestacional: string;
  valor_no_prestacional: string;
  garantizado_tiempo: string;
  observaciones: string;
}

/**
 * "Tipo de vinculación" derivado del tipo de solicitud (antes salía en blanco en
 * el PDF). Reemplazo/aumento = De planta; necesidad temporal = Temporal.
 */
export function vinculacionDeTipoSolicitud(tipo: string | undefined | null): string {
  if (tipo === 'necesidad_temporal') return 'Temporal';
  if (tipo === 'reemplazo_indefinido' || tipo === 'aumento_planta' || tipo === 'reemplazo' || tipo === 'aumento') {
    return 'De planta';
  }
  return '';
}

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

/**
 * Lo que la vacante ya sabe de cada campo. El garantizado sale DESGLOSADO (reu
 * 08-oct): total = básico (valor prestacional) + diferencia (no prestacional).
 */
export function prellenadoDesdeVacante(v: VacanteDoc): Partial<CamposSolicitud> {
  const d = desgloseGarantizado(v);
  return {
    cargo_solicitante: v.lider_cargo ?? '',
    tipo_vinculacion: vinculacionDeTipoSolicitud(v.tipo_solicitud),
    rodamiento_valor: v.rodamiento_valor ?? '',
    garantizado_total: d ? pesos(d.total) : '',
    valor_prestacional: d ? pesos(d.basico) : '',
    valor_no_prestacional: d ? pesos(d.diferencia) : '',
    garantizado_tiempo: d?.duracion ?? '',
  };
}

const CLAVES: (keyof CamposSolicitud)[] = [
  'cargo_solicitante',
  'cargo_reporta',
  'tipo_vinculacion',
  'sistemas',
  'preferible_poseer',
  'disponibilidad_viajar',
  'trabajo_en',
  'rodamiento_valor',
  'bonificaciones_texto',
  'garantizado_total',
  'valor_prestacional',
  'valor_no_prestacional',
  'garantizado_tiempo',
  'observaciones',
];

/** Lo guardado manda; si un campo quedó vacío, se usa lo que trae la vacante. */
export function camposEfectivos(
  v: VacanteDoc,
  solicitud: Partial<SolicitudIntegranteDoc> | null | undefined,
): CamposSolicitud {
  const pre = prellenadoDesdeVacante(v);
  const out = {} as CamposSolicitud;
  for (const k of CLAVES) {
    const guardado = String((solicitud as Record<string, unknown> | null | undefined)?.[k] ?? '').trim();
    out[k] = guardado || String(pre[k] ?? '');
  }
  return out;
}

/** Datos listos para estampar el VIDA-F-01 oficial. */
export function datosSolicitudOficial(v: VacanteDoc, c: CamposSolicitud): SolicitudEstampado {
  const reemplazaA =
    v.tipo_solicitud === 'reemplazo_indefinido' && v.reemplaza_a_nombre ? v.reemplaza_a_nombre : 'NA';
  const tiempo =
    v.tipo_solicitud === 'necesidad_temporal' && v.temporalidad_meses != null
      ? `${v.temporalidad_meses} mes${v.temporalidad_meses === 1 ? '' : 'es'}`
      : 'NA';
  return {
    consecutivo: v.consecutivo,
    fecha_solicitud: formatearFecha((v.creado_en?.toDate?.() ?? new Date()) as Date),
    solicitante: v.lider_nombre,
    cargo_solicitante: c.cargo_solicitante,
    cargo_solicita: v.cargo_nombre,
    empresa: v.empresa_nombre,
    unidad: v.unidad_nombre,
    sede: v.sede_nombre,
    cargo_reporta: c.cargo_reporta,
    tipo_vinculacion: c.tipo_vinculacion,
    cargo_reemplazo: v.cargo_nombre,
    reemplaza_a: reemplazaA,
    tiempo_reemplazo: tiempo,
    preferible_poseer: c.preferible_poseer,
    disponibilidad_viajar: c.disponibilidad_viajar,
    trabajo_en: c.trabajo_en,
    salario_base: v.salario_base != null ? v.salario_base.toLocaleString('es-CO') : '',
    rodamiento: v.rodamiento ? 'Sí' : 'No',
    rodamiento_valor: c.rodamiento_valor,
    // Una línea por renglón (tipo, presupuesto/indicadores, medición, bolsa, concepto).
    comisiones: lineasComisiones(v).join('\n'),
    bonificaciones: c.bonificaciones_texto,
    garantizado_total: c.garantizado_total,
    valor_prestacional: c.valor_prestacional,
    valor_no_prestacional: c.valor_no_prestacional,
    garantizado_tiempo: c.garantizado_tiempo,
    observaciones: c.observaciones,
  };
}

export const nombreArchivoSolicitud = (v: VacanteDoc) =>
  `Solicitud_Integrante_${v.consecutivo || v.id}.pdf`;
