import { z } from 'zod';
import { codigoEmpresaSede } from './enums';
import type { CamposAuditoria } from './auditoria';

export const unidadInputSchema = z.object({
  empresa_codigo: codigoEmpresaSede,
  sede_codigo: codigoEmpresaSede,
  nombre: z.string().min(1).max(120),
  activo: z.boolean().default(true),
});

export type UnidadInput = z.infer<typeof unidadInputSchema>;

export interface UnidadDoc extends UnidadInput, CamposAuditoria {
  id: string;
}
