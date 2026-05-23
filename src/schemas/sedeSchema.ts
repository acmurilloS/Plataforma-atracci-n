import { z } from 'zod';
import { codigoEmpresaSede } from './enums';
import type { CamposAuditoria } from './auditoria';

export const sedeInputSchema = z.object({
  codigo: codigoEmpresaSede,
  empresa_codigo: codigoEmpresaSede,
  nombre: z.string().min(1).max(120),
  direccion: z.string().max(200).default(''),
  ciudad: z.string().min(1).max(80),
  activo: z.boolean().default(true),
});

export type SedeInput = z.infer<typeof sedeInputSchema>;

export interface SedeDoc extends SedeInput, CamposAuditoria {
  id: string;
}
