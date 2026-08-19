import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
import { agregarFilaSheet, valorExisteEnColumna, HOJA_REGISTRO_IT } from '../sheets/cliente';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

/**
 * reintentarSolicitudesHojaIT · reintento AUTO-SANADOR de la hoja de IT.
 *
 * Contexto (reincidencia 13-ago-2026): la pestaña "Registro" de la hoja de IT
 * quedó protegida —de nuevo— excluyendo a la cuenta de servicio, así que los
 * append fallaban. `registrarSolicitudHerramientas` es best-effort con la hoja
 * (para que el correo salga igual), pero eso dejaba la fila PERDIDA: se marcaba
 * "enviada" y la idempotencia impedía reintentar.
 *
 * Ahora, cuando el append falla, la solicitud queda ENCOLADA en el proceso
 * (`solicitud_hoja_pendiente = true` + `solicitud_hoja_fila`). Esta función
 * programada corre cada hora y:
 *   1) reintenta escribir cada fila pendiente (idempotente por consecutivo en col C);
 *   2) al lograrlo, limpia el flag → la trazabilidad se repone SOLA en cuanto IT
 *      reabra el acceso a la cuenta de servicio, sin backfills manuales;
 *   3) si algo sigue represado, alerta por correo a Atracción (máx. 1 vez/día) —
 *      convierte una falla silenciosa en una ruidosa (nos enteramos en ~1h, no
 *      cuando alguien reclama días después).
 *
 * Esto NO evita que IT vuelva a proteger la hoja (es su archivo); hace que
 * cuando pase, no se pierda nada y se auto-corrija.
 */

const GDRIVE_SERVICE_ACCOUNT_JSON = defineSecret('GDRIVE_SERVICE_ACCOUNT_JSON');
const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const SOLICITUD_HERRAMIENTAS_SHEET_ID = defineSecret('SOLICITUD_HERRAMIENTAS_SHEET_ID');

const HOJA = HOJA_REGISTRO_IT;
const FROM = 'Plataforma de Atracción Equitel <Steve-noresponder@equitel.com.co>';
/** A quién avisar cuando la hoja sigue bloqueada. */
const ALERTA_DESTINOS = ['acmurillo@equitel.com.co'];
/** No repetir la alerta más de una vez cada 24h (evita spam mientras dura el bloqueo). */
const ALERTA_CADA_MS = 24 * 60 * 60 * 1000;
const APP_URL = 'https://ptm-atraccion.web.app';

