import { GoogleGenAI } from '@google/genai';
import { logger } from 'firebase-functions/v2';
import { respuestaSourcingSchema, type RespuestaSourcing } from './respuestaSchema';

const MODELO_DEFECTO = 'gemini-2.5-flash';

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

  const respuesta = await ai.models.generateContent({
    model: MODELO_DEFECTO,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.4,
    },
  });

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

  // Filtro anti-alucinación: solo conservamos candidatos cuya perfil_url
  // aparece (parcial o totalmente) en las fuentes que Gemini realmente consultó.
  if (urlsGrounded.size > 0) {
    const conservados = valido.data.candidatos.filter((c) => {
      const url = c.perfil_url.toLowerCase();
      // Match flexible: el host + path inicial debe aparecer en alguna URL grounded
      return Array.from(urlsGrounded).some((g) => {
        if (g === url) return true;
        // Match por slug LinkedIn (ej. linkedin.com/in/xxx aparece en grounding)
        const slugMatch = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (slugMatch && g.includes(slugMatch[1])) return true;
        return false;
      });
    });
    const descartados = valido.data.candidatos.length - conservados.length;
    if (descartados > 0) {
      logger.info('[gemini] candidatos descartados por no aparecer en fuentes grounded', {
        descartados,
        conservados: conservados.length,
      });
    }
    return { ...valido.data, candidatos: conservados };
  }

  return valido.data;
}
