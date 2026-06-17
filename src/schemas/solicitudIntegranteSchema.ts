import { z } from 'zod';
import type { CamposAuditoria } from './auditoria';

/**
 * Solicitud de Integrantes · formato oficial VIDA-F-01 v08.
 *
 * Es el documento del paso 1 (el líder solicita un nuevo integrante). La mayoría
 * de los datos se auto-llenan desde la vacante; aquí guardamos solo los campos
 * que el formato pide y que la vacante NO captura (editables en la página).
 * Un doc por vacante.
 */
export const solicitudIntegranteInputSchema = z.object({
  vacante_id: z.string().min(1),
  vacante_consecutivo: z.string().default(''),

  // Datos del solicitante
  cargo_solicitante: z.string().max(160).default(''),

  // Detalles del cargo
  cargo_reporta: z.string().max(160).default(''),
  tipo_vinculacion: z.string().max(80).default(''), // de planta / temporal / ...
  sistemas: z.string().max(200).default(''), // ¿requiere herramientas/sistemas? sí / no / cuáles
  preferible_poseer: z.string().max(120).default(''), // vehículo / moto / indiferente
  disponibilidad_viajar: z.string().max(40).default(''), // sí / no
  trabajo_en: z.string().max(80).default(''), // campo / sede / in house

  // Condiciones salariales
  rodamiento_valor: z.string().max(300).default(''),
  bonificaciones_texto: z.string().max(600).default(''),
  garantizado_total: z.string().max(120).default(''),
  valor_prestacional: z.string().max(120).default(''),
  valor_no_prestacional: z.string().max(120).default(''),
  garantizado_tiempo: z.string().max(80).default(''),

  // Observaciones
  observaciones: z.string().max(1500).default(''),
});

export type SolicitudIntegranteInput = z.infer<typeof solicitudIntegranteInputSchema>;

export interface SolicitudIntegranteDoc extends SolicitudIntegranteInput, CamposAuditoria {
  id: string;
}
