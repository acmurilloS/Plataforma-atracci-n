import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import {
  emailAnalistaDeVacante,
  emailCoordinadorFallback,
} from '../notificaciones/emailAnalista';
import {
  envolverMarca,
  escapeHtml,
  FOOTER_EMPRESAS_DEFAULT,
} from '../notificaciones/plantillasMensajes';
import { textoComisiones } from '../utils/comisiones';

const FROM = 'Plataforma de Atracción Equitel <Steve-noresponder@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * Destinatario en Cultura y Desarrollo (Diego Ortiz).
 *
 * Petición Karen + Mari (2026-06-24): mientras se cierra el proyecto y todavía
 * cambian las definiciones de bandas/condiciones, cada nueva solicitud de
 * vacante dispara un correo a Diego para que confirme si las condiciones que el
 * líder registró están correctas antes de continuar. Si el correo cambia, se
 * edita esta constante (1 línea + redeploy).
 */
const DIEGO_CULTURA = 'dortiz@equitel.com.co';

// Espejo de TIPO_SOLICITUD_LABEL del front (functions no importa de src).
const TIPO_LABEL: Record<string, string> = {
  reemplazo_indefinido: 'Reemplazo indefinido',
  aumento_planta: 'Aumento de planta',
  necesidad_temporal: 'Necesidad temporal',
  reemplazo: 'Reemplazo indefinido',
  aumento: 'Aumento de planta',
};

