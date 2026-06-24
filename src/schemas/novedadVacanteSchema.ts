import { z } from 'zod';
import type { CamposAuditoria } from './auditoria';
import { estadoVacante } from './enums';

/**
 * Bitácora de reprocesos y novedades de una vacante (petición Karen 2026-06-24).
 *
 * Espacio para registrar, con trazabilidad, por qué un proceso se reprocesa o
 * cambia de estado: ternas que no se ajustan a la expectativa del líder y
 * obligan a reiniciar la búsqueda, novedades que requieren volver a empezar, o
 * suspensiones de la vacante.
 *
 * Es un log append-only (las reglas Firestore impiden update/delete): cada
 * entrada queda fija con su autor y fecha. Las entradas de tipo `suspension` y
 * `reactivacion` además cambian el estado de la vacante (a `pausada` y de vuelta
 * al estado previo), guardando el cambio en `estado_anterior`/`estado_nuevo`.
 */

export const tipoNovedadVacante = z.enum([
  'reproceso_terna',   // la terna no se ajustó a la expectativa del líder → reiniciar
  'reinicio_novedad',  // novedad que obliga a volver a empezar el proceso
  'suspension',        // la vacante queda suspendida (pasa a `pausada`)
  'reactivacion',      // se retoma una vacante suspendida
  'observacion',       // nota general de trazabilidad
]);
export type TipoNovedadVacante = z.infer<typeof tipoNovedadVacante>;

/** Etiqueta legible para la UI. */
export const TIPO_NOVEDAD_LABEL: Record<TipoNovedadVacante, string> = {
  reproceso_terna: 'Reproceso de terna',
  reinicio_novedad: 'Reinicio por novedad',
  suspension: 'Suspensión',
  reactivacion: 'Reactivación',
  observacion: 'Observación general',
};

/** Orden en que se ofrecen los tipos en el formulario. */
export const TIPOS_NOVEDAD_VACANTE: TipoNovedadVacante[] = [
  'observacion',
  'reproceso_terna',
  'reinicio_novedad',
  'suspension',
  'reactivacion',
];

export interface NovedadVacanteDoc extends CamposAuditoria {
  id: string;
  vacante_id: string;
  vacante_consecutivo: string;
  tipo: TipoNovedadVacante;
  /** Motivo / descripción de la novedad (texto libre, obligatorio). */
  motivo: string;
  /** Solo en suspension/reactivacion: el cambio de estado que produjo. */
  estado_anterior: z.infer<typeof estadoVacante> | null;
  estado_nuevo: z.infer<typeof estadoVacante> | null;
  /** Snapshot del nombre de quien registró (creado_por guarda el uid). */
  registrado_por_nombre: string;
}
