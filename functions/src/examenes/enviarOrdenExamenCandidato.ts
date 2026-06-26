import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail, type AdjuntoCorreo } from '../notificaciones/enviarConGmail';
import { leerConfigExamenes } from './configExamenes';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * enviarOrdenExamenCandidato · paso 16.
 *
 * GH/analista, desde la ficha de exámenes, le manda al candidato el correo con
 * su orden de exámenes médicos: centro médico, dirección, indicaciones y el link
 * de la orden. El reply-to apunta al analista del proceso (los candidatos sí
 * tienen correo, pero el FROM es el buzón no monitoreado del asistente).
 *
 * Los datos (centro/dirección/instrucciones/orden) ya quedaron en el doc
 * `examenes_medicos` al confirmar el envío desde la UI.
 */
export const enviarOrdenExamenCandidato = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const examenId = String(req.data?.examen_id ?? '').trim();
    if (!examenId) throw new HttpsError('invalid-argument', 'Falta examen_id.');

    const exRef = db.collection('examenes_medicos').doc(examenId);
    const exSnap = await exRef.get();
    if (!exSnap.exists) throw new HttpsError('not-found', 'La solicitud de exámenes no existe.');
    const ex = exSnap.data() as Record<string, unknown>;

    const postId = String(ex.postulacion_id ?? '');
    let email = '';
    let nombreCandidato = String(ex.candidato_nombre ?? '').trim();
    let portalToken = '';
    if (postId) {
      const p = await db.collection('postulaciones').doc(postId).get();
      if (p.exists) {
        const pd = p.data() ?? {};
        email = String(pd.candidato_email ?? '').trim();
        if (!nombreCandidato) nombreCandidato = String(pd.candidato_nombre ?? '').trim();
        portalToken = String(pd.portal_token ?? '').trim();
      }
    }
    if (!email) {
      throw new HttpsError(
        'failed-precondition',
        'El candidato no tiene correo registrado. Agrégalo en Datos Básicos.',
      );
    }

    // Reply-to al analista del proceso.
    let analistaEmail = '';
    if (ex.vacante_id) {
      const v = await db.collection('vacantes').doc(String(ex.vacante_id)).get();
      const analistaUid = String(v.data()?.analista_uid ?? '').trim();
      if (analistaUid) {
        const u = await db.collection('usuarios').doc(analistaUid).get();
        if (u.exists) analistaEmail = String(u.data()?.email ?? '').trim();
      }
    }

    const centro = String(ex.centro_medico ?? '').trim();
    const direccion = String(ex.orden_direccion ?? '').trim();
    const instrucciones = String(ex.orden_instrucciones ?? '').trim();
    const ordenUrl = String(ex.orden_url ?? '').trim();
    const cargo = String(ex.cargo_nombre ?? 'tu proceso').trim();
    const primer = nombreCandidato.split(' ')[0] || nombreCandidato || 'candidato/a';

    // Fecha/cita opcional (si la analista la puso) + botón de Google Calendar.
    const citaMs = (ex.cita_para as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;
    const cita = citaMs ? new Date(citaMs) : null;
    const fechaCitaTxt = cita
      ? cita.toLocaleString('es-CO', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'America/Bogota',
        })
      : '';
    const gcalUrl = cita
      ? construirGCalUrl({
          titulo: `Exámenes médicos de ingreso · ${cargo}`,
          inicio: cita,
          fin: new Date(cita.getTime() + 2 * 60 * 60 * 1000),
          detalle: `Centro: ${centro || '—'}.${instrucciones ? ' Indicaciones: ' + instrucciones : ''}`,
          ubicacion: direccion || centro || '',
        })
      : '';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(primer)},</p>
        <p>Para continuar con tu proceso para el cargo <strong>${escapeHtml(cargo)}</strong> en
           Equitel, debes realizar tus <strong>exámenes médicos de ingreso</strong>. Estos son los
           datos:</p>
        <table style="border-collapse:collapse; font-size:14px; margin:8px 0 14px;">
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Centro médico:</td><td>${escapeHtml(
            centro || '—',
          )}</td></tr>
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Dirección:</td><td>${escapeHtml(
            direccion || '—',
          )}</td></tr>
          ${
            fechaCitaTxt
              ? `<tr><td style="padding:2px 10px 2px 0; font-weight:600;">Fecha / cita:</td><td>${escapeHtml(
                  fechaCitaTxt,
                )}</td></tr>`
              : ''
          }
        </table>
        ${
          instrucciones
            ? `<p style="font-size:14px;"><strong>Indicaciones:</strong> ${escapeHtml(
                instrucciones,
              ).replace(/\n/g, '<br>')}</p>`
            : ''
        }
        ${
          ordenUrl
            ? `<p style="margin:16px 0;"><a href="${escapeAttr(
                ordenUrl,
              )}" style="display:inline-block;background:#be1e0d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">Ver / descargar tu orden médica →</a></p>`
            : ''
        }
        ${
          gcalUrl
            ? `<p style="margin:8px 0;"><a href="${escapeAttr(
                gcalUrl,
              )}" style="display:inline-block;color:#be1e0d;text-decoration:none;font-size:13px;font-weight:600;">Agregar a Google Calendar →</a></p>`
            : ''
        }
        <p style="font-size:13px; color:#555;">Cualquier duda, responde a este correo.</p>
        ${
          portalToken
            ? `<p style="font-size:13px; color:#555;">También puedes seguir tu proceso en tu portal:
                 <a href="${APP_URL}/portal/${portalToken}" style="color:#be1e0d;">revisa tu portal</a>.</p>`
            : ''
        }
        <p style="font-size:13px; color:#555;">Gracias,<br>Equipo de Atracción · Organización Equitel</p>
      </div>
    `.trim();

    // Adjuntar el PDF de la orden (si hay url) — best-effort, además del link.
    const attachments: AdjuntoCorreo[] = [];
    if (ordenUrl) {
      try {
        const r = await fetch(ordenUrl, { signal: AbortSignal.timeout(10000) });
        if (r.ok) {
          attachments.push({
            filename: `Orden de exámenes${cargo ? ` - ${cargo}` : ''}.pdf`,
            content: Buffer.from(await r.arrayBuffer()),
            contentType: 'application/pdf',
          });
        }
      } catch (e) {
        logger.warn('[ordenCandidato] no se pudo adjuntar la orden', {
          examenId,
          m: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Modo prueba: redirige el correo del candidato al correo de prueba (demo).
    const cfg = await leerConfigExamenes();
    const to = cfg.modo_prueba && cfg.redirige_candidato ? cfg.correo_prueba : [email];

    try {
      await enviarConGmail({
        from: FROM,
        to,
        replyTo: analistaEmail || undefined,
        subject: `Tu orden de exámenes médicos · ${cargo} · Equitel`,
        html,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.error('[ordenCandidato] correo falló', { examenId, m });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta en un momento.');
    }

    await exRef.update({ orden_correo_candidato_en: FieldValue.serverTimestamp() });
    await db.collection('eventos').add({
      tipo: 'orden_examen_enviada_candidato',
      examen_id: examenId,
      postulacion_id: postId || null,
      email_destinatario: email,
      analista_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { ok: true as const, email_destinatario: to.join(', ') };
  },
);

function construirGCalUrl(args: {
  titulo: string;
  inicio: Date;
  fin: Date;
  detalle: string;
  ubicacion: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.titulo,
    dates: `${fmt(args.inicio)}/${fmt(args.fin)}`,
    details: args.detalle,
    location: args.ubicacion,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

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
