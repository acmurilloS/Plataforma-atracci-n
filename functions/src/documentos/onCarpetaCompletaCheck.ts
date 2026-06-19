import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { CLAVES_OBLIGATORIAS } from './catalogoCarpeta';
import { notificarCarpetaListaValidarCore } from './notificarCarpetaListaValidarCore';

/**
 * onCarpetaCompletaCheck · F5 · auto-armado de la carpeta.
 *
 * Se dispara con cada cambio en `documentos_candidato`. Cuando TODOS los
 * documentos obligatorios de la postulación ya están `entregado|verificado|
 * no_aplica`, crea la `carpetas_digitales` de forma idempotente y avisa a GH.
 *
 * Idempotencia / aislamiento:
 *  - id determinístico `carpeta_{postulacion_id}` (un set bajo carrera no
 *    duplica) + query-first por postulacion_id (no choca con el botón manual de
 *    CarpetasPage, que usa id aleatorio). Si ya existe cualquier carpeta para la
 *    postulación, no crea otra.
 *  - El aviso a GH es idempotente con `carpeta_lista_validar_notificada_en`.
 *  - El trigger NO escribe en `documentos_candidato`, así que no se auto-dispara.
 */
export const onCarpetaCompletaCheck = onDocumentWritten(
  { document: 'documentos_candidato/{id}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const data = after ?? before;
    if (!data) return;

    const postulacionId = String(data.postulacion_id ?? '');
    if (!postulacionId) return;

    // Estado actual de la carpeta (todos los docs de la postulación).
    const dc = await db
      .collection('documentos_candidato')
      .where('postulacion_id', '==', postulacionId)
      .get();
    const estadoPorClave = new Map<string, string>();
    dc.docs.forEach((d) => {
      const x = d.data() as Record<string, unknown>;
      estadoPorClave.set(String(x.clave ?? ''), String(x.estado ?? 'pendiente'));
    });

    const completa = CLAVES_OBLIGATORIAS.every((clave) => {
      const e = estadoPorClave.get(clave);
      return e === 'entregado' || e === 'verificado' || e === 'no_aplica';
    });
    if (!completa) return;

    // ── Crear carpeta si no existe ya (manual o auto) ─────────────────────────
    const yaExiste = await db
      .collection('carpetas_digitales')
      .where('postulacion_id', '==', postulacionId)
      .limit(1)
      .get();

    if (yaExiste.empty) {
      const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
      const post = (postSnap.data() ?? {}) as Record<string, unknown>;
      const carpetaRef = db.collection('carpetas_digitales').doc(`carpeta_${postulacionId}`);
      await carpetaRef.set({
        postulacion_id: postulacionId,
        candidato_id: post.candidato_id ?? null,
        vacante_id: post.vacante_id ?? null,
        candidato_nombre: post.candidato_nombre ?? null,
        cargo_nombre: post.cargo_nombre ?? null,
        vacante_consecutivo: post.vacante_consecutivo ?? null,
        estado: 'armando',
        entregada_en: null,
        entregada_a_uid: null,
        observaciones_gh: null,
        aprobada_en: null,
        auto_creada: true,
        creado_en: FieldValue.serverTimestamp(),
        creado_por: 'system',
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: 'system',
      });
      logger.info('[carpeta] auto-creada', { postulacionId });
    }

    // ── Avisar a GH (idempotente) ─────────────────────────────────────────────
    await notificarCarpetaListaValidarCore(postulacionId, 'system');
  },
);
