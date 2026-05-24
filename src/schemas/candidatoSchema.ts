import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Candidato = la persona detrás de una o varias postulaciones.
 *
 * Hasta hoy se creaba ad-hoc en CarreraPublicaPage, PostulacionesPage y la
 * Cloud Function de sourcing. Sin schema tipado, cada lugar guardaba un set
 * de campos distinto y el "pool histórico" (ATR-11) era inutilizable por
 * inconsistencia.
 *
 * Decisión 2026-05-23 (post-mensaje de Maribel): el pool no se construye
 * el día 1 pero la data SÍ se captura desde el día 1 con la estructura
 * correcta para que en 2-3 meses haya pool aprovechable. Engancha con:
 *   - ATR-02: el loop "descartado_por_lider → postulado" (ya implementado)
 *   - ATR-10: validador unicornio (sus alertas alimentan tags)
 *   - Módulo 11: pool cross-vacante (futuro)
 *
 * Campos clave para el pool:
 *   - `dominio_principal` y `especialidad_tecnica` para filtrar por área
 *   - `ciudad_residencia` para queries por geografía (ej. "técnicos en Medellín")
 *   - `resumen_resultado_ultima_postulacion` para distinguir reciclables
 *     (apto_no_contratado, descartado_lider_blando) vs definitivamente fuera
 *     (no_apto_medico, desistio_repetido)
 *   - `pruebas_historial` denormalizado para ver scores sin joins
 */

export const origenCandidato = z.enum([
  'equitel_reclutamiento',  // landing pública de Equitel
  'magneto',
  'hunter_linkedin',         // sourcing manual
  'sourcing_ia',             // Gemini/Clay
  'referido',
  'base_interna',            // ya estaba en la base antes
  'caja_compensacion',
  'instituciones',
  'otro',
]);
export type OrigenCandidato = z.infer<typeof origenCandidato>;

/**
 * Dominio del candidato. Sirve para queries del pool ("buscame todos los
 * técnicos en Bogotá que pasaron pruebas pero no quedaron").
 *
 * Es DELIBERADAMENTE de granularidad gruesa — la granularidad fina vive en
 * `especialidad_tecnica` (string libre) para no encorsetar.
 */
export const dominioCandidato = z.enum([
  'ti_desarrollo',
  'ti_infraestructura',
  'ti_datos',
  'comercial',
  'comercial_b2b',
  'comercial_b2c',
  'contable_financiero',
  'administrativo',
  'operativo',
  'logistica',
  'liderazgo',
  'rrhh_talento',
  'mercadeo',
  'sin_clasificar',
]);
export type DominioCandidato = z.infer<typeof dominioCandidato>;

/**
 * Resultado consolidado de la última postulación del candidato.
 *
 * Se actualiza automáticamente cuando una postulación cambia a estado
 * terminal. Permite al pool futuro distinguir "reciclables" vs "definitivos":
 *
 *  - apto_no_contratado:  pasó todo bien pero el líder eligió otro / vacante
 *                         se cerró por otra razón → CANDIDATO IDEAL DEL POOL
 *  - descartado_lider:    el líder lo descartó (puede ser feedback blando)
 *  - filtrado_no_cumple:  no pasó filtro duro de la analista
 *  - no_apto_medico:      no apto en exámenes → no reciclar al menos por 1 año
 *  - desistio:            el candidato se cayó → respetar y no insistir
 *  - contratado:          ya quedó dentro
 *  - sin_resultado_aun:   default mientras la postulación está activa
 */
export const resultadoUltimaPostulacion = z.enum([
  'sin_resultado_aun',
  'apto_no_contratado',
  'descartado_lider',
  'filtrado_no_cumple',
  'no_apto_medico',
  'desistio',
  'contratado',
]);
export type ResultadoUltimaPostulacion = z.infer<typeof resultadoUltimaPostulacion>;

