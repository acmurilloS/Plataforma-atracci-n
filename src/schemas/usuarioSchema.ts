import { z } from 'zod';
import { areaApoyo, codigoEmpresaSede, rolUsuario, seccionAdmin } from './enums';
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
  /**
   * Override por-usuario: secciones de administración que este usuario puede
   * usar aunque su rol no sea 'admin' (ver `seccionAdmin`). Opcional; ausente o
   * vacío = sin permisos extra. Se refleja también como custom claim para que
   * las Cloud Functions y las reglas de Firestore lo respeten.
   */
  secciones_admin: z.array(seccionAdmin).optional(),
});

export type UsuarioInput = z.infer<typeof usuarioInputSchema>;

export interface UsuarioDoc extends UsuarioInput, CamposAuditoria {
  id: string;
}
