import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';
import { cargoRequiereDotacion, enviarSolicitudDotacionCore, TALLAS } from './enviarSolicitudDotacion';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/** ¿El doc de Datos Básicos tiene al menos una talla diligenciada? */
function tieneTalla(d: Record<string, unknown> | undefined): boolean {
  if (!d) return false;
  return TALLAS.some((t) => String(d[t.key] ?? '').trim() !== '');
}

/**
 * onDatosBasicosTallas · dotación AUTOMÁTICA (reu Karen 02-jul).
 *
 * Cuando el integrante diligencia sus TALLAS en Datos Básicos y el cargo requiere
 * dotación (flag del perfilamiento), envía solo la solicitud a compras/gestores —
 * sin que la analista tenga que apretar el botón. Antes era 100% manual.
 *
 * Dispara en la TRANSICIÓN de "sin tallas" → "con tallas" (no en cada edición de
 * GH). Idempotente por `solicitud_dotacion_enviada_en`. El botón manual del modal
 * sigue disponible para corregir tallas y reenviar.
 */
export const onDatosBasicosTallas = onDocumentWritten(
  {
    document: 'datos_basicos_integrante/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const after = event.data?.after.data();
    if (!after) return; // borrado
    const before = event.data?.before.data();

    // Solo al MOMENTO en que se diligencian las tallas (antes no había, ahora sí).
    if (!tieneTalla(after) || tieneTalla(before)) return;

    const postulacionId = String(after.postulacion_id ?? '').trim();
    if (!postulacionId) return;

    const postRef = db.collection('postulaciones').doc(postulacionId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) return;
    const post = postSnap.data() as Record<string, unknown>;

    if (post.solicitud_dotacion_enviada_en) return; // ya se envió (manual o auto previo)
    // Candidato fuera del proceso (se descartó, retiró o repostuló): no se pide
    // dotación. Usa la fuente única esPostulacionTerminal — misma semántica que la
    // copia local que había aquí, a la que le faltaba 'descartado_entrevista_analista'.
    if (esPostulacionTerminal(post.estado)) return;
    if (!(await cargoRequiereDotacion(post))) return; // el cargo no requiere dotación

    const tallas: Record<string, unknown> = {};
    for (const t of TALLAS) tallas[t.key] = after[t.key];

    try {
      await enviarSolicitudDotacionCore({
        postRef,
        post,
        postulacionId,
        tallasIn: tallas,
        observaciones: '',
        porUid: 'sistema_automatico',
        guardarTallas: false, // las tallas ya viven en Datos Básicos
      });
      logger.info('[dotacion-auto] enviada', { postulacionId });
    } catch (e) {
      // No romper el flujo: la analista puede enviarla manual si falla.
      logger.error('[dotacion-auto] falló', {
        postulacionId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  },
);
