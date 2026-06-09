import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/**
 * enviarPruebaCandidato · paso 7.
 *
 * Registra una prueba enviada Y le manda el correo al candidato con el link
 * para que la realice — todo desde el aplicativo (decisión JC 2026-06-09, en
 * respuesta a Karen: "automatizarlo para que quede dentro del aplicativo la
 * opción de enviar pruebas").
 *
 * Reusa el Gmail SMTP corporativo (steve@equitel.com.co) que ya manda los
 * recordatorios al líder — sin costo nuevo de mensajería. El candidato es un
 * postulado que dejó su correo al aplicar, así que escribirle sobre su propio
 * proceso es legítimo (no aplica el bloqueo de Habeas Data del sourcing).
 *
 * El `link` es flexible: sirve para Magneto, un formulario, o cualquier
 * plataforma donde viva la prueba. La analista pega el link y la plataforma
 * arma el correo.
 */
export const enviarPruebaCandidato = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Solo analista, coordinador o admin.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '');
    const tipo = String(req.data?.tipo ?? 'psicotecnica');
    const nombrePrueba = String(req.data?.nombre_prueba ?? '').trim();
    const link = String(req.data?.link ?? '').trim();
    const instrucciones = String(req.data?.instrucciones ?? '').trim();

    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
    if (!nombrePrueba) throw new HttpsError('invalid-argument', 'Falta el nombre de la prueba.');
    if (!link || !/^https?:\/\//i.test(link)) {
      throw new HttpsError('invalid-argument', 'El link de la prueba debe empezar por http(s)://');
    }

    const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    if (!email) {
      throw new HttpsError(
        'failed-precondition',
        'El candidato no tiene correo registrado. Agrégalo en Datos Básicos antes de enviar la prueba.',
      );
    }
    const nombreCandidato = String(post.candidato_nombre ?? '').trim() || 'candidato/a';
    const cargo = String(post.cargo_nombre ?? 'la vacante').trim();

    const ahora = Timestamp.now();

    // 1) Registrar la prueba (mismo shape que el registro manual + campos de envío).
    const pruebaRef = db.collection('pruebas').doc();
    await pruebaRef.set({
      id: pruebaRef.id,
      postulacion_id: postulacionId,
      candidato_id: post.candidato_id ?? null,
      proceso_id: post.proceso_id ?? null,
      tipo,
      proveedor: 'externo',
      codigo_prueba: nombrePrueba.toLowerCase().replace(/\s+/g, '_'),
      nombre: nombrePrueba,
      link_prueba: link,
      instrucciones: instrucciones || null,
      enviada_en: ahora,
      email_enviado_en: ahora,
      email_destinatario: email,
      realizada_en: null,
      resultado_url: null,
      resultado_resumen: null,
      competencias: null,
      cumple_expectativas: null,
      creado_en: ahora,
      creado_por: req.auth.uid,
      actualizado_en: ahora,
      actualizado_por: req.auth.uid,
    });

    // 2) Mandar el correo al candidato.
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(nombreCandidato.split(' ')[0] || nombreCandidato)},</p>
        <p>Como parte del proceso de selección para el cargo
           <strong>${escapeHtml(cargo)}</strong> en Equitel, te compartimos una prueba que
           necesitamos que completes:</p>
        <p style="font-size:15px; font-weight:600;">${escapeHtml(nombrePrueba)}</p>
        <p style="margin:24px 0;">
          <a href="${escapeAttr(link)}"
             style="background:#be1e0d; color:#fff; text-decoration:none; padding:11px 22px;
                    border-radius:6px; font-weight:600; display:inline-block;">
            Realizar la prueba
          </a>
        </p>
        <p style="font-size:13px; color:#555;">
          O copia este enlace en tu navegador:<br>
          <a href="${escapeAttr(link)}" style="color:#be1e0d;">${escapeHtml(link)}</a>
        </p>
        ${
          instrucciones
            ? `<p style="font-size:13px; color:#333;"><strong>Instrucciones:</strong><br>${escapeHtml(
                instrucciones,
              ).replace(/\n/g, '<br>')}</p>`
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
        subject: `Prueba del proceso de selección · ${cargo}`,
        html,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[enviarPruebaCandidato] correo falló', { postulacionId, msg });
      // Dejamos rastro de que el registro existe pero el correo no salió.
      await pruebaRef.update({ email_enviado_en: null, email_error: msg });
      throw new HttpsError(
        'internal',
        'La prueba quedó registrada pero el correo no se pudo enviar. Revisa la configuración de correo o reintenta.',
      );
    }

    await db.collection('eventos').add({
      tipo: 'prueba_enviada_candidato',
      postulacion_id: postulacionId,
      prueba_id: pruebaRef.id,
      vacante_id: post.vacante_id ?? null,
      analista_uid: req.auth.uid,
      email_destinatario: email,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[enviarPruebaCandidato] prueba enviada por correo', {
      postulacionId,
      prueba_id: pruebaRef.id,
    });

    return { ok: true as const, prueba_id: pruebaRef.id, email_destinatario: email };
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
  return s.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}
