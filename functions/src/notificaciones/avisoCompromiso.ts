import { createHash } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { escapeHtml, interpolar } from './plantillasMensajes';

/**
 * Aviso de compromiso al candidato (reu Karen 09-sep, punto 6): recordarle que
 * honre el tiempo del proceso y asista a las entrevistas agendadas. Karen pensó
 * en un botón; se decidió AUTOMATIZARLO dentro del correo de citación que ya
 * manda onEntrevistaCreate (y, opcional, en la tarjeta de la cita del portal).
 *
 * El texto lo define Karen (con el aval de Mari) en
 * `configuracion_global/aviso_compromiso`, editable desde Admin → Catálogos →
 * "Mensajes y reglas", sin deploy. FAIL-CLOSED: si el doc no existe, está
 * apagado, el texto está vacío o supera el límite, o la lectura falla, NO se
 * agrega nada y la citación sale exactamente igual que antes.
 *
 * Caché de 60 s (resolverPortalToken lo pide en cada carga del portal); un
 * fallo de lectura no se cachea.
 */

const MAX_TEXTO = 2000;
const MAX_TITULO = 120;
const TTL_MS = 60_000;

export interface AvisoCompromiso {
  activo: boolean;
  titulo: string;
  texto: string;
  enAnalista: boolean;
  enLider: boolean;
  enPortal: boolean;
  /** Hash corto de título+texto: trazabilidad de qué versión se envió. */
  version: string;
}

export const AVISO_APAGADO: AvisoCompromiso = {
  activo: false,
  titulo: '',
  texto: '',
  enAnalista: false,
  enLider: false,
  enPortal: false,
  version: '',
};

let cache: { v: AvisoCompromiso; t: number } | null = null;

export async function leerAvisoCompromiso(): Promise<AvisoCompromiso> {
  if (cache && Date.now() - cache.t < TTL_MS) return cache.v;
  try {
    const snap = await db.collection('configuracion_global').doc('aviso_compromiso').get();
    const c = (snap.data() ?? {}) as Record<string, unknown>;
    const texto = typeof c.texto === 'string' ? c.texto.replace(/\r\n?/g, '\n').trim() : '';
    const titulo = typeof c.titulo === 'string' ? c.titulo.trim().slice(0, MAX_TITULO) : '';
    let v: AvisoCompromiso;
    if (texto.length > MAX_TEXTO) {
      // Nunca se trunca un texto casi legal a mitad de frase: se apaga y se avisa.
      logger.warn('[aviso compromiso] el texto supera el límite; se trata como apagado', {
        largo: texto.length,
      });
      v = AVISO_APAGADO;
    } else {
      v = {
        activo: c.activo === true && texto.length > 0,
        titulo,
        texto,
        enAnalista: c.en_entrevista_analista !== false,
        enLider: c.en_entrevista_lider !== false,
        enPortal: c.en_portal !== false,
        version: createHash('sha1').update(`${titulo}\n${texto}`).digest('hex').slice(0, 10),
      };
    }
    cache = { v, t: Date.now() };
    return v;
  } catch (e) {
    logger.warn('[aviso compromiso] no se pudo leer la configuración', { e: String(e) });
    return AVISO_APAGADO;
  }
}

/** ¿El aviso va en una entrevista de este tipo ('analista' | 'lider')? */
export function avisoAplicaTipo(cfg: AvisoCompromiso, tipoEntrevista: string): boolean {
  return cfg.activo && (tipoEntrevista === 'lider' ? cfg.enLider : cfg.enAnalista);
}

export interface VarsAviso {
  /** Primer nombre del candidato. */
  nombre: string;
  cargo: string;
}

/** Texto plano interpolado (portal y evidencia en `eventos`). Solo {{nombre}} y {{cargo}}. */
export function textoAviso(cfg: AvisoCompromiso, vars: VarsAviso): string {
  return interpolar(cfg.texto, { nombre: vars.nombre, cargo: vars.cargo });
}

/**
 * Bloque HTML para el correo. PRIMERO se escapa el texto de la config y LUEGO
 * se interpola con valores también escapados: el HTML que traiga la config se ve
 * literal, nunca se inyecta. Saltos → <br> (Outlook ignora pre-line).
 */
export function bloqueAvisoHtml(cfg: AvisoCompromiso, vars: VarsAviso): string {
  const v = { nombre: escapeHtml(vars.nombre), cargo: escapeHtml(vars.cargo) };
  const parrafos = cfg.texto
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 8px;">${interpolar(escapeHtml(p), v).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
  const titulo = cfg.titulo
    ? `<p style="margin:0 0 6px;font-weight:700;">${escapeHtml(cfg.titulo)}</p>`
    : '';
  return `<div style="margin:18px 0;padding:12px 14px;border-left:3px solid #be1e0d;background:#fdf3f2;border-radius:4px;font-size:13px;line-height:1.55;color:#333;">${titulo}${parrafos}</div>`;
}
