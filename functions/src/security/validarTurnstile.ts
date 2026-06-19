import { logger } from 'firebase-functions/v2';

/**
 * validarTurnstile · valida server-side un token de Cloudflare Turnstile contra
 * el endpoint oficial siteverify. Es la verdad del CAPTCHA: el frontend solo
 * obtiene el token; aquí se confirma que es real antes de conceder acceso.
 *
 * Fail-closed: ante cualquier duda (sin secret en prod, error de red, respuesta
 * negativa) devuelve false → no se entrega nada.
 *
 * Local: si no hay TURNSTILE_SECRET y se corre en el emulador, usa la *test
 * secret* oficial de Turnstile (siempre aprueba), que se empareja con la *test
 * site key* del frontend para probar el flujo completo sin llaves reales.
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Llaves de prueba oficiales de Cloudflare (documentadas, siempre aprueban).
const TEST_SECRET_SIEMPRE_OK = '1x0000000000000000000000000000000AA';

export async function validarTurnstile(
  captchaToken: string,
  ip?: string,
): Promise<boolean> {
  const real = (process.env.TURNSTILE_SECRET ?? '').trim();
  const emulador = process.env.FUNCTIONS_EMULATOR === 'true';
  const secret = real || (emulador ? TEST_SECRET_SIEMPRE_OK : '');

  if (!secret) {
    logger.error('[turnstile] TURNSTILE_SECRET no configurado (fail-closed)');
    return false;
  }
  if (!captchaToken) return false;

  try {
    const body = new URLSearchParams();
    body.append('secret', secret);
    body.append('response', captchaToken);
    if (ip) body.append('remoteip', ip);

    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success !== true) {
      logger.warn('[turnstile] verificación fallida', { errores: data['error-codes'] ?? [] });
      return false;
    }
    return true;
  } catch (e) {
    logger.error('[turnstile] error llamando siteverify (fail-closed)', {
      e: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
