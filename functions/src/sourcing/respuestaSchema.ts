import { z } from 'zod';

export const candidatoSourceadoSchema = z.object({
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  headline: z.string().min(1),
  empresa_actual: z.string().nullable(),
  cargo_actual: z.string().nullable(),
  ciudad: z.string().nullable(),
  perfil_url: z.string().url(),
  justificacion_match: z.string().min(10),
  score_match: z.number().min(0).max(100),
  /**
   * Lo agrega el cliente Gemini DESPUÉS del parse: true si la URL del perfil
   * apareció en las fuentes que Gemini realmente consultó (mayor confianza).
   * Opcional porque el modelo no lo devuelve — lo calculamos nosotros.
   */
  url_en_grounding: z.boolean().optional(),
  /**
   * true si la URL original dio 404 y se reemplazó por una búsqueda de Google.
   * El frontend muestra un aviso "buscar manualmente".
   */
  url_rota: z.boolean().optional(),
  /** URL original que dio 404 (para auditoría). */
  perfil_url_original: z.string().optional(),
});

export type CandidatoSourceado = z.infer<typeof candidatoSourceadoSchema>;

export const respuestaSourcingSchema = z.object({
  candidatos: z.array(candidatoSourceadoSchema).max(15),
  query_usada: z.string(),
  fuentes_consultadas: z.array(z.string()).default([]),
});

export type RespuestaSourcing = z.infer<typeof respuestaSourcingSchema>;
