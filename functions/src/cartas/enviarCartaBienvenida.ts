import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail, type AdjuntoCorreo } from '../notificaciones/enviarConGmail';
import { envolverMarca, escapeHtml, leerPlantillas } from '../notificaciones/plantillasMensajes';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <Steve-noresponder@equitel.com.co>';

/**
 * enviarCartaBienvenida · reu 18-ago (#4b). El frontend genera la carta de
 * bienvenida oficial ya personalizada (nombre + familiares) con pdf-lib y la manda
 * en base64; esta callable la ADJUNTA y se la envía por correo al candidato (con
 * copia a coordinación), sin pasar por Storage. Registra el envío en la postulación.
 *
 * Sale por la fachada provider-agnostic (Gmail hoy / SendGrid mañana).
 */
export const enviarCartaBienvenida = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '').trim();
    const pdfBase64 = String(req.data?.pdf_base64 ?? '').trim();
    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
    if (!pdfBase64) throw new HttpsError('invalid-argument', 'Falta el PDF de la carta.');
    // Tope defensivo (~8 MB de base64) para no aceptar payloads absurdos.
    if (pdfBase64.length > 8_000_000) {
      throw new HttpsError('invalid-argument', 'El PDF de la carta es demasiado grande.');
    }

    const postRef = db.collection('postulaciones').doc(postulacionId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    if (!email) {
      throw new HttpsError('failed-precondition', 'El candidato no tiene correo registrado.');
    }
    const nombre = String(post.candidato_nombre ?? '').trim();
    const primer = nombre.split(' ')[0] || 'candidato/a';

    // Copia a coordinación (responsables del proceso), best-effort.
    let coordEmails: string[] = [];
    try {
      const cs = await db
        .collection('usuarios')
        .where('rol', '==', 'coordinador')
        .where('activo', '==', true)
        .get();
      coordEmails = cs.docs.map((c) => String(c.data()?.email ?? '').trim()).filter(Boolean);
    } catch (e) {
      logger.warn('[carta-bienvenida] no se pudieron leer coordinadores', {
        postulacionId,
        e: String(e),
      });
    }

    const { footerEmpresas } = await leerPlantillas();
    const cuerpo =
      `<p style="margin:0 0 12px;">Hola ${escapeHtml(primer)},</p>` +
      '<p style="margin:0 0 12px;">¡Te damos la bienvenida a la Organización Equitel! ' +
      'Adjunto a este correo encontrarás tu <strong>carta de bienvenida</strong>.</p>' +
      '<p style="margin:0 0 12px;">Estamos muy felices de que hagas parte de nuestro equipo. ' +
      'En los próximos días te contactaremos para tu proceso de conexión, presentarte al equipo ' +
      'y resolver cualquier duda que tengas.</p>' +
      '<p style="margin:0;">¡Felicitaciones y muchos éxitos!</p>';
    const html = envolverMarca(cuerpo, { footerEmpresas });

    const attachments: AdjuntoCorreo[] = [
      {
        filename: `Carta de bienvenida${nombre ? ` - ${nombre}` : ''}.pdf`,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      },
    ];

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        cc: coordEmails.length ? coordEmails : undefined,
        subject: '¡Bienvenido/a a la Organización Equitel!',
        html,
        attachments,
      });
    } catch (e) {
      logger.error('[carta-bienvenida] correo falló', { postulacionId, e: String(e) });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta.');
    }

    await postRef.update({
      carta_bienvenida_enviada_en: FieldValue.serverTimestamp(),
      carta_bienvenida_enviada_por: req.auth.uid,
    });
    await db.collection('eventos').add({
      tipo: 'carta_bienvenida_enviada',
      postulacion_id: postulacionId,
      copia_a: coordEmails.length,
      por_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { ok: true as const, email_destinatario: email };
  },
);
