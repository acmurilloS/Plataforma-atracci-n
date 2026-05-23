import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import { codigoEmpresaSede, criticidad, estadoVacante, tipoSolicitud } from './enums';
import type { CamposAuditoria } from './auditoria';

export const vacanteInputSchema = z.object({
  empresa_codigo: codigoEmpresaSede,
  empresa_nombre: z.string().min(1),
  sede_codigo: codigoEmpresaSede,
  sede_nombre: z.string().min(1),
  unidad_id: z.string().min(1, 'Selecciona una unidad'),
  unidad_nombre: z.string().min(1),
  cargo_id: z.string().min(1, 'Selecciona un cargo'),
  cargo_nombre: z.string().min(1),
  cargo_criticidad_al_crear: criticidad,

  criticidad,
  tipo_solicitud: tipoSolicitud,
  justificacion: z
    .string()
    .min(20, 'La justificación debe tener al menos 20 caracteres')
    .max(2000, 'Máximo 2000 caracteres'),

  salario_base: z
    .number({
      required_error: 'Ingresa el salario base',
      invalid_type_error: 'Ingresa un valor numérico',
    })
    .positive('El salario debe ser mayor a 0')
    .max(100_000_000, 'Valor fuera de rango'),
  comisiones_texto: z.string().max(500).default(''),
  rodamiento: z.boolean().default(false),
  garantizado_texto: z.string().max(500).default(''),
  en_banda: z.boolean().nullable(),
  sin_banda_validada: z.boolean().default(false),
  requiere_validacion_gh: z.boolean().default(false),

  aval_url: z.string().url('Adjunta el PDF del aval antes de enviar'),

  fecha_entrevista_propuesta: z.date({
    required_error: 'Propón una fecha de entrevista',
    invalid_type_error: 'Fecha inválida',
  }),

  lider_uid: z.string().min(1),
  lider_nombre: z.string().min(1),
});

export type VacanteInput = z.infer<typeof vacanteInputSchema>;

export interface VacanteDoc extends Omit<VacanteInput, 'fecha_entrevista_propuesta'>, CamposAuditoria {
  id: string;
  consecutivo: string;
  estado: z.infer<typeof estadoVacante>;
  fecha_entrevista_propuesta: Timestamp;
  fecha_entrevista_pactada: Timestamp | null;
  aval_aprobado_por: string | null;
  aval_aprobado_en: Timestamp | null;
  proceso_activo_id: string | null;
  analista_uid: string | null;
  analista_nombre: string | null;
  cerrada_en: Timestamp | null;
  razon_cierre: string | null;
}

export { estadoVacante };
