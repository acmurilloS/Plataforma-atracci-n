import { GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { esEstadoFinalizado } from '../portal/faseProceso';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/**
 * maquillarMensajeIA · genera un BORRADOR de mensaje cálido para el candidato
 * (opt-in / enchufable). La IA recibe SOLO una categoría segura del resultado
 * (avanza / no-continúa estándar / no-continúa CONFIDENCIAL / contratado) y el
 * nombre + cargo — NUNCA el motivo del descarte ni datos sensibles.
 *
 * Confidencialidad (no negociable): en el caso confidencial (p. ej. exámenes
 * médicos) el prompt obliga a lenguaje neutro y NO se revela causa alguna; el
 * resultado es un borrador que el staff debe revisar/aprobar antes de enviar.
 *
 * Sin GEMINI_API_KEY (p. ej. en el emulador) cae a una plantilla por categoría,
 * para que el flujo se pueda probar igual en local.
 */

type Categoria = 'avanza' | 'no_continua_estandar' | 'no_continua_confidencial' | 'contratado';

const CATEGORIAS_VALIDAS: Categoria[] = [
  'avanza',
  'no_continua_estandar',
  'no_continua_confidencial',
  'contratado',
];

function categoriaDeEstado(estado: string): Categoria {
  if (estado === 'contratado') return 'contratado';
  if (esEstadoFinalizado(estado)) {
    // El ÚNICO caso confidencial es el descarte por exámenes médicos.
    return estado === 'descartado_examenes_medicos'
      ? 'no_continua_confidencial'
      : 'no_continua_estandar';
  }
  return 'avanza';
}

function descripcionCategoria(c: Categoria): string {
  switch (c) {
    case 'avanza':
      return 'El candidato AVANZÓ a la siguiente etapa del proceso (buena noticia).';
    case 'contratado':
      return 'El candidato fue CONTRATADO. Es una felicitación de bienvenida.';
    case 'no_continua_estandar':
      return 'El candidato NO continúa en el proceso (cierre estándar, sin dar motivos).';
    case 'no_continua_confidencial':
      return 'El candidato NO continúa en el proceso. Caso CONFIDENCIAL: está terminantemente prohibido mencionar o insinuar cualquier causa (médica, de salud, de exámenes o de cualquier tipo).';
  }
}

function plantillaFallback(c: Categoria, nombre: string, cargo: string): string {
  const sufijoCargo = cargo ? ` para el cargo ${cargo}` : '';
  switch (c) {
    case 'avanza':
      return `Hola ${nombre},\n\n¡Buenas noticias! Tu proceso${sufijoCargo} avanzó a la siguiente etapa. Muy pronto te contaremos los siguientes pasos. ¡Vas muy bien!\n\nCordialmente,\nEquipo de Atracción · Organización Equitel`;
    case 'contratado':
      return `Hola ${nombre},\n\n¡Felicitaciones! 🎉 Completaste con éxito tu proceso${sufijoCargo}. ¡Te damos la bienvenida a Equitel!\n\nCordialmente,\nEquipo de Atracción · Organización Equitel`;
    case 'no_continua_confidencial':
      return `Hola ${nombre},\n\nAgradecemos sinceramente tu interés y el tiempo que dedicaste a nuestro proceso${sufijoCargo}. En esta ocasión no continúas en el proceso. Valoramos mucho tu participación y más adelante podríamos contar contigo.\n\nTe deseamos muchos éxitos.\n\nCordialmente,\nEquipo de Atracción · Organización Equitel`;
    case 'no_continua_estandar':
    default:
      return `Hola ${nombre},\n\nValoro mucho tu tiempo y disposición. Aunque en esta ocasión no fue posible avanzar en esta etapa, espero que en el futuro tengamos la oportunidad de hacerlo. Te deseo mucho éxito en tu búsqueda de empleo y, si surge una vacante que se ajuste a tu perfil, sin duda te tendremos en cuenta.\n\nCordialmente,\nEquipo de Atracción · Organización Equitel`;
  }
}

export const maquillarMensajeIA = onCall(
  { region: 'us-central1', secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '').trim();
    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

    const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const nombre = String(post.candidato_nombre ?? '').trim().split(' ')[0] || 'candidato/a';
    const cargo = String(post.cargo_nombre ?? '').trim();
    const estado = String(post.estado ?? '');

    // La categoría la decide el SERVIDOR a partir del estado; el cliente puede
    // sugerir una pero se valida. Nunca se usa el motivo del descarte.
    const sugerida = String(req.data?.categoria ?? '').trim() as Categoria;
    const categoria: Categoria = CATEGORIAS_VALIDAS.includes(sugerida)
      ? sugerida
      : categoriaDeEstado(estado);
    const requiereAprobacion = categoria === 'no_continua_confidencial';

    let mensaje = '';
    let via = 'plantilla';
    const apiKey = process.env.GEMINI_API_KEY;
    // El caso CONFIDENCIAL NO pasa por IA: usa la plantilla neutra fija (garantía
    // absoluta de que jamás se filtre la causa). El staff la aprueba/edita antes
    // de enviar. La IA se reserva para buenas noticias / descarte estándar.
    if (apiKey && !requiereAprobacion) {
      const prompt = `Eres redactor de Recursos Humanos de la Organización Equitel (Colombia).
Redacta un mensaje BREVE (3 a 5 frases), cálido, humano y respetuoso, en español neutro de Colombia,
para enviar a un candidato.

Datos: nombre = "${nombre}"; cargo = "${cargo || 'el cargo'}".
Situación (categoría segura — NO inventes detalles): ${descripcionCategoria(categoria)}

REGLAS ESTRICTAS:
- NUNCA menciones ni insinúes causas médicas, de salud, exámenes, ni ningún motivo del descarte.
- ${requiereAprobacion ? 'Usa lenguaje NEUTRO del estilo: "en esta ocasión no continúas en el proceso" o "el proceso tuvo ajustes internos". No des ninguna razón.' : 'Mantén un tono positivo y honesto, sin prometer cosas que no sabes.'}
- No incluyas asunto. Puedes cerrar con "Cordialmente, Equipo de Atracción · Organización Equitel".
- Devuelve ÚNICAMENTE el texto del mensaje, sin comillas ni explicaciones.`;
      try {
        const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000 } });
        const respuesta = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          // thinkingBudget: 0 → el modelo responde directo, sin volcar su
          // razonamiento interno en el texto (evita "notas" del modelo).
          config: {
            temperature: 0.6,
            maxOutputTokens: 600,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        const t = String(respuesta.text ?? '').trim();
        if (t) {
          mensaje = t;
          via = 'ia';
        }
      } catch (e) {
        logger.warn('[maquillar] Gemini falló; uso plantilla', {
          e: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (!mensaje) {
      mensaje = plantillaFallback(categoria, nombre, cargo);
      via = requiereAprobacion ? 'plantilla_confidencial' : 'plantilla';
    }

    return {
      ok: true as const,
      mensaje,
      categoria,
      requiere_aprobacion: requiereAprobacion,
      via,
    };
  },
);
