import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Notificaciones internas para usuarios de la plataforma.
 * Se disparan desde acciones de workflow (aval aprobado, informe enviado al líder,
 * exámenes solicitados, etc.) y aparecen en el inbox del destinatario.
 */

export const tipoNotificacion = z.enum([
  'aval_aprobado',
  'aval_rechazado',
  'vacante_publicada',
  'informe_enviado',
  'exam_solicitado',
  'exam_concepto_recibido',
  'terna_lista',
  'ticket_creado',
  'generica',
]);
export type TipoNotificacion = z.infer<typeof tipoNotificacion>;

export interface NotificacionDoc extends CamposAuditoria {
  id: string;
  destinatario_uid: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  /** URL relativa dentro de la plataforma para navegar al recurso. */
  link: string | null;
  leida: boolean;
  leida_en: Timestamp | null;
}
