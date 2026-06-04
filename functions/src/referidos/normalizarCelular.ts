/**
 * Normaliza un celular colombiano al formato E.164 (+57XXXXXXXXXX).
 *
 * El Sheet de RRHH viene con variaciones reales:
 *   "312 7100075"       → "+573127100075"
 *   "3127100075"        → "+573127100075"
 *   "+57 312 7100075"   → "+573127100075"
 *   "57 312 7100075"    → "+573127100075"
 *   "312-710-0075"      → "+573127100075"
 *   "ext. 1234"         → null  (extensión, no celular)
 *   "no tiene"          → null
 *   ""                  → null
 *
 * Reglas:
 * - Solo dígitos importan; cualquier otro carácter se descarta primero.
 * - El resultado debe ser exactamente 10 dígitos (móvil colombiano sin código)
 *   o 12 dígitos comenzando en `57` (con código de país).
 * - Celulares colombianos siempre empiezan en `3`. Si los 10 dígitos no
 *   arrancan en 3, devolvemos null (probablemente es fijo o error de
 *   captura).
 *
 * Devuelve null si no se puede normalizar — el llamador excluye el técnico
 * del envío y lo reporta en `excluidos.sin_celular`.
 */
export function normalizarCelularE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digitos = String(raw).replace(/\D/g, '');
  if (!digitos) return null;

  let diez: string;
  if (digitos.length === 10) {
    diez = digitos;
  } else if (digitos.length === 12 && digitos.startsWith('57')) {
    diez = digitos.slice(2);
  } else if (digitos.length === 11 && digitos.startsWith('57')) {
    // "573127100075" sin el primer 5? muy raro pero ya pasó — ignoramos.
    return null;
  } else {
    return null;
  }

  if (!diez.startsWith('3')) return null;
  return `+57${diez}`;
}

/**
 * Escoge el celular del técnico según la regla de negocio:
 * - Si tiene corporativo válido, ese.
 * - Si no, el personal.
 * - Si ninguno es válido, null (técnico excluido).
 *
 * La base de RRHH tiene 89 con corporativo + 149 con personal (mutuamente
 * excluyentes) + 2 sin nada. El último caso devuelve null.
 */
export function escogerCelularTecnico(
  celCorporativo: string | null | undefined,
  celPersonal: string | null | undefined,
): { e164: string; origen: 'corporativo' | 'personal' } | null {
  const corp = normalizarCelularE164(celCorporativo);
  if (corp) return { e164: corp, origen: 'corporativo' };
  const pers = normalizarCelularE164(celPersonal);
  if (pers) return { e164: pers, origen: 'personal' };
  return null;
}
