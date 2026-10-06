import type { Response } from 'express';
import { VERSION_API } from './catalogo';

/**
 * Forma de TODA respuesta de la API pública, en un solo lugar.
 *
 *  - Bien: `{ data }`; listas: `{ data, pagination: { page, limit, total } }`.
 *  - Mal:  `{ error, message }`. `error` es un código estable que lee un programa;
 *    `message` es para la persona que depura y puede cambiar de redacción.
 *  - Cabeceras siempre: `Cache-Control: no-store` (el contenido depende de la
 *    llave) y `X-API-Version`.
 */

export type CodigoError =
  | 'no_autenticado'
  | 'llave_vencida'
  | 'integracion_inactiva'
  | 'permiso_faltante'
  | 'sin_ambitos'
  | 'ambito_no_autorizado'
  | 'ambito_desconocido'
  | 'no_encontrado'
  | 'ruta_no_encontrada'
  | 'metodo_no_permitido'
  | 'parametro_invalido'
  | 'demasiadas_peticiones'
  | 'error_interno';

const STATUS: Record<CodigoError, number> = {
  no_autenticado: 401,
  llave_vencida: 401,
  integracion_inactiva: 403,
  permiso_faltante: 403,
  sin_ambitos: 403,
  ambito_no_autorizado: 403,
  ambito_desconocido: 404,
  no_encontrado: 404,
  ruta_no_encontrada: 404,
  metodo_no_permitido: 405,
  parametro_invalido: 400,
  demasiadas_peticiones: 429,
  error_interno: 500,
};

/** Texto ÚNICO para llave inexistente / hash distinto / revocada / integración
 *  inexistente: si fueran distintos, la respuesta diría cuáles existen. */
export const MENSAJE_NO_AUTENTICADO = 'La llave no es válida.';

export function cabeceras(res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.set('X-API-Version', VERSION_API);
}

export function ok(res: Response, data: unknown): void {
  cabeceras(res);
  res.status(200).json({ data });
}

export function okLista(
  res: Response,
  data: unknown[],
  pagination: { page: number; limit: number; total: number },
): void {
  cabeceras(res);
  res.status(200).json({ data, pagination });
}

export function error(
  res: Response,
  codigo: CodigoError,
  message: string,
  extraHeaders?: Record<string, string>,
): number {
  cabeceras(res);
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) res.set(k, v);
  const status = STATUS[codigo];
  res.status(status).json({ error: codigo, message });
  return status;
}

export function statusDe(codigo: CodigoError): number {
  return STATUS[codigo];
}
