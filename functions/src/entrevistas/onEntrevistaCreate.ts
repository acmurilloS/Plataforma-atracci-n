import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/**
 * onEntrevistaCreate · pasos 8 / 13.
 *
 * Cuando el analista (o líder) agenda una entrevista, le manda al CANDIDATO un
 * correo con los datos del agendamiento (fecha, hora, modalidad, link o
 * dirección) y un botón "Agregar a Google Calendar" (link template prellenado).
 * Antes el candidato no recibía nada (petición de Karen 2026-06-12).
 *
 * Para virtuales, el link de la videollamada va en el correo y en el evento de
 * calendario. (Auto-crear el evento en el Google Calendar Workspace del
 * analista requeriría OAuth/delegación — eso queda como integración futura; el
 * link "Agregar a Google Calendar" cubre la necesidad de un click.)
 *
 * Idempotente: marca correo_candidato_enviado_en para no reenviar.
 */
export const onEntrevistaCreate = onDocumentCreated(
  {
    document: 'entrevistas/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const fresh = await snap.ref.get();
    const ent = (fresh.data() ?? {}) as Record<string, unknown>;
    if (ent.correo_candidato_enviado_en) return;

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      logger.info('onEntrevistaCreate · GMAIL_* ausentes, correo omitido', { id: snap.id });
      return;
    }

    const postId = String(ent.postulacion_id ?? '');
    if (!postId) return;
    const postSnap = await db.collection('postulaciones').doc(postId).get();
    if (!postSnap.exists) return;
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    const nombreCandidato = String(post.candidato_nombre ?? '').trim() || 'candidato/a';
    const cargo = String(post.cargo_nombre ?? 'la vacante').trim();

    const tipo = String(ent.tipo ?? 'analista'); // analista | lider
    const modalidad = String(ent.modalidad ?? 'virtual'); // virtual | presencial | telefonica
    const salaOLink = String(ent.sala_o_link ?? '').trim();
    const duracionMin = Number(ent.duracion_min ?? 45);

    // programada_para es Timestamp.
    const ts = ent.programada_para as { toDate?: () => Date } | undefined;
    const inicio = ts?.toDate ? ts.toDate() : null;
    if (!inicio) {
      logger.warn('onEntrevistaCreate · sin fecha programada', { id: snap.id });
      return;
    }
    const fin = new Date(inicio.getTime() + duracionMin * 60_000);

    const conQuien = tipo === 'lider' ? 'el líder del área' : 'la analista de selección';
    const modalidadLabel =
      modalidad === 'presencial'
        ? 'Presencial'
        : modalidad === 'telefonica'
          ? 'Telefónica'
          : 'Virtual';

    // Fecha/hora legible en zona horaria de Bogotá.
    const fechaLegible = new Intl.DateTimeFormat('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    }).format(inicio);

    // Detalle según modalidad.
    let bloqueLugar = '';
    let locationCal = '';
    if (modalidad === 'virtual' && salaOLink) {
      locationCal = salaOLink;
      bloqueLugar = `<p style="margin:0 0 6px;"><strong>Link de la videollamada:</strong><br>
        <a href="${escapeAttr(salaOLink)}" style="color:#be1e0d;">${escapeHtml(salaOLink)}</a></p>`;
    } else if (modalidad === 'presencial' && salaOLink) {
      locationCal = salaOLink;
      bloqueLugar = `<p style="margin:0 0 6px;"><strong>Dirección:</strong><br>${escapeHtml(salaOLink)}</p>`;
    } else if (modalidad === 'telefonica') {
      bloqueLugar = `<p style="margin:0 0 6px;">Te llamaremos al número que registraste.</p>`;
    }

    // Link "Agregar a Google Calendar" (template prellenado).
    const gcalUrl = construirGCalUrl({
      titulo: `Entrevista Equitel · ${cargo}`,
      inicio,
      fin,
      detalle: `Entrevista (${modalidadLabel}) para el cargo ${cargo} con ${conQuien}.${
        modalidad === 'virtual' && salaOLink ? `\nLink: ${salaOLink}` : ''
      }`,
      ubicacion: locationCal,
    });

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Hola ${escapeHtml(nombreCandidato.split(' ')[0] || nombreCandidato)},</p>
        <p>Te confirmamos el agendamiento de tu entrevista para el cargo
           <strong>${escapeHtml(cargo)}</strong> con ${conQuien}:</p>
        <table style="border-collapse:collapse; font-size:14px; margin:8px 0 14px;">
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Fecha y hora:</td><td>${escapeHtml(
            fechaLegible,
          )}</td></tr>
          <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Modalidad:</td><td>${modalidadLabel}</td></tr>
        </table>
        ${bloqueLugar}
        <p style="margin:18px 0;">
          <a href="${escapeAttr(gcalUrl)}"
             style="background:#be1e0d; color:#fff; text-decoration:none; padding:10px 20px;
                    border-radius:6px; font-weight:600; display:inline-block;">
            Agregar a Google Calendar
          </a>
        </p>
        <p style="font-size:13px; color:#555;">Si necesitas reprogramar, responde a este correo.</p>
        <p style="font-size:13px; color:#555;">¡Te esperamos!<br>Equipo de Atracción · Organización Equitel</p>
      </div>
    `.trim();

    // Correo al candidato (si tiene correo registrado).
    if (email) {
      try {
        await enviarConGmail({
          from: FROM,
          to: [email],
          subject: `Agendamiento de tu entrevista · ${cargo}`,
          html,
        });
      } catch (e) {
        logger.error('onEntrevistaCreate · correo candidato falló', {
          id: snap.id,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Entrevista con el LÍDER (paso 13): notificar al líder en su campana +
    // correo dedicado con botón "Agregar a Google Calendar". El entrevistador
    // de una entrevista 'lider' es el líder de la vacante. Petición Karen 2026-06-12.
    if (tipo === 'lider') {
      const liderUid = String(ent.entrevistador_uid ?? '');
      if (liderUid) {
        let liderEmail = '';
        let liderNombre = String(ent.entrevistador_nombre ?? '');
        try {
          const u = await getAuth().getUser(liderUid);
          liderEmail = u.email ?? '';
          if (!liderNombre) liderNombre = u.displayName ?? '';
        } catch (e) {
          logger.warn('onEntrevistaCreate · líder no encontrado en Auth', {
            liderUid,
            e: String(e),
          });
        }

        const gcalLider = construirGCalUrl({
          titulo: `Entrevista con ${nombreCandidato} · ${cargo}`,
          inicio,
          fin,
          detalle: `Entrevista (${modalidadLabel}) con el candidato ${nombreCandidato} para el cargo ${cargo}.${
            modalidad === 'virtual' && salaOLink ? `\nLink: ${salaOLink}` : ''
          }`,
          ubicacion: locationCal,
        });

        if (liderEmail) {
          const htmlLider = `
            <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
              <p>Hola ${escapeHtml(liderNombre.split(' ')[0] || liderNombre)},</p>
              <p>Quedó agendada tu entrevista con el candidato
                 <strong>${escapeHtml(nombreCandidato)}</strong> para el cargo
                 <strong>${escapeHtml(cargo)}</strong>:</p>
              <table style="border-collapse:collapse; font-size:14px; margin:8px 0 14px;">
                <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Fecha y hora:</td><td>${escapeHtml(
                  fechaLegible,
                )}</td></tr>
                <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Candidato:</td><td>${escapeHtml(
                  nombreCandidato,
                )}</td></tr>
                <tr><td style="padding:2px 10px 2px 0; font-weight:600;">Modalidad:</td><td>${modalidadLabel}</td></tr>
              </table>
              ${bloqueLugar}
              <p style="margin:18px 0;">
                <a href="${escapeAttr(gcalLider)}"
                   style="background:#be1e0d; color:#fff; text-decoration:none; padding:10px 20px;
                          border-radius:6px; font-weight:600; display:inline-block;">
                  Agregar a Google Calendar
                </a>
              </p>
              <p style="font-size:13px; color:#555;">Equipo de Atracción · Organización Equitel</p>
            </div>
          `.trim();
          try {
            await enviarConGmail({
              from: FROM,
              to: [liderEmail],
              subject: `Entrevista agendada con ${nombreCandidato} · ${cargo}`,
              html: htmlLider,
            });
          } catch (e) {
            logger.error('onEntrevistaCreate · correo líder falló', {
              id: snap.id,
              msg: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // Notificación en la campana del líder. email_enviado_en se pre-setea
        // para que onNotificacionCreate NO mande otro correo (ya enviamos el
        // dedicado con el botón de calendario).
        try {
          await db.collection('notificaciones').add({
            destinatario_uid: liderUid,
            tipo: 'generica',
            titulo: 'Entrevista agendada con candidato',
            mensaje: `Quedó agendada tu entrevista con ${nombreCandidato} (${cargo}) para el ${fechaLegible}. Modalidad: ${modalidadLabel}.`,
            link: `/postulaciones/${postId}`,
            leida: false,
            leida_en: null,
            email_enviado_en: FieldValue.serverTimestamp(),
            creado_en: FieldValue.serverTimestamp(),
            creado_por: 'system',
            actualizado_en: FieldValue.serverTimestamp(),
            actualizado_por: 'system',
          });
        } catch (e) {
          logger.warn('onEntrevistaCreate · no se pudo notificar al líder', { e: String(e) });
        }
      }
    }

    await snap.ref.update({ correo_candidato_enviado_en: FieldValue.serverTimestamp() });
    await db.collection('eventos').add({
      tipo: 'entrevista_notificada',
      entrevista_id: snap.id,
      postulacion_id: postId,
      modalidad,
      tipo_entrevista: tipo,
      email_destinatario: email || null,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
    });

    logger.info('onEntrevistaCreate · procesada', { id: snap.id, modalidad, tipo });
  },
);

function construirGCalUrl(args: {
  titulo: string;
  inicio: Date;
  fin: Date;
  detalle: string;
  ubicacion: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.titulo,
    dates: `${fmt(args.inicio)}/${fmt(args.fin)}`,
    details: args.detalle,
    location: args.ubicacion,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

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
