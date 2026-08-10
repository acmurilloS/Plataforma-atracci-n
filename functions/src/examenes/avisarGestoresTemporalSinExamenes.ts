import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import { GESTORES } from './ordenGestores';
import { leerConfigExamenes } from './configExamenes';

/**
 * avisarGestoresTemporalSinExamenes · reu Karen 04-ago.
 *
 * Cuando en la carpeta se marca el "Certificado médico" como NO aplica porque la
 * contratación es TEMPORAL (los exámenes los tramita la empresa temporal), se le
 * avisa por correo a los gestores SST para que sepan que esa vacante NO lleva
 * exámenes y no esperen la orden. Idempotente por
 * `postulaciones.temporal_sin_examenes_avisado_en`.
 */

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const FROM = 'Plataforma de Atracción Equitel <Steve-noresponder@equitel.com.co>';

const ROLES = ['analista', 'coordinador', 'gh', 'admin', 'documentacion'];

export const avisarGestoresTemporalSinExamenes = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    const rol = String((req.auth.token as Record<string, unknown>).rol ?? '');
    if (!ROLES.includes(rol)) throw new HttpsError('permission-denied', 'Rol no autorizado.');

    const postId = String(req.data?.postulacion_id ?? '').trim();
    if (!postId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

    const postRef = db.collection('postulaciones').doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'La postulación no existe.');
    const pd = postSnap.data() as Record<string, unknown>;

    if (pd.temporal_sin_examenes_avisado_en) {
      return { ok: true as const, yaAvisado: true };
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      await postRef.update({ temporal_sin_examenes_avisado_en: FieldValue.serverTimestamp() });
      return { ok: true as const, sinCorreo: true };
    }

    const nombre = String(pd.candidato_nombre ?? 'el integrante').trim();
    let cargo = String(pd.cargo_nombre ?? '').trim();
    let consecutivo = '';
    let empresa = '';
    let sede = '';
    if (pd.vacante_id) {
      const v = await db.collection('vacantes').doc(String(pd.vacante_id)).get();
      if (v.exists) {
        const vd = v.data() ?? {};
        consecutivo = String(vd.consecutivo ?? '').trim();
        empresa = String(vd.empresa_nombre ?? '').trim();
        sede = String(vd.sede_nombre ?? '').trim();
        if (!cargo) cargo = String(vd.cargo_nombre ?? '').trim();
      }
    }

    const cfg = await leerConfigExamenes();
    const to = cfg.modo_prueba ? cfg.correo_prueba : GESTORES;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Buen día,</p>
        <p>Les informamos que el siguiente proceso es una <strong>contratación TEMPORAL</strong> y
           <strong>NO aplica exámenes médicos</strong> por la plataforma — los exámenes los tramita
           directamente la empresa temporal. Por favor <strong>no esperen la orden de exámenes</strong>
           para este proceso.</p>
        <table style="border-collapse:collapse; font-size:14px; margin:8px 0 16px;">
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Integrante:</td><td>${escapeHtml(nombre)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Cargo:</td><td>${escapeHtml(cargo || '—')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Consecutivo:</td><td>${escapeHtml(consecutivo || '—')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Empresa / Sede:</td><td>${escapeHtml(
            [empresa, sede].filter(Boolean).join(' · ') || '—',
          )}</td></tr>
        </table>
        <p style="font-size:13px; color:#555;">Enviado automáticamente por la Plataforma de Atracción · Organización Equitel.</p>
      </div>`.trim();

    try {
      await enviarConGmail({
        from: FROM,
        to,
        subject: `Contratación temporal SIN exámenes médicos · ${consecutivo || cargo || nombre}`,
        html,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.error('avisarGestoresTemporalSinExamenes · correo falló', { postId, m });
      throw new HttpsError('internal', 'No se pudo avisar a los gestores. Reintenta.');
    }

    await postRef.update({ temporal_sin_examenes_avisado_en: FieldValue.serverTimestamp() });
    await db.collection('eventos').add({
      tipo: 'temporal_sin_examenes_avisado',
      postulacion_id: postId,
      vacante_id: pd.vacante_id ?? null,
      destinatarios: to,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { ok: true as const };
  },
);

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
