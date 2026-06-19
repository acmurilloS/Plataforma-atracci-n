import { db } from '../utils/admin';

/**
 * plantillasMensajes · plantillas de correo al candidato/operativas, EDITABLES sin
 * deploy desde `configuracion_global/plantillas_mensajes`. Aquí viven los textos
 * por defecto (respaldo) + el envoltorio visual de marca "Buen día" de Equitel.
 *
 * Interpolación con {{variable}}. Los valores se escapan en el punto de armado
 * cuando provienen del usuario (nombre, etc.).
 */

const MARCA_ROJO = '#be1e0d';
export const FOOTER_EMPRESAS_DEFAULT = 'Equitel · Cumandes · Ingenergía · LAP · Prolub';

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function interpolar(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}

/**
 * Envuelve un cuerpo HTML en la pieza de marca de Equitel (header rojo + footer
 * con las empresas del holding). Recreado en HTML/CSS para no depender de una
 * imagen pesada y que se vea bien en cualquier cliente de correo.
 */
export function envolverMarca(
  cuerpoHtml: string,
  opts: { footerEmpresas?: string; preheader?: string } = {},
): string {
  const footer = opts.footerEmpresas || FOOTER_EMPRESAS_DEFAULT;
  const pre = opts.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>`
    : '';
  return `
<div style="background:#f1f5f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  ${pre}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background:${MARCA_ROJO};padding:18px 28px;">
        <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.18em;">
          ORGANIZACIÓN EQUITEL
        </span>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;color:#1f2937;font-size:14px;line-height:1.6;">
        ${cuerpoHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <p style="margin:0;color:#64748b;font-size:11px;letter-spacing:0.04em;text-align:center;">
          ${escapeHtml(footer)}
        </p>
        <p style="margin:6px 0 0;color:#94a3b8;font-size:10.5px;text-align:center;">
          Plataforma de Atracción de Talento
        </p>
      </td>
    </tr>
  </table>
</div>`.trim();
}

export interface Plantilla {
  asunto: string;
  cuerpo: string; // HTML con {{vars}}
}

/**
 * Plantillas por defecto (respaldo si no hay doc en configuracion_global).
 * Texto literal entregado por GH. {{vars}} se rellenan al enviar.
 */
export const PLANTILLAS_DEFAULT: Record<string, Plantilla> = {
  // Plantilla 1 — Descarte estándar (entrevistas / pruebas). El `cuerpo` es el
  // mensaje (editable por el staff); se envuelve en la pieza de marca al enviar.
  descarte_estandar: {
    asunto: 'Gracias por tu participación{{cargoSufijo}}',
    cuerpo: `<p>¡Hola{{nombreSaludo}}!</p>
<p>Valoro mucho tu tiempo y disposición. Aunque en esta ocasión no fue posible avanzar en esta etapa, espero que en el futuro tengamos la oportunidad de hacerlo.</p>
<p>Te deseo mucho éxito en tu búsqueda de empleo y, si surge una vacante que se ajuste a tu perfil, sin duda te tendremos en cuenta.</p>`,
  },

  // Plantilla 2 — Condiciones laborales (al candidato apto).
  condiciones: {
    asunto: 'Condiciones de tu ingreso{{cargoSufijo}}',
    cuerpo: `<p>Hola {{nombre}} 👋</p>
<p>De acuerdo con el proceso realizado, queremos recordarte las condiciones y características del rol al cual estás próximo a ingresar:</p>
<p style="line-height:1.9;">
📌 <strong>Cargo:</strong> {{cargo}}<br>
🏢 <strong>Empresa:</strong> {{empresa}}<br>
⚙️ <strong>Unidad:</strong> {{unidad}}<br>
📄 <strong>Tipo de contrato:</strong> {{tipo_contrato}}<br>
💰 <strong>Salario:</strong> prestaciones de ley<br>
&nbsp;&nbsp;&nbsp;Comisiones: en caso de que aplique<br>
&nbsp;&nbsp;&nbsp;Rodamiento: solo si aplica<br>
🕒 <strong>Horario:</strong> {{horario}}
</p>
<p>Adjuntamos el perfil de cargo para que estés enterado.</p>
<p>Agradecemos nos confirmes si recibiste este correo y fuiste informado también de las condiciones.</p>
<p>Cordialmente,</p>`,
  },

  // Plantilla 3 — Conexión y talentos (a Karen y José, al contratar).
  conexion_talentos: {
    asunto: 'Conexión y talentos · {{nombre}} ({{consecutivo}})',
    cuerpo: `<p>Hola Karen y José,</p>
<p>Amablemente solicitamos su ayuda con el código de la prueba de Gallup y el acceso a la U corporativa para el nuevo integrante:</p>
<p style="line-height:1.9;">
<strong>Proceso:</strong> {{consecutivo}}<br>
<strong>Nombre:</strong> {{nombre}}<br>
<strong>Cédula:</strong> {{cedula}}<br>
<strong>Correo:</strong> {{correo}}<br>
<strong>Cargo:</strong> {{cargo}}<br>
<strong>Unidad:</strong> {{unidad}}<br>
<strong>Empresa:</strong> {{empresa}}<br>
<strong>Número telefónico:</strong> {{telefono}}<br>
<strong>Sede:</strong> {{sede}}<br>
<strong>Solicitud realizada por el analista:</strong> {{analista}}
</p>
<p>Gracias, quedo atenta.</p>`,
  },
};

export interface PlantillasConfig {
  plantillas: Record<string, Plantilla>;
  footerEmpresas: string;
  version: string;
}

/**
 * Lee las plantillas de `configuracion_global/plantillas_mensajes` y las fusiona
 * sobre los valores por defecto (cualquier clave faltante usa el respaldo).
 */
export async function leerPlantillas(): Promise<PlantillasConfig> {
  let data: Record<string, unknown> = {};
  try {
    const snap = await db.collection('configuracion_global').doc('plantillas_mensajes').get();
    if (snap.exists) data = snap.data() ?? {};
  } catch {
    /* usa respaldo */
  }
  const cfgPlantillas = (data.plantillas ?? {}) as Record<string, Partial<Plantilla>>;
  const plantillas: Record<string, Plantilla> = {};
  for (const [clave, def] of Object.entries(PLANTILLAS_DEFAULT)) {
    plantillas[clave] = {
      asunto: cfgPlantillas[clave]?.asunto || def.asunto,
      cuerpo: cfgPlantillas[clave]?.cuerpo || def.cuerpo,
    };
  }
  return {
    plantillas,
    footerEmpresas: String(data.footer_empresas ?? FOOTER_EMPRESAS_DEFAULT),
    version: String(data.version ?? 'default'),
  };
}
