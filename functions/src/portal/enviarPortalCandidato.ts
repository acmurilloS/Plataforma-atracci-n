import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import { emailAnalistaDeVacante } from '../notificaciones/emailAnalista';
import { generarSlug } from '../referidos/generarSlug';
import { DIAS_VIGENCIA_TOKEN } from './tokenVigente';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * enviarPortalCandidato · Portal del candidato (público, sin login).
 *
 * Los candidatos NO tienen cuenta en la plataforma. Esta callable le crea (o
 * reutiliza) un token de acceso y le manda por correo el link a su portal
 * `/portal/{token}`, donde podrá LEER y ACEPTAR el tratamiento de datos y el
 * acuerdo de imagen y voz por sí mismo (con registro de fecha + evidencia), en
 * vez de depender de que el analista imprima y le haga firmar a mano.
 *
 * El token vive en `portal_candidato_tokens/{token}` con un snapshot de los
 * datos que el portal muestra; la resolución pública la hace `resolverPortalToken`.
 */
export const enviarPortalCandidato = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '').trim();
    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

    const postRef = db.collection('postulaciones').doc(postulacionId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    if (!email) {
      throw new HttpsError(
        'failed-precondition',
        'El candidato no tiene correo registrado. Agrégalo en Datos Básicos.',
      );
    }
    const candidatoNombre = String(post.candidato_nombre ?? '').trim() || 'candidato/a';
    const cargo = String(post.cargo_nombre ?? 'la vacante').trim();

    // Snapshot para el token: cédula del candidato + empresa de la vacante.
    let documentoNumero = '';
    let empresaCodigo = String(post.empresa_codigo ?? '').trim();
    try {
      if (post.candidato_id) {
        const c = await db.collection('candidatos').doc(String(post.candidato_id)).get();
        if (c.exists) documentoNumero = String(c.data()?.documento_numero ?? '').trim();
      }
      if (!empresaCodigo && post.vacante_id) {
        const v = await db.collection('vacantes').doc(String(post.vacante_id)).get();
        if (v.exists) empresaCodigo = String(v.data()?.empresa_codigo ?? '').trim();
      }
    } catch (e) {
      logger.warn('[portal] no se pudieron leer datos extra', {
        postulacionId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    const snapshot = {
      candidato_nombre: candidatoNombre,
      documento_numero: documentoNumero,
      cargo_nombre: cargo,
      empresa_codigo: empresaCodigo || 'EQT',
    };

    // Reusar token si la postulación ya tiene uno; si no, crear uno nuevo.
    let token = String(post.portal_token ?? '').trim();
    const tokensCol = db.collection('portal_candidato_tokens');
    if (!token) {
      token = generarSlug(10);
      await tokensCol.doc(token).set({
        token,
        postulacion_id: postulacionId,
        candidato_id: post.candidato_id ?? null,
        vacante_id: post.vacante_id ?? null,
        ...snapshot,
        revocado: false,
        expira_en: nuevaCaducidad(),
        creado_en: FieldValue.serverTimestamp(),
        creado_por: req.auth.uid,
      });
    } else {
      // Mantener el snapshot fresco (la cédula pudo completarse después) y
      // extender la vigencia + re-habilitar al reenviar.
      await tokensCol
        .doc(token)
        .set({ ...snapshot, revocado: false, expira_en: nuevaCaducidad() }, { merge: true });
    }

    const url = `${APP_URL}/portal/${token}`;

    const correoAnalista = await emailAnalistaDeVacante(post.vacante_id as string | null | undefined);

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        replyTo: correoAnalista || undefined,
        subject: `Tu portal del proceso · ${cargo} · Equitel`,
        html: construirHtml({ nombre: candidatoNombre, cargo, url }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[portal] correo falló', { postulacionId, msg });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta en un momento.');
    }

    await postRef.update({
      portal_token: token,
      portal_enviado_en: FieldValue.serverTimestamp(),
    });

    await db.collection('eventos').add({
      tipo: 'portal_candidato_enviado',
      postulacion_id: postulacionId,
      vacante_id: post.vacante_id ?? null,
      email_destinatario: email,
      analista_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[portal] link enviado al candidato', { postulacionId, email });
    return { ok: true as const, url, email_destinatario: email };
  },
);

function construirHtml(args: { nombre: string; cargo: string; url: string }): string {
  const primer = args.nombre.split(' ')[0] || args.nombre;
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
      <p>Hola ${escapeHtml(primer)},</p>
      <p>¡Gracias por avanzar en tu proceso para el cargo
         <strong>${escapeHtml(args.cargo)}</strong> en Equitel!</p>
      <p>Para continuar, te pedimos ingresar a tu <strong>portal del proceso</strong> y leer y
         aceptar dos autorizaciones: el <strong>tratamiento de tus datos personales</strong> y el
         <strong>acuerdo de uso de imagen y voz</strong>. Es rápido y queda registrado
         automáticamente — no tienes que imprimir ni firmar nada a mano.</p>
      <p style="margin:22px 0;">
        <a href="${escapeAttr(args.url)}"
           style="display:inline-block;background:#be1e0d;color:#ffffff;text-decoration:none;
                  padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">
          Abrir mi portal →
        </a>
      </p>
      <p style="font-size:12px; color:#777;">Si el botón no funciona, copia y pega este enlace en tu
         navegador:<br>${escapeHtml(args.url)}</p>
      <p style="font-size:13px; color:#555;">Gracias,<br>Equipo de Atracción · Organización Equitel</p>
    </div>
  `.trim();
}

function nuevaCaducidad(): Timestamp {
  return Timestamp.fromMillis(Date.now() + DIAS_VIGENCIA_TOKEN * 24 * 60 * 60 * 1000);
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
