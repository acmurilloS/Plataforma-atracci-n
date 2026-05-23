import { z } from 'zod';
import { areaApoyo, codigoEmpresaSede, rolUsuario } from './enums';
import type { CamposAuditoria } from './auditoria';

export const usuarioInputSchema = z.object({
  email: z.string().email(),
  nombre: z.string().min(1).max(80),
  apellido: z.string().min(1).max(80),
  rol: rolUsuario,
  area_apoyo: areaApoyo.nullable(),
  empresa_codigo: codigoEmpresaSede.nullable(),
  sede_codigo: codigoEmpresaSede.nullable(),
  unidad_id: z.string().nullable(),
  activo: z.boolean().default(true),
});

export type UsuarioInput = z.infer<typeof usuarioInputSchema>;

export interface UsuarioDoc extends UsuarioInput, CamposAuditoria {
  id: string;
}
