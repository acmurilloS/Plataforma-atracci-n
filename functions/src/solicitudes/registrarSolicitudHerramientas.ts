import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '../utils/admin';
import { agregarFilaSheet } from '../sheets/cliente';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import { emailAnalistaDeVacante } from '../notificaciones/emailAnalista';

/**
 * registrarSolicitudHerramientas · reemplazo del Google Forms de IT.
 *
 * Reunión Sebastián Orozco (2026-05-28): al guardar el perfilamiento (paso 3),
 * la plataforma debe (1) volcar la solicitud a la hoja de trazabilidad de IT y
 * (2) enviar el correo de notificación al buzón administrativo de sistemas,
 * para que cultura/desarrollo deje de llenar el formulario externo.
 *
 * Escribe SOLO el bloque izquierdo de la hoja (la "solicitud"); el bloque
 * derecho (cédula, nombre del integrante, observaciones IT, tickets, entrega)
 * lo sigue diligenciando IT.
 *
 * Idempotente: si el proceso ya tiene `solicitud_herramientas_enviada_en`, no
 * vuelve a escribir ni a enviar (evita filas y correos duplicados al re-guardar).
 */

const GDRIVE_SERVICE_ACCOUNT_JSON = defineSecret('GDRIVE_SERVICE_ACCOUNT_JSON');
const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const SOLICITUD_HERRAMIENTAS_SHEET_ID = defineSecret('SOLICITUD_HERRAMIENTAS_SHEET_ID');

/**
 * Pestaña de la hoja donde se agregan las filas. Hoy apunta a la copia de
 * pruebas ("Prueba de registros") que compartió Sebastián. Cuando pasemos a
 * producción, cambiar a la pestaña real (probablemente "Registro").
 */
const HOJA = 'Prueba de registros';

/** Remitente unificado de todo correo saliente de la plataforma. */
const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/** Buzones de IT que hoy reciben la notificación del formulario. */
const DESTINOS_IT = [
  'administrativoit@equitel.com.co',
  'sortega@equitel.com.co',
  'aparedes@equitel.com.co',
];

const APP_URL = 'https://ptm-atraccion.web.app';
const STEVE_IMG = `${APP_URL}/steve.png`;
const LOGO_IMG = `${APP_URL}/equitel.png`;

/** Etiqueta del tipo de reemplazo con el vocabulario de la hoja de IT. */
const TIPO_REEMPLAZO_LABEL: Record<string, string> = {
  reemplazo_indefinido: 'Reemplazo indefinido',
  aumento_planta: 'Aumento de planta',
  necesidad_temporal: 'Reemplazo temporal',
  reemplazo: 'Reemplazo indefinido',
  aumento: 'Aumento de planta',
};

const inputSchema = z.object({
  vacante_id: z.string().min(1),
  proceso_id: z.string().min(1),
});

interface SolicitudHerramientas {
  requiere?: boolean;
  persona_contacto?: string;
  correo_contacto?: string;
  observaciones?: string;
}

function fechaBogota(): string {
  // "29/05/2026 14:53:21" — mismo formato de la hoja (sin coma).
  return new Date()
    .toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false })
    .replace(',', '');
}

/**
 * Construye la fila en el orden EXACTO del bloque de solicitud (columnas A→AE).
 * Las posiciones que diligencia IT (tipo de equipo, Office, Siesa, mobiliario,
 * etc.) van vacías a propósito.
 */
function construirFila(args: {
  correoSolicitante: string;
  consecutivo: string;
  empresa: string;
  unidad: string;
  cargo: string;
  ciudad: string;
  sol: SolicitudHerramientas;
  liderNombre: string;
  tipoSolicitud: string;
  reemplazaA: string;
}): string[] {
  const { sol } = args;
  const requiereTxt = sol.requiere ? 'Si' : 'No';
  const personaContacto = (sol.persona_contacto || args.liderNombre || '').trim();
  const tipoReemplazo = TIPO_REEMPLAZO_LABEL[args.tipoSolicitud] ?? args.tipoSolicitud;

  return [
    fechaBogota(),                       // A · Fecha
    args.correoSolicitante,              // B · Dirección de correo electrónico
    args.consecutivo,                    // C · Consecutivo
    args.empresa,                        // D · Empresa
    args.unidad,                         // E · Unidad de negocio
    args.cargo,                          // F · Cargo
    args.ciudad,                         // G · Ciudad
    personaContacto,                     // H · Persona de contacto
    sol.correo_contacto || '',           // I · Correo persona de contacto
    requiereTxt,                         // J · ¿Requiere herramientas tecnológicas?
    '',                                  // K · Tipo equipo de computo (IT)
    '',                                  // L · Línea celular (IT)
    '',                                  // M · Equipo celular (IT)
    '',                                  // N · Extensión telefónica (IT)
    '',                                  // O · Tipo equipo extensión (IT)
    '',                                  // P · Office (IT)
    '',                                  // Q · Correo (IT)
    '',                                  // R · Siesa (IT)
    '',                                  // S · Labroides (IT)
    '',                                  // T · GP (IT)
    '',                                  // U · Grupo correo S/N (IT)
    '',                                  // V · Cuál grupo de correo (IT)
    '',                                  // W · El integrante requiere mobiliario (IT)
    '',                                  // X · Escritorio (IT)
    '',                                  // Y · Silla (IT)
    '',                                  // Z · Cajonera (IT)
    sol.observaciones || '',             // AA · Observaciones
    requiereTxt,                         // AB · Requiere herramientas
    tipoReemplazo,                       // AC · Tipo de reemplazo
    args.reemplazaA || '',               // AD · Nombre del integrante que reemplaza
    '',                                  // AE · Mismas herramientas (IT)
  ];
}

