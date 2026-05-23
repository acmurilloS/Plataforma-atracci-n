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
});

export type CandidatoSourceado = z.infer<typeof candidatoSourceadoSchema>;

export const respuestaSourcingSchema = z.object({
  candidatos: z.array(candidatoSourceadoSchema).max(15),
  query_usada: z.string(),
  fuentes_consultadas: z.array(z.string()).default([]),
});

export type RespuestaSourcing = z.infer<typeof respuestaSourcingSchema>;