function formatearCOP(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

export type ResultadoAvisoCultura = {
  estado: 'enviado' | 'omitido_ya_enviado' | 'sin_secrets' | 'no_existe' | 'error';
  error?: string;
};

/**
 * Envía a Cultura y Desarrollo (Diego) el correo de validación de condiciones de
 * una nueva solicitud de vacante. Reutiliza el diseño branded (envolverMarca) y
 * el transporte Gmail, igual que el resto de correos de la app.
 *
 *  - Reply-to al LÍDER que registró las condiciones (cuando Diego responda
 *    "confirmo / ajusten esto", le llega a quien las puso).
 *  - CC a coordinación (coordinadores activos) para que quede enterada.
 *  - Idempotente: no reenvía si la vacante ya tiene `correo_cultura_enviado_en`
 *    (salvo `forzar`).
 *  - Si el correo falla, deja rastro en la vacante y avisa a coordinación
 *    (no es un fallo silencioso).
 */
export async function avisarCondicionesCultura(
  vacanteId: string,
  opts: { forzar?: boolean } = {},
): Promise<ResultadoAvisoCultura> {
  const ref = db.collection('vacantes').doc(vacanteId);
  const snap = await ref.get();
  if (!snap.exists) return { estado: 'no_existe', error: 'La vacante no existe.' };
  const v = (snap.data() ?? {}) as Record<string, unknown>;

  // Idempotencia: el trigger no reenvía si ya se mandó.
  if (!opts.forzar && v.correo_cultura_enviado_en) {
    logger.info('avisarCondicionesCultura · ya enviado, omito', { vacante_id: vacanteId });
    return { estado: 'omitido_ya_enviado' };
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logger.info('avisarCondicionesCultura · GMAIL_* ausentes, correo omitido', {
      vacante_id: vacanteId,
    });
    return { estado: 'sin_secrets' };
  }

  const cargo = String(v.cargo_nombre ?? '').trim();
  const empresa = String(v.empresa_nombre ?? '').trim();
  const sede = String(v.sede_nombre ?? '').trim();
  const consecutivo = String(v.consecutivo ?? '').trim();
  const liderNombre = String(v.lider_nombre ?? '').trim();
  const salario = Number(v.salario_base ?? 0);
  // Tipo · presupuesto/indicadores · medición · bolsa · concepto (reu 16-sep).
  const comisiones = textoComisiones(v, '\n');
  const garantizado = String(v.garantizado_texto ?? '').trim();
  // Rodamiento con VALOR (reu Karen 16-sep): Diego solo veía "Sí/No" y necesita
  // el monto que puso el líder. Manda el booleano; el valor solo si dice que sí.
  const rodamientoValor = String(v.rodamiento_valor ?? '').trim();
  const rodamiento =
    v.rodamiento === true
      ? rodamientoValor && rodamientoValor.toLowerCase() !== 'no aplica'
        ? rodamientoValor
        : 'Sí (valor no registrado)'
      : 'No aplica';
  // Tipo de solicitud + a quién reemplaza / duración (Diego cruza contra planta).
  const tipoRaw = String(v.tipo_solicitud ?? '').trim();
  const reemplaza = String(v.reemplaza_a_nombre ?? '').trim();
  const meses = Number(v.temporalidad_meses);
  const tipoSolicitud =
    (TIPO_LABEL[tipoRaw] ?? tipoRaw) +
    (tipoRaw === 'reemplazo_indefinido' && reemplaza ? ` · reemplaza a ${reemplaza}` : '') +
    (tipoRaw === 'necesidad_temporal' && Number.isFinite(meses) && meses > 0
      ? ` · ${meses} mes${meses === 1 ? '' : 'es'}`
      : '');

  // CC a coordinación. (El reply-to ya no va al líder: va al analista del
  // proceso —ver más abajo—, nunca al líder ni a Steve.)
  const coordinadores: { uid: string; email: string }[] = [];
  try {
    const cs = await db
      .collection('usuarios')
      .where('rol', '==', 'coordinador')
      .where('activo', '==', true)
      .get();
    cs.forEach((c) =>
      coordinadores.push({ uid: c.id, email: String(c.data()?.email ?? '').trim() }),
    );
  } catch (e) {
    logger.warn('avisarCondicionesCultura · no se pudieron leer correos de copia', {
      vacante_id: vacanteId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
  const ccCopia = coordinadores.map((c) => c.email).filter((e) => e);

  // Tabla de condiciones (escapeHtml a todo lo que viene del líder).
  const condiciones: [string, string][] = [
    ['Tipo de solicitud', tipoSolicitud || '—'],
    ['Salario base', formatearCOP(salario)],
    ['Comisiones', comisiones],
    ['Rodamiento', rodamiento],
    ['Garantizado', garantizado || 'No aplica'],
  ];
  // Los saltos de línea se respetan (comisiones y garantizado son textareas: una
  // tabla por rangos pegada en una sola tira era ilegible para Diego).
  const filasHtml = condiciones
    .map(
      ([k, val]) =>
        `<tr><td style="padding:4px 14px 4px 0;font-weight:600;color:#475569;white-space:nowrap;vertical-align:top;">${k}:</td><td style="padding:4px 0;">${escapeHtml(
          val,
        ).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');

  const empresaSede = [empresa, sede].filter(Boolean).join(' · ');
  const cuerpo = `
    <p style="margin:0 0 14px;">Hola Diego,</p>
    <p style="margin:0 0 14px;">
      Ha llegado una solicitud de vacante a <strong>Cultura y Desarrollo</strong> para el cargo de
      <strong>${escapeHtml(cargo || 'sin especificar')}</strong>${
        empresaSede ? ` (${escapeHtml(empresaSede)})` : ''
      }${liderNombre ? `, radicada por <strong>${escapeHtml(liderNombre)}</strong>` : ''}${
        consecutivo ? `. Consecutivo <strong>${escapeHtml(consecutivo)}</strong>` : ''
      }.
    </p>
    <p style="margin:0 0 8px;">El líder registró las siguientes condiciones:</p>
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 18px;">${filasHtml}</table>
    <p style="margin:0 0 18px;">
      Revisa y <strong>aprueba o rechaza</strong> las condiciones directamente en la plataforma.
      Ahí puedes dejar tus observaciones y todo queda registrado para el equipo de Atracción.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr><td style="border-radius:8px;background:#be1e0d;">
        <a href="${APP_URL}/aprobaciones-aval" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          Revisar y aprobar en la plataforma →
        </a>
      </td></tr>
    </table>
    <p style="margin:0 0 14px;font-size:13px;color:#64748b;">
      Ingresa con tu correo Equitel (@equitel.com.co). Si prefieres, también puedes responder este
      correo y el equipo lo registra por ti.
    </p>
    <p style="margin:0;">Gracias.</p>
  `.trim();

  const html = envolverMarca(cuerpo, {
    footerEmpresas: FOOTER_EMPRESAS_DEFAULT,
    preheader: `Nueva solicitud de vacante — ${cargo}${empresa ? ` en ${empresa}` : ''}`,
  });

  const subject = `Nueva solicitud de vacante — ${cargo || 'cargo'}${
    consecutivo ? ` (${consecutivo})` : ''
  }`;

  // Reply-to al ANALISTA del proceso; nunca al líder ni a Steve. Este correo
  // sale al CREAR la vacante, cuando puede no haber analista aún: en ese caso,
  // cae a coordinación.
  const replyToAnalista =
    (await emailAnalistaDeVacante(vacanteId)) || (await emailCoordinadorFallback());

  try {
    await enviarConGmail({
      from: FROM,
      to: [DIEGO_CULTURA],
      cc: ccCopia.length > 0 ? ccCopia : undefined,
      replyTo: replyToAnalista || undefined,
      subject,
      html,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('avisarCondicionesCultura · correo falló', { vacante_id: vacanteId, msg });
    await ref.update({
      correo_cultura_error: msg.slice(0, 500),
      correo_cultura_error_en: FieldValue.serverTimestamp(),
    });
    // Aviso no silencioso a coordinación.
    for (const coord of coordinadores) {
      if (coord.uid) {
        await crearNotificacion({
          destinatario_uid: coord.uid,
          tipo: 'generica',
          titulo: 'No se pudo avisar a Cultura y Desarrollo',
          mensaje: `El correo de validación de condiciones para ${cargo || 'la nueva vacante'}${
            consecutivo ? ` (${consecutivo})` : ''
          } no se pudo enviar a Diego (Cultura y Desarrollo). Revísalo e inténtalo de nuevo.`,
          link: `/vacantes/${vacanteId}`,
          conCorreo: true,
        });
      }
    }
    return { estado: 'error', error: msg };
  }

  await ref.update({
    correo_cultura_enviado_en: FieldValue.serverTimestamp(),
    correo_cultura_destinatario: DIEGO_CULTURA,
    correo_cultura_error: null,
  });

  try {
    await db.collection('eventos').add({
      tipo: 'vacante.aviso_cultura_enviado',
      entidad_tipo: 'vacante',
      entidad_id: vacanteId,
      vacante_id: vacanteId,
      destinatario: DIEGO_CULTURA,
      cc: ccCopia,
      autor_uid: 'system',
      autor_rol: 'system',
      payload: { consecutivo, cargo },
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
    });
  } catch (e) {
    logger.warn('avisarCondicionesCultura · no se pudo registrar el evento', {
      vacante_id: vacanteId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  logger.info('avisarCondicionesCultura · enviado', { vacante_id: vacanteId, cc: ccCopia.length });
  return { estado: 'enviado' };
}

/**
 * Crea una notificación interna (Admin SDK). conCorreo=false → solo campana
 * (pre-set email_enviado_en); conCorreo=true → campana + correo (lo dispara
 * onNotificacionCreate).
 */
async function crearNotificacion(opts: {
  destinatario_uid: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  link: string;
  conCorreo: boolean;
}): Promise<void> {
  const doc: Record<string, unknown> = {
    destinatario_uid: opts.destinatario_uid,
    tipo: opts.tipo,
    titulo: opts.titulo,
    mensaje: opts.mensaje,
    link: opts.link,
    leida: false,
    leida_en: null,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: 'system',
  };
  if (!opts.conCorreo) {
    doc.email_enviado_en = FieldValue.serverTimestamp();
  }
  try {
    await db.collection('notificaciones').add(doc);
  } catch (e) {
    logger.warn('avisarCondicionesCultura · no se pudo crear notificación', {
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}
