import { z } from 'zod';
import { codigoEmpresaSede } from './enums';
import type { CamposAuditoria } from './auditoria';

export const empresaInputSchema = z.object({
  codigo: codigoEmpresaSede,
  nombre: z.string().min(1, 'Nombre requerido').max(120),
  razon_social: z.string().min(1).max(200),
  nit: z.string().min(5).max(20),
  activo: z.boolean().default(true),
  /**
   * Marca que el código y/o datos son provisionales mientras GH cierra la
   * tabla oficial (ATR-21). UI muestra badge "provisional" para que sea
   * claro que estos datos cambiarán cuando llegue la matriz formal.
   */
  es_provisional: z.boolean().default(false),
});

export type EmpresaInput = z.infer<typeof empresaInputSchema>;

export interface EmpresaDoc extends EmpresaInput, CamposAuditoria {
  id: string;
}
