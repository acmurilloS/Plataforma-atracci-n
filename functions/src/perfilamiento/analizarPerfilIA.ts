import { GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import { db } from '../utils/admin';
import { FieldValue } from 'firebase-admin/firestore';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/**
 * Análisis IA del perfilamiento (paso 3) — validador anti-unicornio.
 *
 * Disparado manualmente desde PerfilamientoPage por la analista cuando quiere
 * una segunda opinión sobre si lo que pide el líder es realista.
 *
 * Usa Gemini Flash (gemini-2.5-flash) por costo bajo (~$0.0001 por análisis).
 * No usa grounding (Google Search) — solo razonamiento sobre los datos enviados.
 */

const MODELO = 'gemini-2.5-flash';

const inputSchema = z.object({
  cargo_nombre: z.string().min(1),
  categoria_cargo: z.string().nullable(),
  salario_base: z.number().positive(),
  banda_min: z.number().nullable(),
  banda_max: z.number().nullable(),
  criticidad: z.enum(['Alta', 'Media', 'Baja']),
  empresa_nombre: z.string(),
  sede_ciudad: z.string(),
  criterios_texto: z.string().min(20),
  empresas_competencia: z.array(z.string()),
  // Compensación adicional al salario base — sin esto, la IA pensaba que
  // el salario base era el paquete completo y alertaba "falta rodamiento"
  // aunque el líder sí lo había puesto.
  comisiones_texto: z.string().default(''),
  rodamiento: z.boolean().default(false),
  garantizado_texto: z.string().default(''),
});

const respuestaSchema = z.object({
  diagnostico: z.string().min(10),
  alertas_adicionales: z.array(z.string()).max(8),
  recomendacion_global: z.string().min(5),
  perfil_es_realista: z.boolean(),
});

type RespuestaIA = z.infer<typeof respuestaSchema>;

function construirPrompt(d: z.infer<typeof inputSchema>): string {
  return `Eres un consultor senior de talento humano en Colombia con 15 años de experiencia
analizando mercado laboral. Tu tarea: detectar si un perfilamiento de vacante es
realista o un "unicornio" (perfil que no existe en el mercado por desalineación
entre lo que pide el líder y lo que ofrece la empresa).

Vacante:
- Cargo: ${d.cargo_nombre}
- Categoría: ${d.categoria_cargo ?? 'no clasificado'}
- Empresa: ${d.empresa_nombre} (${d.sede_ciudad})
- Criticidad: ${d.criticidad}
- Salario base: $${d.salario_base.toLocaleString('es-CO')} COP
- Banda salarial del cargo: ${d.banda_min ? `$${d.banda_min.toLocaleString('es-CO')}` : 'sin banda'} - ${d.banda_max ? `$${d.banda_max.toLocaleString('es-CO')}` : 'sin banda'}
- Comisiones: ${d.comisiones_texto.trim() ? `"${d.comisiones_texto.trim()}"` : 'no aplica / no informadas'}
- Auxilio de rodamiento: ${d.rodamiento ? 'SÍ incluye (monto/condiciones en garantizado o comisiones)' : 'no incluye'}
- Garantizado / bonificaciones: ${d.garantizado_texto.trim() ? `"${d.garantizado_texto.trim()}"` : 'no aplica'}

NOTA IMPORTANTE: para calcular si el paquete es competitivo, SUMA mentalmente
salario base + comisiones promedio + rodamiento + garantizado. NO alertes que
"falta rodamiento" o "falta auxilio de transporte" si los campos arriba dicen
que sí incluye o si hay garantizado/comisiones que ya cubren esa expectativa.

Criterios del líder:
"""
${d.criterios_texto}
"""

Empresas competencia mencionadas: ${d.empresas_competencia.length > 0 ? d.empresas_competencia.join(', ') : 'ninguna'}

Analiza con contexto del mercado colombiano 2026:
1. ¿La experiencia pedida es coherente con el salario y la categoría?
2. ¿Las habilidades técnicas/idiomas/certificaciones pedidas se consiguen con ese salario?
3. ¿La combinación de requisitos describe a UNA persona o son varias personas mezcladas?
4. ¿Las empresas competencia mencionadas pagan más que esta vacante? Si sí, los profesionales no aceptarían.
5. ¿Hay overkill (maestría/doctorado donde no aplica, certificaciones premium opcionales)?

Devuelve SOLO JSON válido con este esquema exacto:
{
  "diagnostico": "Resumen de 1-2 oraciones sobre si el perfil es realista o no, y por qué.",
  "alertas_adicionales": ["alerta concreta y accionable 1", "alerta concreta 2", "..."],
  "recomendacion_global": "Una sola recomendación priorizada y específica: qué cambiar primero.",
  "perfil_es_realista": true | false
}

NO inventes datos numéricos del mercado; razona sobre lo que tienes. Máximo 8 alertas adicionales.
Sé directo, no diplomático. La analista necesita data, no piropos.`;
}

export const analizarPerfilIA = onCall(
  { region: 'us-central1', timeoutSeconds: 60, secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Inicia sesión.');
    }
    const rol = req.auth.token.rol;
    if (rol !== 'analista' && rol !== 'coordinador' && rol !== 'admin' && rol !== 'lider') {
      throw new HttpsError('permission-denied', 'Solo analista, coordinador, admin o líder.');
    }

    const parsed = inputSchema.safeParse(req.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos de entrada inválidos.', {
        errores: parsed.error.format(),
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'GEMINI_API_KEY no configurada. Pide al admin que la sembre.',
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = construirPrompt(parsed.data);

    let respTexto: string;
    try {
      const r = await ai.models.generateContent({
        model: MODELO,
        contents: prompt,
        config: { temperature: 0.3 },
      });
      respTexto = r.text ?? '';
    } catch (e) {
      logger.error('[analizarPerfilIA] Gemini falló', {
        err: e instanceof Error ? e.message : String(e),
      });
      throw new HttpsError('internal', 'No pudimos consultar IA, intenta más tarde.');
    }

    const limpio = respTexto
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parseado: unknown;
    try {
      parseado = JSON.parse(limpio);
    } catch {
      logger.error('[analizarPerfilIA] JSON inválido de Gemini', { muestra: limpio.slice(0, 300) });
      throw new HttpsError('internal', 'IA devolvió respuesta mal formada.');
    }

    const validado = respuestaSchema.safeParse(parseado);
    if (!validado.success) {
      logger.error('[analizarPerfilIA] respuesta no valida', {
        errores: validado.error.format(),
      });
      throw new HttpsError('internal', 'IA devolvió respuesta inesperada.');
    }

    const resultado: RespuestaIA = validado.data;

    // Bitácora de auditoría
    await db.collection('eventos').add({
      tipo: 'analisis_perfil_ia',
      cargo: parsed.data.cargo_nombre,
      empresa: parsed.data.empresa_nombre,
      salario: parsed.data.salario_base,
      perfil_es_realista: resultado.perfil_es_realista,
      total_alertas_ia: resultado.alertas_adicionales.length,
      usuario_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return resultado;
  },
);
