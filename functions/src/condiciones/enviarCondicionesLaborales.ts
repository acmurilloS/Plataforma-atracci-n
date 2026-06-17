import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * enviarCondicionesLaborales · E (lote GH 16-jun).
 *
 * Tras aprobar exámenes (candidato en 'en_contratacion'), el analista le envía al
 * candidato sus condiciones laborales: cargo, empresa, unidad, salario, horario y
 * tipo de contrato. El candidato las acepta en su portal (esa aceptación se guarda).
 *
 * Guarda las condiciones en la postulación para que el portal las muestre.
 * TODO: plantilla/wording final y "perfil del cargo en PDF" pendientes de Karen.
 */
export const enviarCondicionesLaborales = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '').trim();
    const horario = String(req.data?.horario ?? '').trim().slice(0, 200);
    const tipoContrato = String(req.data?.tipo_contrato ?? '').trim().slice(0, 120);
    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

    const postRef = db.collection('postulaciones').doc(postulacionId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    if (!email) {
      throw new HttpsError('failed-precondition', 'El candidato no tiene correo registrado.');
    }
    const cargo = String(post.cargo_nombre ?? '').trim();
    const token = String(post.portal_token ?? '').trim();

    // Datos de la vacante (salario, empresa, unidad, sede) + reply-to analista.
    let empresa = '';
    let unidad = '';
    let sede = '';
    let salario = '';
    let analistaEmail = '';
    try {
      if (post.vacante_id) {
        const v = await db.collection('vacantes').doc(String(post.vacante_id)).get();
        const vd = v.data() ?? {};
        empresa = String(vd.empresa_nombre ?? '').trim();
        unidad = String(vd.unidad_nombre ?? '').trim();
        sede = String(vd.sede_nombre ?? '').trim();
        const sb = Number(vd.salario_base ?? 0);
        salario = sb > 0 ? `$ ${sb.toLocaleString('es-CO')}` : '';
        const analistaUid = String(vd.analista_uid ?? '').trim();
        if (analistaUid) {
          const u = await db.collection('usuarios').doc(analistaUid).get();
          if (u.exists) analistaEmail = String(u.data()?.email ?? '').trim();
        }
      }
    } catch (e) {
      logger.warn('[condiciones] no se pudo leer la vacante', { postulacionId, e: String(e) });
    }

    const primer = String(post.candidato_nombre ?? '').trim().split(' ')[0] || 'candidato/a';
    const portalLink = token ? `${APP_URL}/portal/${token}` : '';
    const filas: [string, string][] = [
      ['Cargo', cargo || '—'],
      ['Empresa', empresa || '—'],
      ['Unidad', unidad || '—'],
      ['Sede', sede || '—'],
      ['Salario', salario || '—'],
      ['Horario', horario || '—'],
      ['Tipo de contrato', tipoContrato || '—'],
    ];
    const filasHtml = filas
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 12px 2px 0;font-weight:600;">${k}:</td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join('');

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(primer)},</p>
        <p>¡Felicitaciones! Estas son las <strong>condiciones laborales</strong> de tu vinculación
           con Equitel:</p>
        <table style="border-collapse:collapse; font-size:14px; margin:8px 0 16px;">${filasHtml}</table>
        ${
          portalLink
            ? `<p style="margin:16px 0;"><a href="${escapeAttr(
                portalLink,
              )}" style="display:inline-block;background:#be1e0d;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Revisar y aceptar en mi portal →</a></p>`
            : '<p>Para aceptarlas, ingresa a tu portal del candidato.</p>'
        }
        <p style="font-size:13px; color:#555;">Cualquier duda, responde a este correo.</p>
        <p style="font-size:13px; color:#555;">Equipo de Atracción · Organización Equitel</p>
      </div>`.trim();

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        replyTo: analistaEmail || undefined,
        subject: `Tus condiciones laborales · ${cargo} · Equitel`,
        html,
      });
    } catch (e) {
      logger.error('[condiciones] correo falló', { postulacionId, e: String(e) });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta.');
    }

    await postRef.update({
      condiciones_laborales: {
        cargo,
        empresa,
        unidad,
        sede,
        salario,
        horario,
        tipo_contrato: tipoContrato,
      },
      condiciones_enviadas_en: FieldValue.serverTimestamp(),
    });
    await db.collection('eventos').add({
      tipo: 'condiciones_laborales_enviadas',
      postulacion_id: postulacionId,
      analista_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { ok: true as const, email_destinatario: email };
  },
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
