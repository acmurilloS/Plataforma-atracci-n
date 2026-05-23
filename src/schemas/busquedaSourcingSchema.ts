import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Track del estado de una búsqueda de sourcing.
 * Necesario porque Clay procesa async — el resultado llega vía callback minutos después.
 */

export const estadoBusquedaSourcing = z.enum([
  'en_proceso',  // disparada, esperando callback de Clay (o ejecutando Gemini sync)
  'completada',  // resultados ingresados a postulaciones/
  'fallida',     // error en el pipeline (timeout, key inválida, etc.)
]);
export type EstadoBusquedaSourcing = z.infer<typeof estadoBusquedaSourcing>;

export const modoBusquedaSourcing = z.enum(['clay', 'gemini', 'dummy']);
export type ModoBusquedaSourcing = z.infer<typeof modoBusquedaSourcing>;

export interface BusquedaSourcingDoc extends CamposAuditoria {
  id: string;
  vacante_id: string;
  vacante_consecutivo: string;
  analista_uid: string;
  estado: EstadoBusquedaSourcing;
  modo: ModoBusquedaSourcing;

  /** Criterios enviados al proveedor (para auditoría). */
  cargo_nombre: string;
  ciudad: string;
  criterios: string;
  empresas_competencia: string;

  iniciada_en: Timestamp;
  completada_en: Timestamp | null;

  encontrados: number | null;
  postulaciones_ids: string[];
  error_msg: string | null;
}
