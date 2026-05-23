import type { Timestamp } from 'firebase/firestore';

export interface CamposAuditoria {
  creado_en: Timestamp | null;
  creado_por: string;
  actualizado_en: Timestamp | null;
  actualizado_por: string;
}
