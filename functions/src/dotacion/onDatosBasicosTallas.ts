import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { cargoRequiereDotacion, enviarSolicitudDotacionCore, TALLAS } from './enviarSolicitudDotacion';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * Dotación AUTOMÁTICA (reu Karen 02-jul): la solicitud a compras/gestores sale sola
 * con las tallas que el integrante diligencia en Datos Básicos, si el cargo
 * requiere dotación (flag del perfilamiento).
 *
 * Reu Karen 04-nov: SOLO cuando la persona ya está en CONTRATACIÓN (o contratada).
 * Antes salía apenas llenaba las tallas, y las analistas envían el portal desde
 * pruebas: CU-CAL-1263 pidió dotación para un candidato en pruebas ("aún no hemos
 * avanzado con ningún candidato") y al menos 7 solicitudes salieron para gente que
 * nunca se contrató. Ahora hay dos disparos, los dos por el mismo núcleo:
 *  - `onDatosBasicosTallas`: diligencia las tallas estando ya en contratación;
 *  - `onPostulacionDotacion`: llega a contratación con las tallas ya diligenciadas.
 * Idempotente por `solicitud_dotacion_enviada_en`. El botón manual del modal sigue
 * disponible para pedirla antes o corregir tallas.
 */
export const ESTADOS_DOTACION = ['en_contratacion', 'contratado'];

/** ¿El doc de Datos Básicos tiene al menos una talla diligenciada? */
export function tieneTalla(d: Record<string, unknown> | undefined | null): boolean {
  if (!d) return false;
  return TALLAS.some((t) => String(d[t.key] ?? '').trim() !== '');
}

/** ¿Este estado de la postulación ya permite pedir la dotación? */
export function estadoPideDotacion(estado: unknown): boolean {
  return ESTADOS_DOTACION.includes(String(estado ?? ''));
}

async function dotacionAutomatica(
  postulacionId: string,
  datosBasicos: Record<string, unknown> | null,
  origen: 'tallas' | 'contratacion',
): Promise<void> {
  const postRef = db.collection('postulaciones').doc(postulacionId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return;
  const post = postSnap.data() as Record<string, unknown>;

  if (post.solicitud_dotacion_enviada_en) return; // ya se envió (manual o auto previo)
  if (!estadoPideDotacion(post.estado)) return; // aún no está en contratación
  if (!(await cargoRequiereDotacion(post))) return; // el cargo no requiere dotación

  let db0 = datosBasicos;
  if (!db0) {
    const s = await db
      .collection('datos_basicos_integrante')
      .where('postulacion_id', '==', postulacionId)
      .limit(1)
      .get();
    db0 = s.empty ? null : (s.docs[0].data() as Record<string, unknown>);
  }
  if (!tieneTalla(db0)) return; // sin tallas: la pedirá la analista desde el modal

  const tallas: Record<string, unknown> = {};
  for (const t of TALLAS) tallas[t.key] = db0?.[t.key];

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
    logger.info('[dotacion-auto] enviada', { postulacionId, origen, estado: post.estado });
  } catch (e) {
    // No romper el flujo: la analista puede enviarla manual si falla.
    logger.error('[dotacion-auto] falló', {
      postulacionId,
      origen,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}

/** El integrante diligencia sus tallas (transición "sin tallas" → "con tallas"). */
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
    if (!tieneTalla(after) || tieneTalla(before)) return;
    const postulacionId = String(after.postulacion_id ?? '').trim();
    if (!postulacionId) return;
    await dotacionAutomatica(postulacionId, after, 'tallas');
  },
);

/** La postulación llega a contratación (o contratado) con las tallas ya diligenciadas. */
export const onPostulacionDotacion = onDocumentUpdated(
  {
    document: 'postulaciones/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (estadoPideDotacion(before.estado) || !estadoPideDotacion(after.estado)) return;
    if (after.solicitud_dotacion_enviada_en) return;
    await dotacionAutomatica(event.params.id, null, 'contratacion');
  },
);
