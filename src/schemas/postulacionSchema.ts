import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';
import { motivoDescarte } from './enums';

/**
 * Postulación = la unión candidato↔proceso.
 * Mientras el `proceso` representa "una vacante que se está intentando llenar",
 * la `postulacion` representa "este candidato concreto compitiendo por ese proceso".
 *
 * Importante:
 * - El estado vive aquí (no en el candidato), porque el mismo candidato puede
 *   estar en varias postulaciones a la vez (Módulo 11 · base cross-vacante).
 * - El historial completo de hitos vive en `marcas` (mapa nombre_hito→Timestamp).
 *   Las claves de `marcas` son descriptivas (no atadas al enum) para soportar
 *   también marcas no-de-estado como `decidido_en`, `apto_medico_en`, etc.
 *   `ultima_transicion_estado` es solo conveniencia para queries.
 *
 * Este enum tiene 16 estados (vs 14 del legado) para capturar finos del flujo:
 *  - pre_entrevistado en pendiente/ok/no_interesado (el candidato puede no responder)
 *  - pruebas en enviadas/completadas (Magneto envía, candidato puede no completar)
 *  - filtrado_no_cumple como descarte temprano (Dolor #5)
 *  - desistio_candidato como salida explícita (común cuando consigue otra oferta)
 *
 * Decisión 2026-04-29: este enum reemplaza al `estadoPostulacion` legado en enums.ts.
 */

export const estadoPostulacion = z.enum([
  // Sourcing IA (paso 4.5) — identificado por Gemini, sin contacto humano todavía
  'sourceado_por_ia',

  // Entrada
  'postulado',

  // Pre-entrevista (paso 6) — desglose para capturar "el candidato no contesta"
  'pre_entrevistado_pendiente',
  'pre_entrevistado_ok',
  'pre_entrevistado_no_interesado',

  // Filtro duro (Dolor #5)
  'filtrado_no_cumple',

  // Pruebas (paso 7)
  'pruebas_enviadas',
  'pruebas_completadas',

  // Entrevista analista (paso 8)
  'entrevistado_analista',

  // Referencias (paso 9)
  'referencias_validadas',

  // Terna y decisión (pasos 12-14)
  'en_terna',
  'seleccionado_por_lider',
  'descartado_por_lider',

  // Ingreso (pasos 15-19)
  'en_examenes_medicos',
  'descartado_examenes_medicos',
  'en_contratacion',
  'contratado',

  // Salida del candidato (transversal)
  'desistio_candidato',
]);
export type EstadoPostulacion = z.infer<typeof estadoPostulacion>;

/**
 * Referencia laboral que el candidato aporta al postularse desde la landing
 * pública (contacto de un empleo anterior). El analista las valida después en
 * el paso 9 (ReferenciasTab).
 */
export const referenciaAportadaSchema = z.object({
  nombre: z.string().default(''),
  empresa: z.string().default(''),
  cargo: z.string().default(''),
  telefono: z.string().default(''),
});
export type ReferenciaAportada = z.infer<typeof referenciaAportadaSchema>;

export const fuentePostulacion = z.enum([
  'postulacion_directa',
  'magneto',
  'hunter_linkedin',
  'referido',
  'base_interna',
  'caja_compensacion',
  'instituciones',
]);
export type FuentePostulacion = z.infer<typeof fuentePostulacion>;

/**
 * Mapa de hitos: cada hito relevante deja sello de tiempo.
 * Las claves son descriptivas (`postulado_en`, `decidido_en`, `apto_medico_en`, etc.)
 * — no necesariamente coinciden con los valores del enum. Se preserva todo el
 * historial; nunca se sobreescribe.
 */
export type MarcasPostulacion = Record<string, Timestamp>;

export const postulacionInputSchema = z.object({
  // Referencias
  candidato_id: z.string().min(1),
  candidato_nombre: z.string().min(1),
  proceso_id: z.string().min(1),
  vacante_id: z.string().min(1),
  vacante_consecutivo: z.string().min(1),

  // Datos denormalizados (evitan join al listar)
  candidato_email: z.string().email().or(z.literal('')).default(''),
  candidato_telefono: z.string().default(''),
  candidato_cv_url: z.string().url().nullable().default(null),
  cargo_nombre: z.string().min(1),

  // Trazabilidad de origen
  fuente: fuentePostulacion,
  origen_publicacion_id: z.string().nullable().default(null),
  /**
   * Detalle libre opcional de la fuente cuando viene de un canal externo
   * (ej. "Magneto · aviso Promotor Plan Brisa"). Permite saber de qué
   * publicación concreta llegó el candidato.
   */
  fuente_detalle: z.string().default(''),
  analista_uid: z.string().nullable().default(null),

  // Estado
  estado: estadoPostulacion.default('postulado'),
  cumple_criterios: z.boolean().nullable().default(null),
  /**
   * Motivo tipificado del descarte. Permite agregar para análisis del pool
   * (ATR-11). Si el motivo es `otro`, se DEBE complementar con `razon_descarte`.
   */
  motivo_descarte: motivoDescarte.nullable().default(null),
  razon_descarte: z.string().nullable().default(null),
  /** Etapa donde se descartó. Texto libre — los descartes ad-hoc (ej. `'entrevista_lider'`) no siempre son un estado del enum. */
  descarte_etapa: z.string().nullable().default(null),

  // ── Referidos internos (módulo v1, 2026-06-03) ─────────────────────────────
  // Se llenan cuando la postulación entra por la landing pública con `?ref=<slug>`.
  // Se mapean en CarreraPublicaPage tras llamar `resolverRefSlug`. Cuando GH
  // apruebe el bono en v2, estos campos son la base del cálculo.
  /** Cédula del técnico que refirió. null cuando la postulación no vino por referido. */
  referido_por_cedula: z.string().nullable().default(null),
  /** Snapshot del nombre al momento de capturar — el Sheet puede mutar. */
  referido_por_nombre: z.string().nullable().default(null),
  /** ID del documento `referidos_generaciones/` que disparó esta postulación. */
  referido_generacion_id: z.string().nullable().default(null),

  // ── Referencias laborales aportadas por el candidato (landing pública) ─────
  /** true si el candidato marcó que no tiene experiencia / no aplica. */
  referencias_no_aplica: z.boolean().default(false),
  /** Contactos de referencia de empleos anteriores (típicamente 2). */
  referencias_aportadas: z.array(referenciaAportadaSchema).default([]),
});

export type PostulacionInput = z.infer<typeof postulacionInputSchema>;

export interface PostulacionDoc extends PostulacionInput, CamposAuditoria {
  id: string;
  fecha_postulacion: Timestamp;
  ultima_transicion_estado: Timestamp;
  /** Historial completo de hitos por estado. */
  marcas: MarcasPostulacion;
  // ── Portal del candidato (público, sin login) + consentimientos digitales ──
  // Los escribe el backend (Cloud Functions). El token vive además en
  // `portal_candidato_tokens/{token}` para la resolución pública.
  portal_token?: string | null;
  portal_enviado_en?: Timestamp | null;
  consentimiento_datos_aceptado_en?: Timestamp | null;
  consentimiento_imagen_aceptado_en?: Timestamp | null;
  /** Aviso a GH "carpeta lista para validar" (C.1) — se setea una sola vez. */
  carpeta_lista_validar_notificada_en?: Timestamp | null;
  /** Correo de agradecimiento al candidato descartado (D.3). */
  agradecimiento_enviado_en?: Timestamp | null;
}
