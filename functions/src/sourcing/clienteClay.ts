import { logger } from 'firebase-functions/v2';

interface PayloadClay {
  busqueda_id: string;
  vacante_id: string;
  callback_url: string;
  callback_secret: string;
  cargo_nombre: string;
  ciudad: string;
  criterios: string;
  empresas_competencia: string;
}

/**
 * Dispara la Clay Function con los criterios de búsqueda.
 * Async: Clay procesa en background y POSTea los resultados al callback_url.
 *
 * Lanza Error si Clay no está configurado o el POST falla.
 */
export async function llamarClayFunction(payload: PayloadClay): Promise<{ ok: true }> {
  const url = process.env.CLAY_FUNCTION_URL;
  const apiKey = process.env.CLAY_API_KEY;
  if (!url) throw new Error('CLAY_FUNCTION_URL no configurada en el entorno.');
  if (!apiKey) throw new Error('CLAY_API_KEY no configurada en el entorno.');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    logger.error('[clay] error llamando function', {
      status: res.status,
      body: txt.slice(0, 500),
    });
    throw new Error(`Clay devolvió HTTP ${res.status}`);
  }

  logger.info('[clay] búsqueda disparada', {
    busqueda_id: payload.busqueda_id,
    vacante_id: payload.vacante_id,
  });
  return { ok: true };
}
