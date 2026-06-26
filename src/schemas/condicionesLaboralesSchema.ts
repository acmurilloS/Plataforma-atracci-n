import { z } from 'zod';

/**
 * Condiciones laborales · campos económicos que diligencia la analista antes de
 * enviarlas al candidato (etapa de contratación). Validación del lado del
 * cliente; el callable `enviarCondicionesLaborales` repite la validación en el
 * servidor (no puede importar desde src/). snake_case + español.
 *
 * - salario: OBLIGATORIO.
 * - comisiones / rodamiento: OPCIONALES ("si aplica"); vacío = "No aplica".
 * - tipo_contrato: indefinido | temporal. Si temporal, tiempo_contrato obligatorio.
 */
export const TIPOS_CONTRATO = ['indefinido', 'temporal'] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];

export const condicionesLaboralesInputSchema = z
  .object({
    salario: z.string().trim().min(1, 'El salario es obligatorio.'),
    comisiones: z.string().trim().optional().default(''),
    rodamiento: z.string().trim().optional().default(''),
    horario: z.string().trim().optional().default(''),
    tipo_contrato: z.enum(TIPOS_CONTRATO),
    tiempo_contrato: z.string().trim().optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.tipo_contrato === 'temporal' && !val.tiempo_contrato) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tiempo_contrato'],
        message: 'Indica el tiempo del contrato temporal (ej. 6 meses).',
      });
    }
  });

export type CondicionesLaboralesInput = z.infer<typeof condicionesLaboralesInputSchema>;
