import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

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
    if (postId) {
      const p = await db.collection('postulaciones').doc(postId).get();
      if (p.exists) {
        const pd = p.data() ?? {};
        email = String(pd.candidato_email ?? '').trim();
        if (!nombreCandidato) nombreCandidato = String(pd.candidato_nombre ?? '').trim();
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
        <p style="font-size:13px; color:#555;">Cualquier duda, responde a este correo.</p>
        <p style="font-size:13px; color:#555;">Gracias,<br>Equipo de Atracción · Organización Equitel</p>
      </div>
    `.trim();

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        replyTo: analistaEmail || undefined,
        subject: `Tu orden de exámenes médicos · ${cargo} · Equitel`,
        html,
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

    return { ok: true as const, email_destinatario: email };
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
