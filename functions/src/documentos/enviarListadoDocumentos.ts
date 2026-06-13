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
 * enviarListadoDocumentos · paso 10.
 *
 * Los candidatos NO tienen acceso a la plataforma. Esta callable le manda al
 * candidato un correo con la LISTA de documentos que debe reunir y enviar de
 * vuelta (respondiendo al correo), para que el analista los cargue en la
 * carpeta digital. Petición de Karen 2026-06-12.
 *
 * La lista de documentos la arma el frontend (sabe el catálogo + qué está
 * pendiente); acá solo se redacta y envía el correo, vía el Gmail corporativo.
 */
export const enviarListadoDocumentos = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '');
    const documentos = (Array.isArray(req.data?.documentos) ? req.data.documentos : [])
      .map((d: unknown) => String(d ?? '').trim())
      .filter((d: string) => d.length > 0);
    const mensajeExtra = String(req.data?.mensaje ?? '').trim();

    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
    if (documentos.length === 0) {
      throw new HttpsError('invalid-argument', 'No hay documentos pendientes para enviar.');
    }

    const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    if (!email) {
      throw new HttpsError(
        'failed-precondition',
        'El candidato no tiene correo registrado. Agrégalo en Datos Básicos.',
      );
    }
    const nombreCandidato = String(post.candidato_nombre ?? '').trim() || 'candidato/a';
    const cargo = String(post.cargo_nombre ?? 'la vacante').trim();

    const itemsHtml = documentos
      .map((d: string) => `<li style="margin:0 0 4px;">${escapeHtml(d)}</li>`)
      .join('');

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(nombreCandidato.split(' ')[0] || nombreCandidato)},</p>
        <p>¡Felicitaciones! Para continuar con tu proceso para el cargo
           <strong>${escapeHtml(cargo)}</strong> en Equitel, necesitamos que nos hagas llegar
           los siguientes documentos:</p>
        <ul style="font-size:14px; padding-left:20px; margin:8px 0 14px;">
          ${itemsHtml}
        </ul>
        ${mensajeExtra ? `<p style="font-size:13px; color:#333;">${escapeHtml(mensajeExtra).replace(/\n/g, '<br>')}</p>` : ''}
        <p style="font-size:14px;"><strong>¿Cómo enviarlos?</strong> Responde a este mismo correo
          adjuntando los documentos en PDF o como foto legible. Nosotros los cargamos por ti.</p>
        <p style="font-size:13px; color:#555;">Cualquier duda, responde a este correo.</p>
        <p style="font-size:13px; color:#555;">Gracias,<br>Equipo de Atracción · Organización Equitel</p>
      </div>
    `.trim();

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        subject: `Documentos requeridos para tu vinculación · ${cargo}`,
        html,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[enviarListadoDocumentos] correo falló', { postulacionId, msg });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta en un momento.');
    }

    await db.collection('eventos').add({
      tipo: 'listado_documentos_enviado',
      postulacion_id: postulacionId,
      documentos_solicitados: documentos,
      cantidad: documentos.length,
      vacante_id: post.vacante_id ?? null,
      analista_uid: req.auth.uid,
      email_destinatario: email,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[enviarListadoDocumentos] listado enviado', {
      postulacionId,
      cantidad: documentos.length,
    });

    return { ok: true as const, enviados: documentos.length, email_destinatario: email };
  },
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
