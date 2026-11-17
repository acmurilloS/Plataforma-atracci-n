import { createHash } from 'node:crypto';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';

/**
 * Ciclo de vida de un INGRESO en la API pública (DotaTrack 17-nov: A1, A4, A6).
 *
 *  - `en_proceso`: la persona está en contratación y Atracción ya pidió su
 *    dotación (`solicitud_dotacion_enviada_en`). Antes solo salía al quedar
 *    `contratado` (el día del ingreso o después) y la dotación no alcanzaba.
 *  - `contratado`: Gestión Humana aprobó la carpeta o se registró la vinculación.
 *  - `no_ingresa`: ya se había entregado por la API (en proceso o contratado) y
 *    salió del proceso sin entrar. NUNCA se dice por qué (puede ser médico).
 *
 * "Ya se había entregado" se recuerda en `api_ingresos/{postulacionId}` (solo
 * servidor): sin esa memoria, quien desiste simplemente desaparecería y DotaTrack
 * seguiría alistando su dotación.
 *
 * `actualizado_en` (A4) es el momento en que la API VIO cambiar el ingreso: se
 * guarda la huella (hash) de lo que se entregó y, si la próxima vez es distinta,
 * se sella la hora. Así un cambio de tallas, cargo, centro de costos o estado
 * vuelve a salir con `?actualizado_desde=`, y lo que no cambió no hace ruido.
 */

export type EstadoIngresoApi = 'en_proceso' | 'contratado' | 'no_ingresa';
export const ESTADOS_INGRESO_API: readonly EstadoIngresoApi[] = ['en_proceso', 'contratado', 'no_ingresa'];

export function esEstadoIngresoApi(x: unknown): x is EstadoIngresoApi {
  return typeof x === 'string' && (ESTADOS_INGRESO_API as readonly string[]).includes(x);
}

/**
 * Estado de la postulación en la API. `previo` = lo que ya se entregó (null si
 * nunca se entregó). Devuelve null si no se debe entregar.
 */
export function estadoIngresoApi(
  post: Record<string, unknown>,
  previo: EstadoIngresoApi | null,
): EstadoIngresoApi | null {
  const estado = String(post.estado ?? '');
  if (estado === 'contratado') return 'contratado';
  if (estado === 'en_contratacion' && post.solicitud_dotacion_enviada_en) return 'en_proceso';
  if (!previo) return null;
  // Ya se entregó: si sigue vivo (p. ej. volvió a exámenes o se reabrió) continúa
  // en proceso; si salió del proceso (desistió, descartado, se movió), no ingresa.
  if (!estado || esPostulacionTerminal(estado)) return 'no_ingresa';
  return 'en_proceso';
}

/** JSON con las llaves ordenadas: la misma información da la misma huella. */
function estable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(estable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, estable((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** Huella del ingreso tal como sale por la API (sin `actualizado_en`). */
export function huellaIngreso(item: Record<string, unknown>): string {
  const { actualizado_en: _ignorado, ...resto } = item;
  void _ignorado;
  return createHash('sha1').update(JSON.stringify(estable(resto))).digest('hex');
}
