import { z } from 'zod';
import { codigoEmpresaSede } from './enums';
import type { CamposAuditoria } from './auditoria';

export const empresaInputSchema = z.object({
  codigo: codigoEmpresaSede,
  nombre: z.string().min(1, 'Nombre requerido').max(120),
  razon_social: z.string().min(1).max(200),
  nit: z.string().min(5).max(20),
  activo: z.boolean().default(true),
});

export type EmpresaInput = z.infer<typeof empresaInputSchema>;

export interface EmpresaDoc extends EmpresaInput, CamposAuditoria {
  id: string;
}
