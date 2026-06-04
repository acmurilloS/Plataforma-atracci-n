import { randomBytes } from 'crypto';

/**
 * Genera un slug alfanumérico de 10 caracteres usado en `?ref=<slug>` de la
 * landing pública.
 *
 * Alfabeto sin ambigüedades visuales (sin `0`, `O`, `1`, `l`, `I`, `i`) para
 * que si alguien transcribe el link manualmente desde un texto impreso o lo
 * dicta por teléfono, no haya errores.
 *
 * Espacio: 56^10 ≈ 3 × 10^17 combinaciones. Para 240 técnicos × 100 vacantes/año
 * = 24,000 slugs/año. Colisión negligible. No hace falta unicidad por DB lookup.
 *
 * Se usa `crypto.randomBytes` (no `Math.random`) por dos razones:
 * 1. El slug es lo único que separa "yo soy el referidor" de "yo NO soy el
 *    referidor". Math.random es predecible.
 * 2. En v2 con bono, el slug es el comprobante de la atribución.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generarSlug(longitud = 10): string {
  const bytes = randomBytes(longitud);
  let out = '';
  for (let i = 0; i < longitud; i++) {
    out += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return out;
}
