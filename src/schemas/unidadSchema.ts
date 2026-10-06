import { z } from 'zod';
import { codigoEmpresaSede } from './enums';
import type { CamposAuditoria } from './auditoria';

export const unidadInputSchema = z.object({
  empresa_codigo: codigoEmpresaSede,
  sede_codigo: codigoEmpresaSede,
  nombre: z.string().min(1).max(120),
  activo: z.boolean().default(true),
  /**
   * Centro de costos contable de la unidad (reu DOTATRACK 06-oct-2026): la API
   * de nuevos ingresos lo expone para que dotación le cargue el gasto al CC
   * correcto. Se llena a mano con la tabla de contabilidad (Jennifer); vacío =
   * aún no cruzado.
   */
  centro_costos: z.string().max(40).default(''),
});

export type UnidadInput = z.infer<typeof unidadInputSchema>;

export interface UnidadDoc extends UnidadInput, CamposAuditoria {
  id: string;
}
