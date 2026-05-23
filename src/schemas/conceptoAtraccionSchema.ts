import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Concepto de Atracción y Desarrollo · VIDA-F-03 v0.
 * Resumen ejecutivo a nivel de vacante con la lista de candidatos relevantes.
 * Lo diligencia la analista para presentar la terna al líder.
 */

export const candidatoConceptoSchema = z.object({
  postulacion_id: z.string().min(1),
  nombre: z.string().min(1),
  ciudad: z.string().default(''),
  edad: z.string().default(''),
  formacion: z.string().default(''),
  experiencia: z.string().default(''),
  concepto: z.string().default(''),
});
export type CandidatoConcepto = z.infer<typeof candidatoConceptoSchema>;

export interface ConceptoAtraccionDoc extends CamposAuditoria {
  id: string;
  vacante_id: string;
  vacante_consecutivo: string;
  empresa_codigo: string;
  empresa_nombre: string;
  unidad_id: string;
  unidad_nombre: string;
  sede_codigo: string;
  sede_nombre: string;
  cargo_id: string;
  cargo_nombre: string;
  analista_uid: string;
  analista_nombre: string;
  fecha_concepto: Timestamp;
  candidatos: CandidatoConcepto[];
}
