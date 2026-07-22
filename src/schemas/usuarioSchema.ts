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
  /**
   * Rol 'gerente' (reu Karen jul-2026): conjunto de IDs de `unidades` cuyas
   * vacantes puede ver este gerente. Es la fuente que la UI usa para el filtro
   * (`unidad_id in [...]`) y se refleja también como custom claim `unidades_gerente`
   * para que las reglas de Firestore lo apliquen (frontera real). Ausente/vacío
   * para roles que no son gerente.
   */
  unidades_gerente: z.array(z.string()).optional(),
});

export type UsuarioInput = z.infer<typeof usuarioInputSchema>;

export interface UsuarioDoc extends UsuarioInput, CamposAuditoria {
  id: string;
}
