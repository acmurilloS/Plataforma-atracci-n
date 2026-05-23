import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

export const festivoInputSchema = z.object({
  fecha: z.date(),
  descripcion: z.string().min(1).max(120),
  anio: z.number().int().min(2020).max(2100),
  origen: z.enum(['manual', 'colombian-holidays']).default('manual'),
});

export type FestivoInput = z.infer<typeof festivoInputSchema>;

export interface FestivoDoc extends Omit<FestivoInput, 'fecha'>, CamposAuditoria {
  id: string;
  fecha: Timestamp;
}
