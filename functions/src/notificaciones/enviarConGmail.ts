import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from 'firebase-functions/v2';

/**
 * Transporte único de correo: Gmail SMTP vía nodemailer.
 *
 * Decisión 2026-05-29: alineamos la Plataforma de Atracción con el patrón ya
 * probado del Repositorio Jurídico (Legal) — ambos productos mandan correo
 * desde la misma cuenta Workspace usando una App Password de Google. Esto
 * elimina la dependencia de Resend (donde `equitel.com.co` estaba secuestrado
 * por un team huérfano que no podemos reclamar) y nos da una arquitectura
 * consistente entre productos del holding.
 *
 * Credenciales (secrets de Firebase Functions, debe declararlos quien invoca):
 *  - `GMAIL_USER`         · cuenta autenticada (debe tener "Send mail as"
 *                           configurado para steve@equitel.com.co si el FROM
 *                           difiere del usuario autenticado).
 *  - `GMAIL_APP_PASSWORD` · App Password de 16 caracteres generada en
 *                           https://myaccount.google.com/apppasswords.
 *
 * El transporter se cachea entre invocaciones para no pagar el handshake TLS
 * en cada correo dentro de la misma instancia de la function.
 */

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const user = (process.env.GMAIL_USER ?? '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error(
      'GMAIL_USER y/o GMAIL_APP_PASSWORD no configurados. Siembra los secrets antes de enviar correo.',
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return cachedTransporter;
}

/** Adjunto de correo (p. ej. el PDF del perfil del cargo). */
export interface AdjuntoCorreo {
  filename: string;
  /** Contenido binario del adjunto. */
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface EnviarCorreoOpts {
  /** Display name + dirección. Ej: 'Plataforma de Atracción Equitel <steve@equitel.com.co>'. */
  from: string;
  to: string[];
  cc?: string[];
  /** Dirección a la que se dirigen las respuestas (Reply-To). Útil cuando el
   *  FROM es un buzón no monitoreado (Steve) y las respuestas deben ir a una
   *  persona real (ej. el analista que lleva el proceso). */
  replyTo?: string;
  subject: string;
  html: string;
  /** Texto plano de respaldo (opcional). Si no se pasa, se deriva del HTML. */
  text?: string;
  /** Adjuntos opcionales (p. ej. perfil del cargo en PDF). */
  attachments?: AdjuntoCorreo[];
}

export async function enviarConGmail(opts: EnviarCorreoOpts): Promise<void> {
  const t = getTransporter();
  try {
    await t.sendMail({
      from: opts.from,
      to: opts.to.join(', '),
      cc: opts.cc && opts.cc.length > 0 ? opts.cc.join(', ') : undefined,
      replyTo: opts.replyTo || undefined,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      attachments:
        opts.attachments && opts.attachments.length > 0
          ? opts.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
              contentType: a.contentType,
            }))
          : undefined,
    });
  } catch (e) {
    logger.error('[enviarConGmail] fallo en sendMail', {
      to: opts.to,
      subject: opts.subject,
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
