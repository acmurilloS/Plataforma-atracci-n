import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from './enviarConGmail';
import { envolverMarca } from './plantillasMensajes';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <Steve-noresponder@equitel.com.co>';

/**
 * enviarAgradecimientoCandidato · D.3 (lote GH 16-jun).
 *
 * Manda al candidato descartado un correo de agradecimiento (Plantilla 1, con la
 * pieza de marca de Equitel). Dos vías, mismo core:
 *  - Manual (esta callable): el analista redacta/edita el texto en la UI.
 *  - Automática (trigger onPostulacionDescartada): al pasar a un estado de descarte
 *    se envía el texto por defecto (neutro) — reu 26-jun / audit 22 ítems (#17).
 *
 * El mensaje NUNCA menciona la causa del descarte (crítico en exámenes médicos):
 * hay validación anti-revelación server-side. Reply-to al analista del proceso.
 */

/** Mensaje de agradecimiento por defecto (neutro, sin causa). Usado por el envío automático. */
export function mensajeAgradecimientoDefault(nombre: string, cargo: string): string {
  const primer = String(nombre ?? '').split(' ')[0] || 'integrante';
  return (
    `Hola ${primer},\n\n` +
    `Te agradecemos sinceramente tu interés y el tiempo que dedicaste a nuestro proceso de ` +
    `atracción${cargo ? ` para el cargo ${cargo}` : ''} en Equitel.\n\n` +
    `En esta ocasión hemos continuado con otros integrantes. Valoramos mucho tu participación y ` +
    `conservaremos tu perfil para futuras oportunidades.\n\n` +
    `Te deseamos muchos éxitos.\n\n` +
    `Cordialmente,\nEquipo de Atracción · Organización Equitel`
  );
}

// Palabras que NUNCA pueden aparecer en un descarte por exámenes médicos (confidencial).
const PROHIBIDAS_MEDICO: { re: RegExp; t: string }[] = [
  { re: /ex[áa]men/i, t: 'examen' },
  { re: /m[ée]dic/i, t: 'médico' },
  { re: /\bsalud\b/i, t: 'salud' },
  { re: /\bapto\b|\baptitud\b/i, t: 'apto/aptitud' },
  { re: /diagn[óo]stic/i, t: 'diagnóstico' },
  { re: /\benfermedad/i, t: 'enfermedad' },
  { re: /patolog[íi]a/i, t: 'patología' },
  { re: /\bincapacidad/i, t: 'incapacidad' },
  { re: /laboratorio/i, t: 'laboratorio' },
  { re: /\beps\b/i, t: 'EPS' },
];

/**
 * Core del agradecimiento: valida (anti-revelación en descarte médico), envía el
 * correo (reply-to analista) y persiste el mensaje + la marca `agradecimiento_
 * enviado_en` + evento. Lo usan la callable (manual) y el trigger (automático).
 */
export async function enviarAgradecimientoCore(
  postRef: DocumentReference,
  post: Record<string, unknown>,
  postulacionId: string,
  mensaje: string,
  porUid: string,
): Promise<{ email: string }> {
  // Anti-revelación: en descarte por exámenes médicos el mensaje NUNCA menciona la causa.
  if (String(post.estado ?? '') === 'descartado_examenes_medicos') {
    const hit = PROHIBIDAS_MEDICO.find((p) => p.re.test(mensaje));
    if (hit) {
      throw new HttpsError(
        'failed-precondition',
        `Descarte confidencial: el mensaje no puede mencionar la causa médica (detecté "${hit.t}"). Redáctalo en tono neutro de agradecimiento.`,
      );
    }
  }

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

  // Persistir el texto (el portal lo muestra en estado finalizado) + marca de enviado.
  await postRef.update({
    agradecimiento_enviado_en: FieldValue.serverTimestamp(),
    mensaje_portal_descarte: mensaje,
  });
  await db.collection('eventos').add({
    tipo: 'agradecimiento_candidato_enviado',
    postulacion_id: postulacionId,
    email_destinatario: email,
    analista_uid: porUid,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: porUid,
  });

  return { email };
}

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

    const { email } = await enviarAgradecimientoCore(postRef, post, postulacionId, mensaje, req.auth.uid);
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
