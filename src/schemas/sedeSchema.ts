import { z } from 'zod';
import { codigoEmpresaSede } from './enums';
import type { CamposAuditoria } from './auditoria';

export const sedeInputSchema = z.object({
  codigo: codigoEmpresaSede,
  empresa_codigo: codigoEmpresaSede,
  nombre: z.string().min(1).max(120),
  direccion: z.string().max(200).default(''),
  /**
   * Sede OFICIAL donde se entrega la dotación (DotaTrack 17-nov, A5): son nueve y la
   * dotación va a la sede de entrega, no a la ciudad de trabajo. Vacío = sin cargar.
   * Sale por la API en GET /v1/sedes.
   */
  sede_entrega: z.string().max(80).default(''),
  ciudad: z.string().min(1).max(80),
  activo: z.boolean().default(true),
  /** Mismo flag que empresas — código pendiente de validar con GH (ATR-21). */
  es_provisional: z.boolean().default(false),
});

export type SedeInput = z.infer<typeof sedeInputSchema>;

export interface SedeDoc extends SedeInput, CamposAuditoria {
  id: string;
}