export const reintentarSolicitudesHojaIT = onSchedule(
  {
    schedule: '20 * * * *', // cada hora, minuto 20 (no choca con recordatoriosLider en :00)
    timeZone: 'America/Bogota',
    region: 'us-central1',
    secrets: [
      GDRIVE_SERVICE_ACCOUNT_JSON,
      GMAIL_USER,
      GMAIL_APP_PASSWORD,
      SOLICITUD_HERRAMIENTAS_SHEET_ID,
    ],
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const sheetId = (process.env.SOLICITUD_HERRAMIENTAS_SHEET_ID ?? '').replace(/^﻿/, '').trim();
    if (!sheetId) {
      logger.error('[reintentoHojaIT] SOLICITUD_HERRAMIENTAS_SHEET_ID no configurada; no se reintenta.');
      return;
    }

    const pend = await db
      .collection('procesos')
      .where('solicitud_hoja_pendiente', '==', true)
      .limit(200)
      .get();

    if (pend.empty) {
      logger.info('[reintentoHojaIT] no hay solicitudes represadas.');
      return;
    }

    let repuestas = 0;
    const siguenFallando: string[] = [];

    for (const d of pend.docs) {
      const p = d.data() as Record<string, unknown>;
      const fila = Array.isArray(p.solicitud_hoja_fila)
        ? (p.solicitud_hoja_fila as (string | number)[])
        : null;
      const consecutivo = fila ? String(fila[2] ?? '').trim() : String(p.consecutivo ?? '').trim();

      try {
        // Idempotencia: si el consecutivo ya está en la hoja (p. ej. IT lo metió a
        // mano o un reintento previo lo logró), solo limpiamos el flag.
        const yaEnHoja = consecutivo
          ? await valorExisteEnColumna({ spreadsheetId: sheetId, hoja: HOJA, columna: 'C', valor: consecutivo })
          : false;

        if (!yaEnHoja) {
          if (!fila) {
            // Represada sin fila almacenada (caso viejo, previo al auto-sanador):
            // no se puede reconstruir aquí → se deja pendiente y se reporta.
            throw new Error('pendiente sin solicitud_hoja_fila (requiere backfill manual)');
          }
          await agregarFilaSheet({ spreadsheetId: sheetId, hoja: HOJA, valores: fila });
        }

        await d.ref.update({
          solicitud_hoja_pendiente: false,
          solicitud_hoja_error: null,
          solicitud_hoja_repuesta_en: FieldValue.serverTimestamp(),
          solicitud_hoja_fila: FieldValue.delete(),
          solicitud_hoja_pendiente_desde: FieldValue.delete(),
        });
        repuestas++;
        logger.info('[reintentoHojaIT] fila repuesta', { consecutivo, proceso: d.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        siguenFallando.push(consecutivo || d.id);
        await d.ref.update({ solicitud_hoja_error: msg }).catch(() => undefined);
        logger.warn('[reintentoHojaIT] sigue fallando', { consecutivo, proceso: d.id, err: msg });
      }
    }

    logger.info('[reintentoHojaIT] resumen', {
      total: pend.size,
      repuestas,
      siguenFallando: siguenFallando.length,
    });

    if (siguenFallando.length > 0) {
      await alertarSiCorresponde(siguenFallando);
    }
  },
);

/**
 * Envía UN correo de alerta a Atracción cuando la hoja sigue bloqueada, con
 * throttle de 24h (doc `configuracion_global/alertas_hoja_it.ultimo_aviso_en`).
 */
async function alertarSiCorresponde(consecutivos: string[]): Promise<void> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logger.warn('[reintentoHojaIT] GMAIL_* ausentes; no se puede alertar.');
    return;
  }
  const ref = db.collection('configuracion_global').doc('alertas_hoja_it');
  const snap = await ref.get();
  const ultimoMs =
    (snap.data()?.ultimo_aviso_en as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  if (Date.now() - ultimoMs < ALERTA_CADA_MS) {
    logger.info('[reintentoHojaIT] alerta ya enviada en las últimas 24h; se omite.');
    return;
  }

  const n = consecutivos.length;
  const lista = consecutivos.slice(0, 25).join(', ') + (n > 25 ? `, … (+${n - 25})` : '');
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:22px 28px 8px;">
        <span style="display:inline-block;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;letter-spacing:.06em;padding:6px 12px;border-radius:999px;">HOJA DE IT BLOQUEADA</span>
        <h1 style="margin:16px 0 10px;font-size:22px;color:#0f172a;">${n} solicitud(es) de herramientas represada(s)</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#334155;">
          La plataforma no pudo escribir en la pestaña <strong>"${HOJA}"</strong> de la hoja de IT
          (la cuenta de servicio <strong>drive-uploader@ptm-atraccion.iam.gserviceaccount.com</strong>
          está bloqueada, probablemente por una protección de rango). Las filas quedaron <strong>encoladas</strong>
          y se escribirán solas en cuanto IT reabra el acceso — no se pierde nada.
        </p>
        <p style="margin:0 0 6px;font-size:13px;color:#64748b;">Consecutivos represados:</p>
        <p style="margin:0 0 18px;font-size:13px;color:#0f172a;font-weight:600;word-break:break-word;">${lista}</p>
        <p style="margin:0;font-size:13px;line-height:1.55;color:#334155;">
          <strong>Acción:</strong> pedir a IT que en "${HOJA}" (Datos → Proteger hojas y rangos) agregue a la
          cuenta de servicio como editor, o que proteja solo sus columnas y no toda la hoja.
        </p>
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #f1f5f9;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">Alerta automática de la Plataforma de Atracción · <a href="${APP_URL}" style="color:#be1e0d;">abrir</a></p>
      </td></tr>
    </table></body></html>`;

  try {
    await enviarConGmail({
      from: FROM,
      to: ALERTA_DESTINOS,
      subject: `⚠️ Hoja de IT bloqueada · ${n} solicitud(es) represada(s)`,
      html,
      text: `La hoja de IT ("${HOJA}") está bloqueada para la cuenta de servicio. ${n} solicitud(es) represada(s): ${lista}. Quedaron encoladas y se escribirán solas al reabrir el acceso. Pedir a IT agregar la SA como editor en la protección o proteger solo sus columnas.`,
    });
    await ref.set(
      { ultimo_aviso_en: FieldValue.serverTimestamp(), ultima_cantidad: n },
      { merge: true },
    );
    logger.info('[reintentoHojaIT] alerta enviada', { n });
  } catch (e) {
    logger.error('[reintentoHojaIT] no se pudo enviar la alerta', {
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
