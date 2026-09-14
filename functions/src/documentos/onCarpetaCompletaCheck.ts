import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';
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
 *  - id determinístico `carpeta_{postulacion_id}` (el mismo del botón manual de
 *    CarpetasPage y de asegurarCarpetaRef), creado con `create()`: si otro camino
 *    la creó entre la consulta y la escritura, falla con ALREADY_EXISTS y se deja
 *    como está, sin pisar sus drive_* (antes era un `set` que podía borrarlos).
 *    Query-first por postulacion_id: si ya existe cualquier carpeta para la
 *    postulación (incluidas las viejas con id aleatorio), no crea otra.
 *  - Postulación terminal (repostulado, descartado, desistió…): no crea carpeta
 *    ni avisa a GH (reu Karen 10-sep: carpeta huérfana de un repostulado).
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

    // La postulación primero: un proceso terminado no arma carpeta (y así se evita
    // la consulta de documentos).
    const postPreSnap = await db.collection('postulaciones').doc(postulacionId).get();
    const postPre = (postPreSnap.data() ?? {}) as Record<string, unknown>;
    if (esPostulacionTerminal(postPre.estado)) return;

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

    // Movimiento interno (reu Karen sep-2026): la persona ya es empleada; la
    // carpeta solo exige el reporte de novedad / solicitud de integrante.
    const clavesRequeridas: readonly string[] = postPre.movimiento_interno
      ? ['solicitud_integrantes']
      : CLAVES_OBLIGATORIAS;

    const completa = clavesRequeridas.every((clave) => {
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
      const carpetaRef = db.collection('carpetas_digitales').doc(`carpeta_${postulacionId}`);
      try {
        await carpetaRef.create({
          postulacion_id: postulacionId,
          candidato_id: postPre.candidato_id ?? null,
          vacante_id: postPre.vacante_id ?? null,
          candidato_nombre: postPre.candidato_nombre ?? null,
          cargo_nombre: postPre.cargo_nombre ?? null,
          vacante_consecutivo: postPre.vacante_consecutivo ?? null,
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
      } catch (e) {
        // 6 = ALREADY_EXISTS: la creó otro camino en paralelo (botón manual o
        // asegurarCarpetaRef) → se respeta la existente.
        if ((e as { code?: number }).code !== 6) throw e;
      }
    }

    // ── Avisar a GH (idempotente) ─────────────────────────────────────────────
    await notificarCarpetaListaValidarCore(postulacionId, 'system');
  },
);
