import { z } from 'zod';
import { categoriaCargo, criticidad } from './enums';
import type { CamposAuditoria } from './auditoria';

export const herramientasSugeridasSchema = z.object({
  computador: z.boolean().default(false),
  office: z.boolean().default(false),
  labroides: z.boolean().default(false),
  dotacion: z.boolean().default(false),
});

export const cargoInputSchema = z
  .object({
    nombre: z.string().min(1).max(150),
    categoria: categoriaCargo,
    criticidad_sugerida: criticidad,
    banda_min: z.number().positive().nullable(),
    banda_max: z.number().positive().nullable(),
    requiere_licencia: z.boolean().default(false),
    requiere_moto: z.boolean().default(false),
    requiere_tarjeta_profesional: z.boolean().default(false),
    requiere_titulo_profesional: z.boolean().default(false),
    pruebas_sugeridas: z.array(z.string()).default([]),
    herramientas_sugeridas: herramientasSugeridasSchema.default({
      computador: false,
      office: false,
      labroides: false,
      dotacion: false,
    }),
    activo: z.boolean().default(true),
  })
  .refine(
    (d) => {
      if (d.banda_min != null && d.banda_max != null) {
        return d.banda_min <= d.banda_max;
      }
      return true;
    },
    { message: 'banda_min no puede ser mayor que banda_max', path: ['banda_max'] },
  );

export type CargoInput = z.infer<typeof cargoInputSchema>;

export interface CargoDoc extends CargoInput, CamposAuditoria {
  id: string;
}
