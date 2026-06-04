import { GoogleGenAI } from '@google/genai';
import { logger } from 'firebase-functions/v2';
import { respuestaSourcingSchema, type RespuestaSourcing } from './respuestaSchema';

// gemini-2.5-flash es la primera opción. Si está saturado (503 UNAVAILABLE),
// hacemos fallback a gemini-2.0-flash (también gratis y suele tener menos
// carga). Si Equitel habilita billing en la API, subir a gemini-2.5-pro
// mejora el deep-research.
const MODELO_DEFECTO = 'gemini-2.5-flash';
const MODELO_FALLBACK = 'gemini-2.0-flash';

/**
 * Llama a Gemini con Google Search grounding habilitado y devuelve la respuesta
 * parseada y validada contra el esquema zod.
 *
 * Lanza Error si la API key no está configurada o si la respuesta no valida.
 */
export async function buscarConGemini(prompt: string): Promise<RespuestaSourcing> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada en el entorno.');
  }

  // httpOptions.timeout acota CADA llamada HTTP a Gemini. Sin esto, una sola
  // llamada lenta con grounding podía colgarse indefinidamente y la
  // infraestructura mataba la function a los 300s con un error opaco (no un
  // deadline-exceeded limpio). 90s por intento da margen a una búsqueda con
  // 8 queries grounded sin permitir cuelgues.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } });

  // Presupuesto total de wall-clock. El callable tiene timeoutSeconds=300; nos
  // detenemos a los 240s para dejar margen a la validación de URLs + escrituras
  // y devolver un error limpio en vez de que la infra mate la function.
  const DEADLINE_MS = Date.now() + 240_000;

  // quota   → límite diario/RPM: NO se recupera con backoff, hay que ir al
  //           fallback o abortar ya.
  // transitorio → 503 saturación, timeouts, abortos: reintentar con backoff.
  // fatal   → error de config/contrato: abortar sin reintentar.
  function clasificar(msg: string): 'quota' | 'transitorio' | 'fatal' {
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'quota';
    if (/503|UNAVAILABLE|high demand|timeout|deadline|aborted|ETIMEDOUT|socket hang up|fetch failed/i.test(msg))
      return 'transitorio';
    return 'fatal';
  }

  async function generarConRetry(
    modelo: string,
    intentos = 3,
    backoffInicialMs = 4000,
  ): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
    let ultimoError: unknown;
    for (let i = 0; i < intentos; i++) {
      if (Date.now() > DEADLINE_MS) {
        throw new Error('deadline-exceeded: presupuesto de tiempo agotado antes de completar la búsqueda.');
      }
      try {
        return await ai.models.generateContent({
          model: modelo,
          contents: prompt,
          // temperature baja: tarea factual de extracción, no creativa.
          // maxOutputTokens holgado: 15 candidatos + razonamiento no deben
          // truncar el JSON. (No se fija responseMimeType JSON porque es
          // incompatible con la tool googleSearch.)
          config: { tools: [{ googleSearch: {} }], temperature: 0.2, maxOutputTokens: 16384 },
        });
      } catch (e) {
        ultimoError = e;
        const msg = e instanceof Error ? e.message : String(e);
        const tipo = clasificar(msg);
        // Quota diaria: el backoff de 40s no la recupera. Abortamos este modelo
        // ya para que el caller intente el fallback.
        if (tipo === 'quota') throw e;
        if (tipo === 'fatal' || i === intentos - 1) throw e;
        const esperaMs = backoffInicialMs * Math.pow(2, i); // 4s, 8s
        if (Date.now() + esperaMs > DEADLINE_MS) throw e;
        logger.warn('[gemini] error transitorio, reintentando', {
          modelo,
          intento: i + 1,
          de: intentos,
          espera_ms: esperaMs,
          msg: msg.slice(0, 200),
        });
        await new Promise((r) => setTimeout(r, esperaMs));
      }
    }
    throw ultimoError;
  }

  let respuesta: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    respuesta = await generarConRetry(MODELO_DEFECTO, 3, 4000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Fallback al modelo de respaldo ante saturación 503 O quota agotada del
    // primario (antes solo cubría 503 → si 2.5 agotaba quota, nunca probaba 2.0).
    const recuperable = /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED|quota/i.test(msg);
    if (!recuperable || Date.now() > DEADLINE_MS) throw e;
    logger.warn('[gemini] modelo principal no disponible, intentando fallback', {
      principal: MODELO_DEFECTO,
      fallback: MODELO_FALLBACK,
    });
    respuesta = await generarConRetry(MODELO_FALLBACK, 2, 4000);
  }

  const texto = respuesta.text;
  const grounding = respuesta.candidates?.[0]?.groundingMetadata;
  const cantidadBusquedas = grounding?.webSearchQueries?.length ?? 0;
  const groundingChunks = grounding?.groundingChunks ?? [];
  const cantidadFuentes = groundingChunks.length;

  // URLs reales que Gemini consultó (las únicas que NO son inventadas)
  const urlsGrounded = new Set<string>(
    groundingChunks
      .map((c) => (c.web?.uri ?? '').toLowerCase().trim())
      .filter((u) => u.length > 0),
  );

  logger.info('[gemini] respuesta cruda', {
    modelo: MODELO_DEFECTO,
    texto_longitud: texto?.length ?? 0,
    busquedas_realizadas: cantidadBusquedas,
    queries: grounding?.webSearchQueries ?? [],
    fuentes_encontradas: cantidadFuentes,
    primeros_500_chars: texto?.slice(0, 500) ?? '',
  });

  if (!texto) {
    throw new Error('Gemini devolvió respuesta vacía.');
  }

  // Gemini a veces envuelve el JSON en ```json ... ```. Limpiar fences.
  let limpio = texto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parseado: unknown;
  try {
    parseado = JSON.parse(limpio);
  } catch {
    // Extracción robusta: a veces Gemini antepone/pospone texto al JSON.
    // Tomamos del primer '{' al último '}'.
    const ini = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (ini >= 0 && fin > ini) {
      limpio = limpio.slice(ini, fin + 1);
      try {
        parseado = JSON.parse(limpio);
      } catch {
        logger.error('[gemini] JSON inválido tras extracción', { longitud: limpio.length });
        throw new Error('Gemini devolvió un JSON inválido.');
      }
    } else {
      logger.error('[gemini] respuesta sin JSON detectable', { longitud: texto.length });
      throw new Error('Gemini devolvió un JSON inválido.');
    }
  }

  const valido = respuestaSourcingSchema.safeParse(parseado);
  if (!valido.success) {
    logger.error('[gemini] respuesta no valida contra schema', {
      errores: valido.error.format(),
      muestra: JSON.stringify(parseado).slice(0, 500),
    });
    throw new Error('La respuesta de Gemini no validó contra el esquema esperado.');
  }

  // Guard anti-alucinación DURO: si Gemini devolvió candidatos pero NO trajo
  // ni una sola fuente de Google Search grounding, esos candidatos salieron de
  // su memoria (inventados), no de búsquedas reales → descartamos todo.
  // Antes este chequeo exigía cantidadBusquedas > 0, así que una respuesta
  // 100% alucinada que reportaba 0 búsquedas se colaba intacta.
  if (cantidadFuentes === 0 && valido.data.candidatos.length > 0) {
    logger.warn('[gemini] candidatos sin ninguna fuente grounded → descartados como alucinación', {
      candidatos: valido.data.candidatos.length,
      busquedas: cantidadBusquedas,
    });
    return {
      candidatos: [],
      query_usada: '(descartado: respuesta sin grounding — evita alucinaciones)',
      fuentes_consultadas: [],
    };
  }

  // Anti-alucinación en 2 niveles (anterior era demasiado agresivo — descartaba
  // perfiles reales de LinkedIn porque /in/ casi nunca aparece como grounding
  // chunk exacto):
  //
  //   1. Gemini hizo búsquedas reales (cantidadBusquedas > 0) → se valida arriba.
  //   2. La validación HTTP posterior (validarUrlPerfil en buscarCandidatosIA)
  //      descarta URLs muertas (404) y marca LinkedIn como no_verificable.
  //
  // Acá ya NO filtramos por urlsGrounded. En su lugar, marcamos cada candidato
  // con `url_en_grounding` para que el frontend pueda mostrar un badge de
  // confianza ("verificado en fuente" vs "requiere validación manual").
  const candidatosMarcados = valido.data.candidatos.map((c) => {
    const url = c.perfil_url.toLowerCase();
    const enGrounding = Array.from(urlsGrounded).some((g) => {
      if (g === url) return true;
      const slug = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
      return !!slug && g.includes(slug[1]);
    });
    return { ...c, url_en_grounding: enGrounding };
  });

  const verificados = candidatosMarcados.filter((c) => c.url_en_grounding).length;
  logger.info('[gemini] candidatos procesados', {
    total: candidatosMarcados.length,
    con_url_en_grounding: verificados,
    sin_grounding_directo: candidatosMarcados.length - verificados,
  });

  return { ...valido.data, candidatos: candidatosMarcados };
}
