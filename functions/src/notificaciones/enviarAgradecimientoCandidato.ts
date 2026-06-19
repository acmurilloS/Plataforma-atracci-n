import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from './enviarConGmail';
import { envolverMarca } from './plantillasMensajes';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/**
 * enviarAgradecimientoCandidato · D.3 (lote GH 16-jun).
 *
 * Manda al candidato descartado un correo de agradecimiento (Plantilla 1, con la
 * pieza de marca de Equitel). El TEXTO lo redacta (y edita) el analista en la UI —
 * esta callable solo lo envía. Importante: el mensaje NO debe mencionar la causa
 * del descarte (crítico en descartes por exámenes médicos); de eso se encarga la
 * plantilla editable del frontend.
 *
 * Reply-to apunta al analista del proceso. Sale por la fachada provider-agnostic.
 */
export const enviarAgradecimientoCandidato = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '').trim();
    const mensaje = String(req.data?.mensaje ?? '').trim();
    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
    if (mensaje.length < 10) {
      throw new HttpsError('invalid-argument', 'El mensaje es demasiado corto.');
    }

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
    const cargo = String(post.cargo_nombre ?? '').trim();

    // Reply-to al analista del proceso.
    let analistaEmail = '';
    if (post.vacante_id) {
      const v = await db.collection('vacantes').doc(String(post.vacante_id)).get();
      const analistaUid = String(v.data()?.analista_uid ?? '').trim();
      if (analistaUid) {
        const u = await db.collection('usuarios').doc(analistaUid).get();
        if (u.exists) analistaEmail = String(u.data()?.email ?? '').trim();
      }
    }

    // El mensaje editable del analista es el cuerpo; lo envolvemos en la pieza de
    // marca "Buen día" de Equitel (Plantilla 1).
    const cuerpo = `<div style="white-space:normal;">${escapeHtml(mensaje).replace(/\n/g, '<br>')}</div>`;
    const html = envolverMarca(cuerpo, {
      preheader: 'Gracias por tu participación en nuestro proceso.',
    });

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        replyTo: analistaEmail || undefined,
        subject: cargo ? `Gracias por tu participación · ${cargo}` : 'Gracias por tu participación',
        html,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.error('[agradecimiento] correo falló', { postulacionId, m });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta en un momento.');
    }

    // Persistir el texto para que el portal lo muestre en estado finalizado
    // (F6). NUNCA se expone la causa del descarte; solo este mensaje amable.
    await postRef.update({
      agradecimiento_enviado_en: FieldValue.serverTimestamp(),
      mensaje_portal_descarte: mensaje,
    });
    await db.collection('eventos').add({
      tipo: 'agradecimiento_candidato_enviado',
      postulacion_id: postulacionId,
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
