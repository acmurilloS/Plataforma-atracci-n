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
  'terna_recordatorio_48h',
  'terna_recordatorio_24h',
  'terna_expirada_lider',
  'terna_expirada_coordinador',
  'ticket_creado',
  'generica',
  // Ya se usaban sin estar en el enum (Concepto e Informe enviados al líder).
  'concepto_listo',
  'informe_listo',
  // Reloj del líder tras el Concepto (reu Karen 09-sep, punto 7).
  'reloj_lider_aviso',
  'reloj_lider_recordatorio',
  'reloj_lider_pausa',
  'reloj_lider_pausa_equipo',
  'reloj_lider_bloqueado',
  // La persona contratada salió del proceso y la vacante se reabrió (15-oct).
  'vacante_reabierta',
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
  /**
   * true = aviso informativo solo para la campana: onNotificacionCreate NO manda
   * correo (p. ej. "el líder reenvió la solicitud corregida" a coordinación, que
   * ya la ve en el tablero). Opcional; ausente = también va por correo.
   */
  solo_campana?: boolean;
}
