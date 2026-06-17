import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * onPostulacionAvance · D.1 (lote GH 16-jun).
 *
 * Cuando la postulación avanza a un hito relevante para el candidato, le manda un
 * correo breve invitándolo a entrar a su portal a ver la novedad.
 *
 * Decisión por defecto (ajustable): solo se avisa en hitos que NO tienen ya un
 * correo dedicado (la entrevista la avisa onEntrevistaCreate; la orden de
 * exámenes la avisa enviarOrdenExamenCandidato). Por eso el set excluye
 * en_examenes_medicos y solo incluye 'en_contratacion' y 'contratado'. Agregar
 * estados a AVISO_ESTADOS si Karen quiere más avisos.
 *
 * Requiere que el candidato ya tenga portal (portal_token). Dedupe por estado en
 * portal_avisos_enviados para no repetir.
 */
const AVISO_ESTADOS = new Set(['en_contratacion', 'contratado']);

export const onPostulacionAvance = onDocumentUpdated(
  {
    document: 'postulaciones/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const estadoNuevo = String(after.estado ?? '');
    if (String(before.estado ?? '') === estadoNuevo) return; // sin cambio de estado → evita loops
    if (!AVISO_ESTADOS.has(estadoNuevo)) return;

    const token = String(after.portal_token ?? '').trim();
    const email = String(after.candidato_email ?? '').trim();
    if (!token || !email) return; // sin portal o sin correo, no hay a dónde avisar

    const yaAvisados: string[] = Array.isArray(after.portal_avisos_enviados)
      ? (after.portal_avisos_enviados as string[])
      : [];
    if (yaAvisados.includes(estadoNuevo)) return;

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

    const primer = String(after.candidato_nombre ?? '').trim().split(' ')[0] || 'candidato/a';
    const url = `${APP_URL}/portal/${token}`;
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(primer)},</p>
        <p>Tu proceso en Equitel tuvo una <strong>novedad</strong>. Entra a tu portal para ver el
           estado actualizado.</p>
        <p style="margin:18px 0;">
          <a href="${escapeAttr(url)}"
             style="display:inline-block;background:#be1e0d;color:#fff;text-decoration:none;
                    padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">
            Abrir mi portal →
          </a>
        </p>
        <p style="font-size:13px; color:#555;">Equipo de Atracción · Organización Equitel</p>
      </div>
    `.trim();

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        subject: 'Novedad en tu proceso · Equitel',
        html,
      });
    } catch (e) {
      logger.error('[avance] correo falló', {
        id: event.params.id,
        e: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    await event.data!.after.ref.update({
      portal_avisos_enviados: FieldValue.arrayUnion(estadoNuevo),
    });
    logger.info('[avance] aviso de portal enviado', { id: event.params.id, estado: estadoNuevo });
  },
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
