import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import { emailAnalistaDePostulacion } from '../notificaciones/emailAnalista';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

interface PruebaInput {
  nombre: string;
  link: string;
}

/**
 * enviarPruebaCandidato · paso 7.
 *
 * Registra una o VARIAS pruebas enviadas Y le manda UN solo correo al candidato
 * con todos los links — desde el aplicativo (decisión JC 2026-06-09, en respuesta
 * a Karen). Permite mandar varias pruebas de una (ej. todas las del cargo).
 *
 * Reusa el Gmail SMTP corporativo (steve@equitel.com.co) que ya manda los
 * recordatorios al líder — sin costo nuevo. El candidato es un postulado que
 * dejó su correo al aplicar, así que escribirle sobre su propio proceso es
 * legítimo (no aplica el bloqueo de Habeas Data del sourcing).
 *
 * El `link` es flexible: sirve para Magneto, un formulario, o cualquier
 * plataforma donde viva la prueba.
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
    const instrucciones = String(req.data?.instrucciones ?? '').trim();

    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

    // Normalizar y validar la lista de pruebas (al menos una con nombre + link válido).
    const crudas = Array.isArray(req.data?.pruebas) ? (req.data.pruebas as unknown[]) : [];
    const pruebas: PruebaInput[] = crudas
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return { nombre: String(o.nombre ?? '').trim(), link: String(o.link ?? '').trim() };
      })
      .filter((p) => p.nombre && /^https?:\/\//i.test(p.link));

    if (pruebas.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Agrega al menos una prueba con nombre y link válido (debe empezar por http/https).',
      );
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

    // 1) Registrar cada prueba (mismo shape que el registro manual + campos de envío).
    const pruebaIds: string[] = [];
    for (const pr of pruebas) {
      const pruebaRef = db.collection('pruebas').doc();
      await pruebaRef.set({
        id: pruebaRef.id,
        postulacion_id: postulacionId,
        candidato_id: post.candidato_id ?? null,
        proceso_id: post.proceso_id ?? null,
        tipo,
        proveedor: 'externo',
        codigo_prueba: pr.nombre.toLowerCase().replace(/\s+/g, '_'),
        nombre: pr.nombre,
        link_prueba: pr.link,
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
      pruebaIds.push(pruebaRef.id);
    }

    // 2) Mandar UN correo con todas las pruebas.
    const bloquesPruebas = pruebas
      .map(
        (pr) => `
        <div style="margin:0 0 18px; padding-bottom:14px; border-bottom:1px solid #eee;">
          <p style="font-size:15px; font-weight:600; margin:0 0 8px;">${escapeHtml(pr.nombre)}</p>
          <p style="margin:0 0 8px;">
            <a href="${escapeAttr(pr.link)}"
               style="background:#be1e0d; color:#fff; text-decoration:none; padding:10px 20px;
                      border-radius:6px; font-weight:600; display:inline-block;">
              Realizar la prueba
            </a>
          </p>
          <p style="font-size:12px; color:#666; margin:0; word-break:break-all;">
            O copia este enlace: <a href="${escapeAttr(pr.link)}" style="color:#be1e0d;">${escapeHtml(
              pr.link,
            )}</a>
          </p>
        </div>`,
      )
      .join('');

    const plural = pruebas.length > 1;
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(nombreCandidato.split(' ')[0] || nombreCandidato)},</p>
        <p>Como parte del proceso de atracción para el cargo
           <strong>${escapeHtml(cargo)}</strong> en Equitel, te compartimos
           ${plural ? 'las siguientes pruebas' : 'una prueba'} que necesitamos que completes:</p>
        ${bloquesPruebas}
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

    // Las respuestas del candidato deben llegar al analista del proceso, no a Steve (FROM).
    const replyToAnalista = await emailAnalistaDePostulacion(postulacionId);

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        subject: `${plural ? 'Pruebas' : 'Prueba'} del proceso de atracción · ${cargo}`,
        html,
        replyTo: replyToAnalista || undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[enviarPruebaCandidato] correo falló', { postulacionId, msg });
      // Dejar rastro de que los registros existen pero el correo no salió.
      await Promise.all(
        pruebaIds.map((pid) =>
          db.collection('pruebas').doc(pid).update({ email_enviado_en: null, email_error: msg }),
        ),
      );
      throw new HttpsError(
        'internal',
        'Las pruebas quedaron registradas pero el correo no se pudo enviar. Revisa la configuración de correo o reintenta.',
      );
    }

    await db.collection('eventos').add({
      tipo: 'prueba_enviada_candidato',
      postulacion_id: postulacionId,
      prueba_ids: pruebaIds,
      cantidad: pruebas.length,
      vacante_id: post.vacante_id ?? null,
      analista_uid: req.auth.uid,
      email_destinatario: email,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[enviarPruebaCandidato] pruebas enviadas por correo', {
      postulacionId,
      cantidad: pruebas.length,
    });

    return {
      ok: true as const,
      enviadas: pruebas.length,
      prueba_ids: pruebaIds,
      email_destinatario: email,
    };
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