/**
 * Snapshot de una prueba completada por el candidato. Se denormaliza en el
 * candidato para que el pool pueda filtrar sin joinear con la colección de
 * pruebas. Se mantiene en orden cronológico (más reciente al final).
 */
export interface PruebaHistorialItem {
  postulacion_id: string;
  proceso_id: string | null;
  vacante_consecutivo: string;
  tipo_prueba: string;                        // 'psicotécnica', 'técnica', etc.
  resultado: 'apto' | 'no_apto' | 'reservas' | 'pendiente';
  score: number | null;                       // si la prueba devuelve numérico
  evidencia_url: string | null;
  registrada_en: Timestamp;
}

// ─── Input schema (campos editables por la UI) ─────────────────────────

export const candidatoInputSchema = z.object({
  nombres: z.string().min(1, 'Nombres requeridos').max(80),
  apellidos: z.string().min(1, 'Apellidos requeridos').max(80),
  email: z.string().email().or(z.literal('')),
  telefono: z.string().default(''),
  documento_tipo: z.enum(['CC', 'CE', 'PA', 'PEP', 'NIT']).nullable(),
  documento_numero: z.string().nullable(),
  /** True cuando no se capturó el documento (registro provisional). Pool no debe usarlos. */
  provisional: z.boolean().default(true),

  // Pool-ready: geografía
  ciudad_residencia: z.string().nullable(),

  // Pool-ready: dominio + especialidad
  dominio_principal: dominioCandidato.default('sin_clasificar'),
  especialidad_tecnica: z.string().max(150).default(''),
  /** Etiquetas técnicas / soft skills / herramientas — array libre. */
  skills_tags: z.array(z.string().min(1).max(50)).default([]),
  /** Años aproximados de experiencia. Se llena en pre-entrevista o se extrae del CV. */
  anios_experiencia_aproximados: z.number().int().min(0).max(60).nullable(),

  // Trazabilidad
  origen: origenCandidato,
  magneto_id: z.string().nullable(),
  linkedin_url: z.string().url().nullable(),
  fuente_hv_url: z.string().url().nullable(),
  observaciones: z.string().default(''),

  /**
   * uid del empleado interno que está detrás del candidato (movilidad interna).
   * Null cuando es candidato externo.
   *
   * Cubre lo que Ciesa hacía: que los empleados puedan postularse a vacantes
   * abiertas del holding. Al setearse, `origen` se fuerza a 'base_interna'
   * y la postulación queda marcada como interna en la lista.
   */
  empleado_uid: z.string().nullable().default(null),
  empleado_empresa_codigo: z.string().nullable().default(null),
  empleado_sede_codigo: z.string().nullable().default(null),

  // Compatibilidad con creaciones legacy (algunas páginas ya las usan)
  alertas: z.array(z.string()).default([]),
  alertas_tipos: z.array(z.string()).default([]),
});

export type CandidatoInput = z.infer<typeof candidatoInputSchema>;

// ─── Doc completo (Firestore) ──────────────────────────────────────────

export interface CandidatoDoc extends CandidatoInput, CamposAuditoria {
  id: string;

  // Dedupe (escrito por la Cloud Function onCandidatoCreate)
  duplicado_de: string | null;
  duplicado_detectado_en: Timestamp | null;

  // Estado consolidado cross-vacante (pool-ready)
  total_postulaciones: number;
  resultado_ultima_postulacion: ResultadoUltimaPostulacion;
  fecha_ultima_postulacion: Timestamp | null;
  ultima_vacante_id: string | null;
  ultima_vacante_consecutivo: string | null;

  // Historial denormalizado de pruebas — máx ~20 ítems razonable
  pruebas_historial: PruebaHistorialItem[];

  // Flag operativo del pool. Default true; se baja a false si:
  //   - apareció en pase judicial con flag rojo
  //   - desistió 2+ veces (no insistir)
  //   - solicitud explícita del candidato (habeas data)
  apto_para_pool_futuro: boolean;
  motivo_no_apto_pool: string | null;
}
