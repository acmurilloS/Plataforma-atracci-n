import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import { codigoEmpresaSede, criticidad } from './enums';
import type { CamposAuditoria } from './auditoria';

/**
 * Proceso = un intento de cubrir una vacante.
 * Si la vacante se reabre (se declara desierta o se descarta toda la terna y
 * se vuelve a buscar), se crea un nuevo proceso con `numero_intento` mayor
 * y la vacante referencia el último activo en `proceso_activo_id`.
 *
 * Cubre el paso 3 del flujograma (perfilamiento) y orquesta los pasos 4-19
 * a través de las postulaciones que cuelgan de él.
 */

export const estadoProceso = z.enum([
  'activo',
  'pausado',
  'cerrado_exitoso',
  'cerrado_desierto',
  'cerrado_cancelado',
]);
export type EstadoProceso = z.infer<typeof estadoProceso>;

// ---- Perfilamiento (objeto embebido — paso 3) ----
export const herramientasRequeridasSchema = z.object({
  computador: z.boolean().default(false),
  office: z.boolean().default(false),
  labroides: z.boolean().default(false),
  dotacion: z.boolean().default(false),
});
export type HerramientasRequeridas = z.infer<typeof herramientasRequeridasSchema>;

export const perfilamientoInputSchema = z.object({
  criterios_texto: z
    .string()
    .min(10, 'Describe los criterios con al menos 10 caracteres')
    .max(2000, 'Máximo 2000 caracteres'),
  empresas_competencia: z.array(z.string().min(1)).default([]),
  herramientas_requeridas: herramientasRequeridasSchema,
  fecha_entrevista_lider_pactada: z.date({
    required_error: 'Pacta una fecha de entrevista con el líder',
    invalid_type_error: 'Fecha inválida',
  }),
  notas: z.string().max(1000).default(''),
});
export type PerfilamientoInput = z.infer<typeof perfilamientoInputSchema>;

export interface PerfilamientoDoc {
  criterios_texto: string;
  empresas_competencia: string[];
  herramientas_requeridas: HerramientasRequeridas;
  fecha_entrevista_lider_pactada: Timestamp;
  /** Se marca true/false en el paso 14 según si el líder respetó la fecha pactada (Dolor 3). */
  compromiso_agenda_lider_cumplido: boolean | null;
  notas: string;
  completado_en: Timestamp | null;
}

// ---- Proceso ----
export const procesoInputSchema = z.object({
  // Identidad y referencias
  vacante_id: z.string().min(1),
  vacante_consecutivo: z.string().min(1),
  numero_intento: z.number().int().positive().default(1),

  // Estado
  estado: estadoProceso.default('activo'),

  // Asignación (puede arrancar null y asignarse en perfilamiento)
  analista_uid: z.string().nullable(),
  analista_nombre: z.string().nullable(),

  // Datos denormalizados de la vacante (snapshot al crear el proceso)
  empresa_codigo: codigoEmpresaSede,
  sede_codigo: codigoEmpresaSede,
  unidad_id: z.string().min(1),
  cargo_id: z.string().min(1),
  cargo_nombre: z.string().min(1),
  cargo_criticidad_al_crear: criticidad,

  // Perfilamiento embebido (paso 3) — opcional al crear, obligatorio al guardar paso 3
  perfilamiento: perfilamientoInputSchema.nullable().default(null),
});

export type ProcesoInput = z.infer<typeof procesoInputSchema>;

export interface ProcesoDoc
  extends Omit<ProcesoInput, 'perfilamiento'>,
    CamposAuditoria {
  id: string;
  perfilamiento: PerfilamientoDoc | null;

  // Tiempos del ciclo de vida
  fecha_inicio: Timestamp | null;
  fecha_cierre: Timestamp | null;
  razon_cierre: string | null;
}
