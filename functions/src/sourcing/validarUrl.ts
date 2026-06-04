import { logger } from 'firebase-functions/v2';

interface ResultadoValidacion {
  url: string;
  estado: 'ok' | 'no_verificable' | 'invalida';
  http_status?: number;
  motivo?: string;
}

/**
 * Verifica si una URL probablemente apunta a un perfil real.
 * - estado='ok'           → respondió 2xx o 3xx.
 * - estado='no_verificable' → bloqueada por bot detection (ej. LinkedIn 999, 403, 429).
 *                             No podemos confirmar pero tampoco descartar.
 * - estado='invalida'     → 404 o conexión fallida → la URL no existe.
 */
export async function validarUrlPerfil(url: string): Promise<ResultadoValidacion> {
  if (!url || !url.startsWith('http')) {
    return { url, estado: 'invalida', motivo: 'URL vacía o sin protocolo' };
  }

  // Algunas plataformas bloquean HEAD pero no GET. Intentar HEAD primero, GET de fallback.
  // Cada fetch usa su PROPIA señal de timeout: antes compartían un solo
  // AbortSignal.timeout(6000), así que si el HEAD consumía los 6s, el GET
  // arrancaba con la señal ya disparada y abortaba al instante (todo se
  // contaba como 'no_verificable').
  const UA = 'Mozilla/5.0 (compatible; EquitelSourcerBot/1.0; +https://equitel.co)';
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': UA },
    });
    // LinkedIn devuelve 999 a HEAD bot — intentar GET ligero con señal fresca.
    if (res.status === 999 || res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': UA },
      });
    }

    if (res.status >= 200 && res.status < 400) {
      const finalUrl = (res.url || url).toLowerCase();
      const esLinkedIn = url.toLowerCase().includes('linkedin.com/in/');

      // LinkedIn es especial: protege sus URLs incluso para perfiles que existen.
      // No podemos verificar fiablemente sin login → marcamos no_verificable y dejamos
      // que el analista valide al hacer click. Esto evita descartar perfiles reales.
      if (esLinkedIn) {
        return {
          url,
          estado: 'no_verificable',
          http_status: res.status,
          motivo: 'LinkedIn no permite verificación pública confiable — el analista valida manualmente',
        };
      }

      // Para otros sitios sí podemos detectar soft-404 confiable.
      const patronesSoft404 = ['/404', '/not-found', '/notfound', '/error', '/page-not-found'];
      if (patronesSoft404.some((p) => finalUrl.includes(p))) {
        return {
          url,
          estado: 'invalida',
          http_status: res.status,
          motivo: `Soft-404 detectado (redirige a ${res.url})`,
        };
      }
      return { url, estado: 'ok', http_status: res.status };
    }
    if (res.status === 404 || res.status === 410) {
      return { url, estado: 'invalida', http_status: res.status, motivo: 'No encontrado' };
    }
    if (res.status === 999 || res.status === 403 || res.status === 429) {
      return {
        url,
        estado: 'no_verificable',
        http_status: res.status,
        motivo: 'Bloqueada por anti-bot (probable LinkedIn)',
      };
    }
    return {
      url,
      estado: 'no_verificable',
      http_status: res.status,
      motivo: `HTTP ${res.status} no concluyente`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('[sourcing] validar URL falló', { url, msg });
    return { url, estado: 'no_verificable', motivo: `Error de red: ${msg}` };
  }
}
