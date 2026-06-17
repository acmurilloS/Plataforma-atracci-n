import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/** Plan de conexión de talentos → José (IT/talentos). Confirmado 2026-06-16. */
const JOSE_TALENTOS = 'jhoyos@equitel.com.co';

/**
 * onCandidatoContratado · F.2 (lote GH 16-jun).
 *
 * Al pasar la postulación a 'contratado' (lo hace GH al aprobar la carpeta, que
 * además YA crea los tickets de conexión — incluida dotación si el cargo aplica),
 * dispara los CORREOS de solicitud:
 *  - Plan de conexión de talentos → José + coordinación (Karen).
 *  - Dotación → coordinación (cuando el cargo aplica, detectado por los tickets
 *    de dotación ya creados). TODO: confirmar destinatario de dotación con Karen.
 *
 * Los tickets ya existen (este trigger NO los crea, solo notifica para hacerles
 * seguimiento). Idempotente con contratado_correos_enviados_en.
 *
 * TODO: plantillas exactas (plan de conexión / dotación) pendientes de Karen.
 */
export const onCandidatoContratado = onDocumentUpdated(
  {
    document: 'postulaciones/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (String(before.estado ?? '') === 'contratado' || String(after.estado ?? '') !== 'contratado')
      return;
    if (after.contratado_correos_enviados_en) return; // idempotente

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

    const postId = event.params.id;
    const nombre = String(after.candidato_nombre ?? 'el candidato').trim();
    const cargo = String(after.cargo_nombre ?? '').trim();
    const consecutivo = String(after.vacante_consecutivo ?? '').trim();

    let empresa = '';
    let sede = '';
    try {
      if (after.vacante_id) {
        const v = await db.collection('vacantes').doc(String(after.vacante_id)).get();
        const vd = v.data() ?? {};
        empresa = String(vd.empresa_nombre ?? '').trim();
        sede = String(vd.sede_nombre ?? '').trim();
      }
    } catch (e) {
      logger.warn('[contratado] no se pudo leer la vacante', { postId, e: String(e) });
    }

    // Coordinación (Karen).
    const coords: { uid: string; email: string }[] = [];
    try {
      const cs = await db
        .collection('usuarios')
        .where('rol', '==', 'coordinador')
        .where('activo', '==', true)
        .get();
      cs.forEach((c) => coords.push({ uid: c.id, email: String(c.data()?.email ?? '').trim() }));
    } catch (e) {
      logger.warn('[contratado] no se pudieron leer coordinadores', { postId, e: String(e) });
    }
    const coordEmails = coords.map((c) => c.email).filter(Boolean);

    const datos = `
      <table style="border-collapse:collapse; font-size:14px; margin:8px 0 14px;">
        <tr><td style="padding:2px 10px 2px 0;font-weight:600;">Integrante:</td><td>${escapeHtml(nombre)}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;font-weight:600;">Cargo:</td><td>${escapeHtml(cargo || '—')}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;font-weight:600;">Empresa / Sede:</td><td>${escapeHtml(
          [empresa, sede].filter(Boolean).join(' / ') || '—',
        )}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;font-weight:600;">Consecutivo:</td><td>${escapeHtml(consecutivo || '—')}</td></tr>
      </table>`;

    // 1) Plan de conexión de talentos → José + coordinación.
    try {
      await enviarConGmail({
        from: FROM,
        to: [JOSE_TALENTOS],
        cc: coordEmails.length ? coordEmails : undefined,
        subject: `Solicitud de plan de conexión de talentos · ${nombre}`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
            <p>Buen día,</p>
            <p>Se contrató un nuevo integrante. Solicitamos amablemente iniciar el
               <strong>plan de conexión de talentos</strong> (inducción / universidad corporativa)
               para:</p>
            ${datos}
            <p style="font-size:12px;color:#777;">Enviado automáticamente por la Plataforma de Atracción
               al marcar la contratación. (Plantilla preliminar — pendiente de confirmar con GH.)</p>
          </div>`,
      });
    } catch (e) {
      logger.error('[contratado] correo talentos falló', { postId, e: String(e) });
      // Que no sea un fallo silencioso: avisar a coordinación para enviarlo a mano.
      for (const c of coords) {
        if (!c.uid) continue;
        await db.collection('notificaciones').add({
          destinatario_uid: c.uid,
          tipo: 'generica',
          titulo: 'No se pudo enviar el plan de conexión',
          mensaje: `No se pudo enviar a José el plan de conexión de talentos de ${nombre}${
            cargo ? ` (${cargo})` : ''
          }. Por favor envíaselo manualmente.`,
          link: '/tickets',
          leida: false,
          leida_en: null,
          creado_en: FieldValue.serverTimestamp(),
          creado_por: 'system',
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: 'system',
        });
      }
    }

    // 2) Dotación → solo si el cargo aplica (hay tickets de dotación para esta postulación).
    let aplicaDotacion = false;
    try {
      const tk = await db
        .collection('tickets_conexion')
        .where('postulacion_id', '==', postId)
        .get();
      aplicaDotacion = tk.docs.some((d) => String(d.data()?.tipo ?? '').startsWith('dotacion'));
    } catch (e) {
      logger.warn('[contratado] no se pudieron leer tickets de dotación', { postId, e: String(e) });
    }
    // Destinatario de dotación: ya está en la plataforma → apoyo de compras + bodega
    // (usuarios con area_apoyo). Si no hay, cae a coordinación.
    let dotacionEmails: string[] = [];
    if (aplicaDotacion) {
      try {
        const ap = await db
          .collection('usuarios')
          .where('rol', '==', 'apoyo')
          .where('activo', '==', true)
          .get();
        dotacionEmails = ap.docs
          .filter((d) => ['compras', 'bodega'].includes(String(d.data()?.area_apoyo ?? '')))
          .map((d) => String(d.data()?.email ?? '').trim())
          .filter(Boolean);
      } catch (e) {
        logger.warn('[contratado] no se pudieron leer responsables de dotación', {
          postId,
          e: String(e),
        });
      }
    }
    const dotacionTo = dotacionEmails.length ? dotacionEmails : coordEmails;
    if (aplicaDotacion && dotacionTo.length) {
      try {
        await enviarConGmail({
          from: FROM,
          to: dotacionTo,
          cc: dotacionEmails.length && coordEmails.length ? coordEmails : undefined,
          subject: `Solicitud de dotación · ${nombre}`,
          html: `
            <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
              <p>Buen día,</p>
              <p>Se contrató un nuevo integrante cuyo cargo requiere <strong>dotación</strong>.
                 Solicitamos gestionar la dotación (uniforme/EPP) para:</p>
              ${datos}
              <p style="font-size:12px;color:#777;">Enviado automáticamente al marcar la contratación.</p>
            </div>`,
        });
      } catch (e) {
        logger.error('[contratado] correo dotación falló', { postId, e: String(e) });
      }
    }

    await event.data!.after.ref.update({
      contratado_correos_enviados_en: FieldValue.serverTimestamp(),
    });
    await db.collection('eventos').add({
      tipo: 'contratado_correos_enviados',
      postulacion_id: postId,
      aplica_dotacion: aplicaDotacion,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
    });
    logger.info('[contratado] correos de conexión enviados', { postId, aplicaDotacion });
  },
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
