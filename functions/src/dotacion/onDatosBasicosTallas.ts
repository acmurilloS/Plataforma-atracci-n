import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { cargoRequiereDotacion, enviarSolicitudDotacionCore, TALLAS } from './enviarSolicitudDotacion';
import { prendasFaltantes, tallasCompletas } from './tallas';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * Dotación AUTOMÁTICA (reu Karen 02-jul): la solicitud a compras/gestores sale sola
 * con las tallas que el integrante diligencia en Datos Básicos, si el cargo
 * requiere dotación (perfilamiento o lista de cargos del catálogo).
 *
 * Reu Karen 04-nov: SOLO cuando la persona ya está en CONTRATACIÓN (o contratada).
 * Antes salía apenas llenaba las tallas, y las analistas envían el portal desde
 * pruebas: CU-CAL-1263 pidió dotación para un candidato en pruebas.
 * DotaTrack 17-nov (A3): SOLO con las 6 prendas diligenciadas (talla o "NO APLICA");
 * si llega a contratación con tallas incompletas, se le avisa UNA vez a la analista.
 *
 * Dos disparos, los dos por el mismo núcleo:
 *  - `onDatosBasicosTallas`: las tallas quedan completas estando ya en contratación;
 *  - `onPostulacionDotacion`: llega a contratación (con o sin tallas completas).
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

/** Aviso único a la analista: está en contratación y faltan tallas. */
async function avisarTallasFaltantes(
  postRef: FirebaseFirestore.DocumentReference,
  post: Record<string, unknown>,
  faltan: string[],
): Promise<void> {
  if (post.dotacion_tallas_faltantes_avisado_en) return;
  const vac = (await db.collection('vacantes').doc(String(post.vacante_id ?? '')).get()).data() ?? {};
  const analista = String(vac.analista_uid ?? '').trim();
  const consecutivo = String(post.vacante_consecutivo ?? vac.consecutivo ?? '').trim();
  const nombre = String(post.candidato_nombre ?? '').trim() || 'El integrante';
  await postRef.update({ dotacion_tallas_faltantes_avisado_en: FieldValue.serverTimestamp() });
  if (!analista) return;
  await db.collection('notificaciones').add({
    destinatario_uid: analista,
    tipo: 'dotacion_tallas_faltantes',
    titulo: `Faltan tallas para pedir la dotación${consecutivo ? ` · ${consecutivo}` : ''}`,
    mensaje:
      `${nombre} ya está en contratación y su cargo lleva dotación, pero faltan tallas: ` +
      `${faltan.join(', ')}. Pídele que las complete en Datos Básicos de su portal, o escríbelas ` +
      'tú en la solicitud de dotación (si no usa una prenda, marca «No aplica»). La solicitud ' +
      'sale sola apenas estén completas.',
    link: `/postulaciones/${postRef.id}`,
    vacante_id: String(post.vacante_id ?? ''),
    postulacion_id: postRef.id,
    leida: false,
    leida_en: null,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: 'system',
  });
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
  if (!tallasCompletas(db0)) {
    try {
      await avisarTallasFaltantes(postRef, post, prendasFaltantes(db0));
    } catch (e) {
      logger.warn('[dotacion-auto] no se pudo avisar de las tallas faltantes', {
        postulacionId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

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

/** Las tallas quedan completas (transición "incompletas" → "completas"). */
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
    if (!tallasCompletas(after) || tallasCompletas(before)) return;
    const postulacionId = String(after.postulacion_id ?? '').trim();
    if (!postulacionId) return;
    await dotacionAutomatica(postulacionId, after, 'tallas');
  },
);

/** La postulación llega a contratación (o contratado). */
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
