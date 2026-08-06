import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

/**
 * avisarNuevaVacante · aviso a Andrea (acmurillo@) cada vez que se crea una
 * vacante nueva, con el nombre de la vacante y el perfil/necesidad (pedido
 * 04-ago). EXCEPTO cargos técnicos ("si es técnico no") → esos se omiten.
 *
 * "Técnico" = el cargo (cargos_catalogo) tiene `categoria: 'tecnico'`. El perfil
 * detallado (perfilamiento, paso 3) todavía no existe al crear, así que el
 * "perfil que buscan" aquí = cargo + justificación de la solicitud.
 *
 * Best-effort: sin secrets de Gmail se omite en silencio; un fallo de correo no
 * debe tumbar el trigger onVacanteCreate.
 */

const FROM = 'Plataforma de Atracción Equitel <Steve-noresponder@equitel.com.co>';
const DESTINO = 'acmurillo@equitel.com.co';
const APP_URL = 'https://ptm-atraccion.web.app';

const TIPO_LABEL: Record<string, string> = {
  reemplazo_indefinido: 'Reemplazo indefinido',
  aumento_planta: 'Aumento de planta',
  necesidad_temporal: 'Necesidad temporal',
  reemplazo: 'Reemplazo indefinido',
  aumento: 'Aumento de planta',
};

export type ResultadoAvisoNuevaVacante = {
  estado: 'enviado' | 'omitido_tecnico' | 'sin_secrets' | 'no_existe' | 'error';
};

export async function avisarNuevaVacante(vacanteId: string): Promise<ResultadoAvisoNuevaVacante> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { estado: 'sin_secrets' };
  }

  const snap = await db.collection('vacantes').doc(vacanteId).get();
  if (!snap.exists) return { estado: 'no_existe' };
  const v = snap.data() as Record<string, unknown>;

  // Excluir cargos técnicos.
  let categoria = '';
  const cargoId = String(v.cargo_id ?? '');
  if (cargoId) {
    const c = await db.collection('cargos_catalogo').doc(cargoId).get();
    if (c.exists) categoria = String(c.data()?.categoria ?? '');
  }
  if (categoria === 'tecnico') {
    return { estado: 'omitido_tecnico' };
  }

  const cargo = String(v.cargo_nombre ?? 'Sin cargo');
  const consecutivo = String(v.consecutivo ?? '');
  const empresa = String(v.empresa_nombre ?? '');
  const sede = String(v.sede_nombre ?? '');
  const unidad = String(v.unidad_nombre ?? '');
  const criticidad = String(v.criticidad ?? '');
  const reemplaza = String(v.reemplaza_a_nombre ?? '').trim();
  const tipoRaw = String(v.tipo_solicitud ?? '');
  const tipo = (TIPO_LABEL[tipoRaw] ?? tipoRaw) + (reemplaza ? ` · reemplaza a ${reemplaza}` : '');
  const lider = String(v.lider_nombre ?? '');
  const liderCargo = String(v.lider_cargo ?? '').trim();
  const justificacion = String(v.justificacion ?? '').trim();

  const filas: [string, string][] = [
    ['Empresa', empresa],
    ['Sede', sede],
    ['Unidad', unidad],
    ['Criticidad', criticidad],
    ['Tipo de solicitud', tipo],
    ['Líder solicitante', lider + (liderCargo ? ` (${liderCargo})` : '')],
  ];
  const filasHtml = filas
    .filter(([, val]) => val)
    .map(
      ([k, val]) =>
        `<tr><td style="padding:5px 14px 5px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(
          k,
        )}</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600;">${esc(val)}</td></tr>`,
    )
    .join('');

  const link = `${APP_URL}/vacantes/${vacanteId}`;
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nueva vacante</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="background:#be1e0d;padding:14px 24px;">
          <p style="margin:0;color:#fff;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Plataforma de Atracción · Equitel</p>
        </td></tr>
        <tr><td style="padding:26px 26px 8px 26px;">
          <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Nueva vacante</p>
          <h1 style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.25;">${esc(cargo)}</h1>
          <p style="margin:0 0 18px 0;font-size:13px;color:#64748b;">${esc(consecutivo)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 18px 0;">
            ${filasHtml}
          </table>
          <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Perfil / necesidad</p>
          <p style="margin:0 0 22px 0;font-size:14px;line-height:1.55;color:#334155;white-space:pre-wrap;">${
            esc(justificacion) || '—'
          }</p>
          <a href="${esc(link)}" style="display:inline-block;background:#be1e0d;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;">Ver vacante →</a>
        </td></tr>
        <tr><td style="padding:22px 26px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">Aviso automático de nuevas vacantes (se omiten los cargos técnicos). Plataforma de Atracción · Organización Equitel.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    await enviarConGmail({
      from: FROM,
      to: [DESTINO],
      subject: `Nueva vacante · ${consecutivo} · ${cargo}`,
      html,
    });
    return { estado: 'enviado' };
  } catch {
    return { estado: 'error' };
  }
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
