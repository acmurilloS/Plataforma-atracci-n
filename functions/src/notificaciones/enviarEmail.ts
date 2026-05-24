import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';

/**
 * Adaptador de envío de correo transaccional.
 *
 * Hoy (Fase 1) es un STUB: loguea el correo y registra evento en `eventos/`
 * para auditoría. Cuando se conecte Resend/SendGrid en Fase 5, sólo cambia
 * el cuerpo de esta función — el contrato y las llamadas se mantienen.
 *
 * Para activar Resend luego:
 *   1. `npm install resend` dentro de functions/
 *   2. firebase functions:secrets:set RESEND_API_KEY
 *   3. Reemplazar el bloque marcado abajo con la llamada al cliente.
 */

export interface EmailPayload {
  destinatario_email: string;
  destinatario_uid: string;
  destinatario_nombre: string;
  asunto: string;
  mensaje_texto: string;
  mensaje_html?: string;
  /** Para auditoría: qué workflow disparó este correo. */
  origen: string;
  /** Para joinear con la entidad relacionada (vacante_id, postulacion_id, etc.). */
  contexto?: Record<string, string>;
}

export async function enviarEmail(payload: EmailPayload): Promise<void> {
  const stubMode = !process.env.RESEND_API_KEY;

  if (stubMode) {
    logger.info('[email:stub] correo NO enviado (sin RESEND_API_KEY)', {
      to: payload.destinatario_email,
      asunto: payload.asunto,
      origen: payload.origen,
    });
  } else {
    // TODO Fase 5: reemplazar este bloque con la llamada real a Resend.
    // import { Resend } from 'resend';
    // const r = new Resend(process.env.RESEND_API_KEY);
    // await r.emails.send({
    //   from: 'Plataforma Atracción <atraccion@equitel.com.co>',
    //   to: payload.destinatario_email,
    //   subject: payload.asunto,
    //   html: payload.mensaje_html ?? payload.mensaje_texto,
    // });
    logger.info('[email:stub-pendiente-resend] correo registrado pero no enviado', {
      to: payload.destinatario_email,
      asunto: payload.asunto,
    });
  }

  // Bitácora de auditoría — siempre se escribe, ya sea stub o real.
  await db.collection('eventos').add({
    tipo: 'email_enviado',
    origen: payload.origen,
    destinatario_uid: payload.destinatario_uid,
    destinatario_email: payload.destinatario_email,
    asunto: payload.asunto,
    contexto: payload.contexto ?? {},
    modo: stubMode ? 'stub' : 'resend',
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
  });
}
