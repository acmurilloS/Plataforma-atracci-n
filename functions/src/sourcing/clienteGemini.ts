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

  const ai = new GoogleGenAI({ apiKey });

  // Retry con backoff + fallback a otro modelo cuando 503 high-demand
  // satura el principal. Total: 4 intentos en flash 2.5 (1+3 retries) y
  // si todos fallan por saturación, 2 intentos en flash 2.0.
  async function generarConRetry(
    modelo: string,
    intentos = 4,
    backoffInicialMs = 5000,
  ): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
    let ultimoError: unknown;
    for (let i = 0; i < intentos; i++) {
      try {
        return await ai.models.generateContent({
          model: modelo,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }], temperature: 0.4 },
        });
      } catch (e) {
        ultimoError = e;
        const msg = e instanceof Error ? e.message : String(e);
        const transitorio = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg);
        if (!transitorio || i === intentos - 1) throw e;
        // Backoff exponencial: 5s, 10s, 20s, 40s
        const esperaMs = backoffInicialMs * Math.pow(2, i);
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
    respuesta = await generarConRetry(MODELO_DEFECTO, 4, 5000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const saturacion = /503|UNAVAILABLE|high demand/i.test(msg);
    if (!saturacion) throw e;
    logger.warn('[gemini] modelo principal saturado, intentando fallback', {
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

  // Si Gemini hizo búsquedas pero NO trajo fuentes, está inventando — descartamos todo.
  if (cantidadBusquedas > 0 && cantidadFuentes === 0) {
    logger.warn('[gemini] sin fuentes grounded → respuesta probable alucinación', {
      busquedas: cantidadBusquedas,
    });
    return {
      candidatos: [],
      query_usada: '(sin grounding — respuesta descartada para evitar alucinaciones)',
      fuentes_consultadas: [],
    };
  }

  // Gemini a veces envuelve el JSON en ```json ... ```. Limpiar.
  const limpio = texto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parseado: unknown;
  try {
    parseado = JSON.parse(limpio);
  } catch (e) {
    logger.error('[gemini] JSON inválido', { texto: limpio.slice(0, 500) });
    throw new Error('Gemini devolvió un JSON inválido.');
  }

  const valido = respuestaSourcingSchema.safeParse(parseado);
  if (!valido.success) {
    logger.error('[gemini] respuesta no valida contra schema', {
      errores: valido.error.format(),
      muestra: JSON.stringify(parseado).slice(0, 500),
    });
    throw new Error('La respuesta de Gemini no validó contra el esquema esperado.');
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
