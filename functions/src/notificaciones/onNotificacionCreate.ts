import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
import { enviarConGmail } from './enviarConGmail';

/**
 * onNotificacionCreate · cada notificación interna también se manda al
 * correo del destinatario.
 *
 * Provider: Gmail SMTP vía nodemailer (mismo patrón que el Repositorio
 * Jurídico). Remitente: `Plataforma de Atracción Equitel <steve@equitel.com.co>`.
 * La cuenta Workspace autenticada con `GMAIL_USER` debe tener "Send mail as"
 * configurado para steve@equitel.com.co (ya configurado en la cuenta que usa
 * Legal — la misma que aquí).
 *
 * Si los secrets `GMAIL_USER` / `GMAIL_APP_PASSWORD` no están sembrados, la
 * function se queda en silencio (no falla) — útil mientras se rotan creds.
 * Las notificaciones siguen apareciendo en la campanita igual.
 *
 * Idempotente: si la notificación ya tiene `email_enviado_en` no reintenta.
 */

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

export const onNotificacionCreate = onDocumentCreated(
  {
    document: 'notificaciones/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const noti = snap.data();

    if (noti.email_enviado_en) return;

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      logger.info('onNotificacionCreate · GMAIL_* ausentes, email omitido', {
        notif_id: snap.id,
      });
      return;
    }

    const uid = String(noti.destinatario_uid ?? '');
    if (!uid) {
      logger.warn('onNotificacionCreate · sin destinatario_uid', { id: snap.id });
      return;
    }

    let email = '';
    let nombre = '';
    try {
      const usr = await getAuth().getUser(uid);
      email = usr.email ?? '';
      nombre = usr.displayName ?? '';
    } catch (e) {
      logger.error('onNotificacionCreate · user no encontrado', { uid, e: String(e) });
      return;
    }
    if (!email) {
      logger.warn('onNotificacionCreate · user sin email', { uid });
      return;
    }

    const titulo = String(noti.titulo ?? 'Nueva notificación');
    const mensaje = String(noti.mensaje ?? '');
    const link = noti.link ? `${APP_URL}${noti.link}` : APP_URL;

    const html = construirHtml({ nombre, titulo, mensaje, link });

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        subject: `[Equitel Atracción] ${titulo}`,
        html,
      });

      await snap.ref.update({
        email_enviado_en: FieldValue.serverTimestamp(),
      });

      // Auditoría en eventos/
      await db.collection('eventos').add({
        tipo: 'notificacion.email_enviado',
        entidad_tipo: 'notificacion',
        entidad_id: snap.id,
        autor_uid: 'system',
        autor_rol: 'system',
        payload: { email, titulo },
        creado_en: FieldValue.serverTimestamp(),
      });

      logger.info('onNotificacionCreate · email enviado', { email, titulo });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error('onNotificacionCreate · error enviando', { e: errMsg });
      await snap.ref.update({ email_error: errMsg.slice(0, 500) });
    }
  },
);

function construirHtml(args: {
  nombre: string;
  titulo: string;
  mensaje: string;
  link: string;
}): string {
  const { nombre, titulo, mensaje, link } = args;
  const hola = nombre ? `Hola ${nombre},` : 'Hola,';
  // Email simple, compatible con la mayoría de clientes. Sin frameworks.
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${escapar(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="background:#be1e0d;padding:16px 24px;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
                Plataforma de Atracción · Equitel
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">${escapar(hola)}</p>
              <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:600;line-height:1.3;color:#0f172a;letter-spacing:-0.01em;">
                ${escapar(titulo)}
              </h1>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.55;color:#334155;">
                ${escapar(mensaje).replace(/\n/g, '<br>')}
              </p>
              <a href="${escaparAtributo(link)}"
                 style="display:inline-block;background:#be1e0d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">
                Abrir en la plataforma →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
                Este mensaje se envió porque tienes una notificación pendiente
                en la Plataforma de Atracción del holding Equitel. Para dejar
                de recibirlos, marca la notificación como leída desde la
                campanita arriba a la derecha 🔔.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escaparAtributo(s: string): string {
  return escapar(s);
}
