import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PREFIJO_LLAVE } from './catalogo';

/**
 * Generación y verificación de llaves de la API pública.
 *
 * Formato: `pa_live_<prefijo 10>_<secreto 43>`.
 *  - El PREFIJO (`pa_live_` + 10 caracteres) es público: tiene índice único,
 *    sirve para encontrar la fila sin descifrar nada y para que una persona
 *    reconozca cuál de sus llaves es.
 *  - El SECRETO completo nunca se guarda: solo su hash.
 *
 * SHA-256 y no bcrypt, A PROPÓSITO: el secreto son 32 bytes aleatorios (256 bits
 * de entropía), así que no hay diccionario del que defenderse, y bcrypt costaría
 * ~100 ms en CADA petición de la API.
 */

const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789'; // sin 0/o/1/l: se lee sin ambigüedad
const LARGO_PREFIJO = 10;

function aleatorioLegible(largo: number): string {
  const bytes = randomBytes(largo);
  let out = '';
  for (let i = 0; i < largo; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

export function hashLlave(secreto: string): string {
  return createHash('sha256').update(secreto, 'utf8').digest('hex');
}

export function generarLlave(): { secreto: string; prefijo: string; hash: string } {
  const prefijo = `${PREFIJO_LLAVE}${aleatorioLegible(LARGO_PREFIJO)}`;
  const secreto = `${prefijo}_${randomBytes(32).toString('base64url')}`;
  return { secreto, prefijo, hash: hashLlave(secreto) };
}

const FORMA = new RegExp(`^${PREFIJO_LLAVE}[${ALFABETO}]{${LARGO_PREFIJO}}_[A-Za-z0-9_-]{43}$`);

/** ¿Tiene pinta de llave? Si no, 401 sin consultar la base. */
export function tieneFormaDeLlave(s: string): boolean {
  return FORMA.test(s);
}

export function prefijoDe(secreto: string): string {
  return secreto.slice(0, PREFIJO_LLAVE.length + LARGO_PREFIJO);
}

/** Comparación en tiempo constante (hashes hex de igual largo). */
export function hashCoincide(hashGuardado: string, secreto: string): boolean {
  const a = Buffer.from(hashGuardado, 'utf8');
  const b = Buffer.from(hashLlave(secreto), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