function construirCorreoHtml(args: {
  vacante_id: string;
  cargo: string;
  unidad: string;
  ciudad: string;
  empresa: string;
  consecutivo: string;
  requiere: boolean;
  tipoReemplazo: string;
  reemplazaA: string;
  personaContacto: string;
  correoContacto: string;
  observaciones: string;
}): string {
  const e = escapar;
  const requiereTxt = args.requiere ? 'Sí' : 'No (sin herramientas)';
  const pillText = args.requiere ? 'SOLICITUD DE HERRAMIENTAS' : 'INGRESO SIN HERRAMIENTAS';
  const linkVacante = `${APP_URL}/vacantes/${args.vacante_id}`;

  const filas: [string, string][] = [
    ['Consecutivo', args.consecutivo],
    ['Empresa', args.empresa],
    ['Unidad de negocio', args.unidad],
    ['Cargo', args.cargo],
    ['Ciudad', args.ciudad],
    ['¿Requiere herramientas?', requiereTxt],
    ['Tipo de reemplazo', args.tipoReemplazo],
    ['Reemplaza a', args.reemplazaA || 'N/A'],
    ['Persona de contacto', args.personaContacto || 'N/A'],
    ['Correo de contacto', args.correoContacto || 'N/A'],
    ['Observaciones', args.observaciones || 'N/A'],
  ];

  const filasHtml = filas
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;color:#94a3b8;font-size:13px;white-space:nowrap;vertical-align:top;width:175px;">${e(k)}</td><td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${e(v)}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Solicitud de herramientas</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="56" valign="middle"><img src="${STEVE_IMG}" alt="Steve" width="48" height="48" style="display:block;border:0;"></td>
              <td valign="middle" style="padding-left:8px;">
                <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;line-height:1.2;">Plataforma de Atracción</p>
                <p style="margin:3px 0 0 0;font-size:12px;color:#94a3b8;">Notificación de Steve · Asistente de Atracción</p>
              </td>
              <td width="64" align="right" valign="middle"><img src="${LOGO_IMG}" alt="Equitel" width="48" style="display:block;border:0;"></td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 28px 8px 28px;">
          <span style="display:inline-block;background:#f1f5f9;color:#475569;font-size:11px;font-weight:700;letter-spacing:0.06em;padding:6px 12px;border-radius:999px;">${e(pillText)}</span>
          <h1 style="margin:18px 0 12px 0;font-size:24px;font-weight:700;color:#0f172a;line-height:1.25;letter-spacing:-0.01em;">Nueva solicitud de herramientas tecnológicas</h1>
          <p style="margin:0 0 22px 0;font-size:14px;line-height:1.55;color:#334155;">
            Se requieren herramientas para el cargo de <strong>${e(args.cargo)}</strong>, quien hará su ingreso al área de
            <strong>${e(args.unidad)}</strong> en la ciudad de <strong>${e(args.ciudad)}</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 24px 0;">
            ${filasHtml}
          </table>
          <a href="${linkVacante}" style="display:inline-block;background:#be1e0d;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-size:14px;font-weight:600;">Ver vacante →</a>
        </td></tr>

        <tr><td style="padding:28px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
            Te avisó Steve · asistente de la Plataforma de Atracción de <strong>Organización Equitel</strong><br>
            <span style="color:#cbd5e1;">Correo automático · no respondas a este mensaje</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapar(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function enviarCorreoIT(args: {
  asunto: string;
  html: string;
  correoContacto: string;
  replyTo: string;
}): Promise<void> {
  const cc =
    args.correoContacto && !DESTINOS_IT.includes(args.correoContacto)
      ? [args.correoContacto]
      : undefined;

  await enviarConGmail({
    from: FROM,
    to: DESTINOS_IT,
    cc,
    replyTo: args.replyTo || undefined,
    subject: args.asunto,
    html: args.html,
  });
}

export const registrarSolicitudHerramientas = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    secrets: [
      GDRIVE_SERVICE_ACCOUNT_JSON,
      GMAIL_USER,
      GMAIL_APP_PASSWORD,
      SOLICITUD_HERRAMIENTAS_SHEET_ID,
    ],
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Inicia sesión.');
    }
    const rol = req.auth.token.rol;
    if (rol !== 'analista' && rol !== 'coordinador' && rol !== 'admin' && rol !== 'lider') {
      throw new HttpsError('permission-denied', 'Solo analista, coordinador, admin o líder.');
    }

    const parsed = inputSchema.safeParse(req.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos de entrada inválidos.');
    }
    const { vacante_id, proceso_id } = parsed.data;

    const procesoRef = db.collection('procesos').doc(proceso_id);
    const procesoSnap = await procesoRef.get();
    if (!procesoSnap.exists) {
      throw new HttpsError('not-found', 'Proceso no encontrado.');
    }
    const proceso = procesoSnap.data() as Record<string, unknown>;

    // Idempotencia: ya se envió antes → no duplicar fila ni correo.
    if (proceso.solicitud_herramientas_enviada_en) {
      return { yaEnviada: true };
    }

    const vacSnap = await db.collection('vacantes').doc(vacante_id).get();
    if (!vacSnap.exists) {
      throw new HttpsError('not-found', 'Vacante no encontrada.');
    }
    const vac = vacSnap.data() as Record<string, unknown>;

    const perfilamiento = (proceso.perfilamiento ?? {}) as Record<string, unknown>;
    const sol = (perfilamiento.solicitud_herramientas ?? {}) as SolicitudHerramientas;

    const empresa = String(vac.empresa_nombre ?? '');
    const unidad = String(vac.unidad_nombre ?? '');
    const cargo = String(vac.cargo_nombre ?? '');
    const ciudad = String(vac.sede_nombre ?? '');
    const consecutivo = String(vac.consecutivo ?? '');
    const tipoSolicitud = String(vac.tipo_solicitud ?? '');
    const reemplazaA = String(vac.reemplaza_a_nombre ?? '');
    const liderNombre = String(vac.lider_nombre ?? '');
    const correoSolicitante = String(req.auth.token.email ?? '');
    const personaContacto = (sol.persona_contacto || liderNombre || '').trim();
    const tipoReemplazoLabel = TIPO_REEMPLAZO_LABEL[tipoSolicitud] ?? tipoSolicitud;

    // 1) Escribir la fila en la hoja de IT.
    const sheetId = (process.env.SOLICITUD_HERRAMIENTAS_SHEET_ID ?? '')
      .replace(/^﻿/, '')
      .trim();
    if (!sheetId) {
      throw new HttpsError(
        'failed-precondition',
        'SOLICITUD_HERRAMIENTAS_SHEET_ID no configurada. Pide al admin que la sembre.',
      );
    }
    try {
      await agregarFilaSheet({
        spreadsheetId: sheetId,
        hoja: HOJA,
        valores: construirFila({
          correoSolicitante,
          consecutivo,
          empresa,
          unidad,
          cargo,
          ciudad,
          sol,
          liderNombre,
          tipoSolicitud,
          reemplazaA,
        }),
      });
    } catch (e) {
      logger.error('[registrarSolicitudHerramientas] error escribiendo hoja', {
        err: e instanceof Error ? e.message : String(e),
        vacante_id,
      });
      throw new HttpsError('internal', 'No pudimos escribir en la hoja de IT.');
    }

    // 2) Enviar el correo de notificación a IT.
    let correoEnviado = false;
    let correoError: string | null = null;
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        const analistaEmail = await emailAnalistaDeVacante(vacante_id);
        await enviarCorreoIT({
          asunto: `${consecutivo} Solicitud de herramientas tecnológicas · ${cargo} · ${ciudad}`,
          correoContacto: sol.correo_contacto || '',
          replyTo: analistaEmail,
          html: construirCorreoHtml({
            vacante_id,
            cargo,
            unidad,
            ciudad,
            empresa,
            consecutivo,
            requiere: !!sol.requiere,
            tipoReemplazo: tipoReemplazoLabel,
            reemplazaA,
            personaContacto,
            correoContacto: sol.correo_contacto || '',
            observaciones: sol.observaciones || '',
          }),
        });
        correoEnviado = true;
      } catch (e) {
        // La fila ya quedó en la hoja (trazabilidad), así que no abortamos:
        // logueamos y dejamos que IT vea la fila aunque el correo falle.
        correoError = e instanceof Error ? e.message : String(e);
        logger.error('[registrarSolicitudHerramientas] correo falló', { correoError });
      }
    } else {
      logger.warn('[registrarSolicitudHerramientas] GMAIL_* ausentes, correo omitido');
    }

    // 3) Marcar como enviada (idempotencia) + auditoría.
    await procesoRef.update({
      solicitud_herramientas_enviada_en: FieldValue.serverTimestamp(),
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: req.auth.uid,
    });

    await db.collection('eventos').add({
      tipo: 'solicitud_herramientas_enviada',
      vacante_id,
      proceso_id,
      consecutivo,
      requiere_herramientas: !!sol.requiere,
      correo_enviado: correoEnviado,
      correo_error: correoError,
      usuario_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { yaEnviada: false, correoEnviado, correoError };
  },
);
