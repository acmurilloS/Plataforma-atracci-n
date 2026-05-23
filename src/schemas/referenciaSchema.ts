import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Verificación de Referencias · alineado al formato oficial Equitel VIDA-F-12 v2.
 * Cubre el paso 9 del flujograma.
 */

export const resultadoReferencia = z.enum(['positiva', 'neutra', 'negativa']);
export type ResultadoReferencia = z.infer<typeof resultadoReferencia>;

export const recontrataria = z.enum(['si', 'no', 'con_reservas']);
export type Recontrataria = z.infer<typeof recontrataria>;

export const relacionLaboral = z.enum([
  'jefe_directo',
  'jefe_indirecto',
  'par',
  'subordinado',
  'cliente_interno',
  'otro',
]);
export type RelacionLaboral = z.infer<typeof relacionLaboral>;

// ─── Datos que captura el analista al crear la referencia (antes de contactar) ───
export const referenciaInputSchema = z.object({
  // Identidad de la referencia
  empresa_contactada: z.string().min(1, 'Empresa requerida'),
  nombre_contacto: z.string().min(1, 'Nombre del contacto requerido'),
  cargo_contacto: z.string().default(''),
  telefono_contacto: z.string().min(7, 'Teléfono inválido'),
  email_contacto: z.string().email().or(z.literal('')).default(''),

  // Contexto del aspirante en esa empresa
  cargo_aspirante: z.string().default(''),
  tiempo_laborado: z.string().default(''),
  rango_salarial: z.string().default(''),
  relacion_laboral: relacionLaboral.optional(),
});

export type ReferenciaInput = z.infer<typeof referenciaInputSchema>;

// ─── Datos del cuestionario que se llena al verificar la referencia ───
export const referenciaVerificacionSchema = z.object({
  funciones_responsabilidades: z.string().default(''),
  fortalezas_caracteristicas: z.string().default(''),
  logros: z.string().default(''),
  areas_mejora: z.string().default(''),
  descripcion_desempeno: z.string().default(''),
  recontrataria: recontrataria.nullable().default(null),
  recontrataria_porque: z.string().default(''),
  motivo_retiro: z.string().default(''),
  observaciones: z.string().default(''),
  resultado: resultadoReferencia,
});

export type ReferenciaVerificacionInput = z.infer<typeof referenciaVerificacionSchema>;

// ─── Documento completo en Firestore ───
export interface ReferenciaDoc extends ReferenciaInput, CamposAuditoria {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  candidato_nombre: string;

  // Estado de verificación
  verificada: boolean;
  verificada_en: Timestamp | null;
  verificada_por_uid: string | null;
  verificada_por_nombre: string | null;

  // Cuestionario VIDA-F-12 (todos opcionales hasta que se verifique)
  funciones_responsabilidades: string;
  fortalezas_caracteristicas: string;
  logros: string;
  areas_mejora: string;
  descripcion_desempeno: string;
  recontrataria: Recontrataria | null;
  recontrataria_porque: string;
  motivo_retiro: string;
  observaciones: string;
  resultado: ResultadoReferencia | null;
}
