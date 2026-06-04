import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Módulo · Referidos internos (v1)
 *
 * Schemas para el programa que activa la red de técnicos de Equitel como
 * hunters voluntarios para vacantes que NO tienen presencia digital
 * (mecánicos, electromecánicos, mantenimiento, etc. = 70% del volumen).
 *
 * Restricción v1: la plataforma NO envía mensajes automáticos. Solo genera
 * contenido (mensaje + lista de números formateados) para que un humano lo
 * copie/pegue manualmente a WhatsApp. La automatización entra en v2.
 *
 * Fuente de verdad de la base de técnicos = Google Sheet mantenido por RRHH.
 * La plataforma LEE en vivo, no duplica.
 */

// ─── referidos_generaciones ──────────────────────────────────────────────────
// Auditoría de cada vez que Karen "activa referidos" para una vacante.
// Server-only writes (solo Cloud Functions).

export const modoGeneracionReferidos = z.enum(['personal', 'difusion']);
export type ModoGeneracionReferidos = z.infer<typeof modoGeneracionReferidos>;

export const plantillaMensajeReferido = z.enum(['v1', 'v2', 'v3', 'custom']);
export type PlantillaMensajeReferido = z.infer<typeof plantillaMensajeReferido>;

export interface ExcluidosSummary {
  /** Técnicos en `referidos_optouts/`. */
  opt_out: number;
  /** Técnicos sin celular válido en el Sheet. */
  sin_celular: number;
  /** Excluidos por antigüedad menor a `dias_antiguedad_minima`. */
  antiguedad: number;
  /** Excluidos manualmente por Karen vía checkbox en el modal. */
  manual: number;
}

export interface ReferidoGeneracionDoc extends CamposAuditoria {
  id: string;

  vacante_id: string;
  vacante_consecutivo: string;
  cargo_nombre: string;
  sede_nombre: string;

  generado_por_uid: string;
  generado_en: Timestamp;

  modo: ModoGeneracionReferidos;
  mensaje_template: PlantillaMensajeReferido;
  /** El texto exacto del mensaje que se generó (después de interpolar las variables). */
  mensaje_usado: string;

  tecnicos_incluidos: number;
  tecnicos_excluidos: ExcluidosSummary;

  /** Karen marca cuando confirma que copió/pegó. Distinto de "generado". */
  marcada_como_enviada: boolean;
  marcada_enviada_en: Timestamp | null;
  marcada_enviada_por_uid: string | null;
}

// ─── referidos_links ─────────────────────────────────────────────────────────
// Mapeo slug → cédula del técnico referidor. El slug va en el `?ref=` de la
// landing pública en lugar de la cédula directa (evitar exponer PII).
// Lectura pública (la usa CarreraPublicaPage al postular).

export interface ReferidoLinkDoc {
  /** Slug alfanumérico aleatorio de 10 chars. ID del documento = el slug. */
  slug: string;
  cedula_tecnico: string;
  /** Snapshot del nombre al generar — el Sheet puede cambiar después. */
  nombre_tecnico: string;
  vacante_id: string;
  generacion_id: string;
  creado_en: Timestamp;
}

// ─── referidos_optouts ───────────────────────────────────────────────────────
// Técnicos que pidieron no recibir más invitaciones. El generador los
// excluye automáticamente. ID del documento = cédula del técnico.

export interface ReferidoOptOutDoc extends CamposAuditoria {
  cedula: string;
  motivo: string | null;
  registrado_por_uid: string;
  registrado_en: Timestamp;
}

// ─── configuracion_global/referidos ──────────────────────────────────────────
// Singleton (un solo doc). El admin configura desde /admin/catalogos.

export interface ConfiguracionReferidosDoc extends CamposAuditoria {
  id: 'referidos';
  /** ID del Google Sheet (la parte larga de la URL `/spreadsheets/d/<ID>/edit`). */
  sheet_id: string;
  /** Nombre exacto de la pestaña, ej. "BD_TECNICOS". */
  hoja: string;
  /**
   * Mapping de columnas. Letras de Sheets ("A", "B", "C"...). Se valida al
   * guardar haciendo un test-read inmediato. Si el Sheet cambia y rompe el
   * mapping, el callable de generación falla con error claro.
   */
  columna_cedula: string;
  columna_nombre: string;
  columna_empresa: string;
  columna_sede: string;
  columna_cargo: string;
  columna_cel_corporativo: string;
  columna_cel_personal: string;
  /** Opcional — si el Sheet aún no tiene fecha de ingreso, queda null y el filtro de antigüedad no aplica. */
  columna_fecha_ingreso: string | null;
  /** Si `columna_fecha_ingreso` es null → este valor se ignora. */
  dias_antiguedad_minima: number;
  /** Versión incremental del mapping. Si el código espera v=N y la config tiene otra → bloquea con error. */
  version_columnas: number;
}

// ─── Input validators (para callables) ───────────────────────────────────────

export const generarInvitacionesInputSchema = z.object({
  vacante_id: z.string().min(1),
  modo: modoGeneracionReferidos.default('personal'),
  mensaje_template: plantillaMensajeReferido.default('v1'),
  /** Mensaje custom (solo cuando `mensaje_template === 'custom'`). */
  mensaje_custom: z.string().nullable().default(null),
  /** Cédulas que Karen desmarcó en la tabla antes de generar. */
  cedulas_excluidas_manualmente: z.array(z.string()).default([]),
});
export type GenerarInvitacionesInput = z.infer<typeof generarInvitacionesInputSchema>;

export const resolverRefSlugInputSchema = z.object({
  slug: z.string().min(1),
});
export type ResolverRefSlugInput = z.infer<typeof resolverRefSlugInputSchema>;

export const marcarComoEnviadasInputSchema = z.object({
  generacion_id: z.string().min(1),
});
export type MarcarComoEnviadasInput = z.infer<typeof marcarComoEnviadasInputSchema>;

// ─── Tipos derivados que viajan por la callable ──────────────────────────────

/**
 * Fila que el callable devuelve por cada técnico incluido. La tabla del modal
 * la renderiza directamente.
 */
export interface TecnicoInvitado {
  cedula: string;
  nombre: string;
  empresa: string;
  sede: string;
  cargo: string;
  /** Celular ya normalizado a E.164 (+57XXXXXXXXXX). */
  celular_e164: string;
  /** Mensaje personalizado con nombre + cargo + sede + link. */
  mensaje_personalizado: string;
  /** URL `wa.me/+57...?text=...` lista para abrir chat con mensaje pre-llenado. */
  wa_me_url: string;
  /** URL pública de la landing con `?ref=<slug>`. Lo que el candidato abrirá. */
  link_landing: string;
}

export interface ResultadoGeneracionReferidos {
  ok: true;
  generacion_id: string;
  total_en_sheet: number;
  tecnicos: TecnicoInvitado[];
  excluidos: ExcluidosSummary;
  /** Mensaje genérico (modo difusión) si el modo solicitado fue 'difusion'. */
  mensaje_difusion: string | null;
  /** Link público sin ?ref para modo difusión. */
  link_landing_difusion: string | null;
}
