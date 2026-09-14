import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';
import {
  asegurarCarpetaRef,
  carpetaListaParaDrive,
  ejecutarDepositoDrive,
} from './sincronizarCarpeta';

const ESTADOS_OK = new Set(['entregado', 'verificado', 'no_aplica']);

const GDRIVE_SERVICE_ACCOUNT_JSON = defineSecret('GDRIVE_SERVICE_ACCOUNT_JSON');

/**
 * onCarpetaCompletaTotal · depósito automático a Drive al 100% TOTAL (CyD + GH).
 *
 * Se dispara con cada cambio en documentos_candidato. Cuando TODOS los
 * obligatorios (CyD + GH) están entregado|verificado|no_aplica, deposita la
 * carpeta completa del integrante en la Unidad Compartida de GH. NO usa el evento
 * del Bug#2 (que es solo-CyD) ni el estado 'aprobada' (que no exige docs de GH).
 *
 * Idempotencia / robustez:
 *  - flag `drive_sincronizada_en` en la carpeta: si ya está, no re-sincroniza.
 *  - lock `drive_sync_intentando_en` (10 min) en transacción: evita el doble envío
 *    cuando GH sube varios docs en ráfaga y varias invocaciones ven el 100%.
 *  - la sync reutiliza subcarpeta/archivos por nombre → reintento sin duplicar.
 *  - si falla, deja `drive_error` y NO marca sincronizada → reintento (manual).
 *  - el fallo de Drive NO rompe el flujo de la plataforma (trigger aislado).
 *  - postulación terminal (repostulado, descartado, desistió…) o carpeta
 *    'anulada' → no deposita (reu Karen 10-sep): la subcarpeta es por candidato
 *    ("Nombre - cédula"), así que el proceso viejo de un repostulado escribiría
 *    en la misma que el nuevo.
 */
export const onCarpetaCompletaTotal = onDocumentWritten(
  {
    document: 'documentos_candidato/{id}',
    region: 'us-central1',
    secrets: [GDRIVE_SERVICE_ACCOUNT_JSON],
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (event) => {
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const data = after ?? before;
    if (!data) return;
    const postulacionId = String(data.postulacion_id ?? '');
    if (!postulacionId) return;

    // Proceso terminado sin contratación → su carpeta no va a Drive. Se corta antes
    // de las queries; asegurarCarpetaRef y el lock de ejecutarDepositoDrive lo
    // vuelven a validar (cubren al reintento manual y a la carrera con el estado).
    const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
    if (esPostulacionTerminal(postSnap.data()?.estado)) return;

    // Umbral 85% de C&D (reu 21-jul): deposita sin esperar los 4 docs de GH.
    if (!(await carpetaListaParaDrive(postulacionId))) return;

    // Asegura la carpeta (idempotente) — cubre la carrera en que CyD y GH completan
    // en el mismo evento y onCarpetaCompletaCheck aún no la creó.
    const carpetaRef = await asegurarCarpetaRef(postulacionId);
    if (!carpetaRef) return;

    // ¿Ya se depositó antes? Si sí, solo re-sincronizamos cuando ESTE documento
    // acaba de pasar a un estado OK (entregado/verificado) — así el contrato y las
    // afiliaciones que GH sube DESPUÉS del 85% se suben a Drive sin duplicar, pero
    // no re-sincronizamos por escrituras irrelevantes.
    const ya = (await carpetaRef.get()).data()?.drive_sincronizada_en;
    const entroAOk =
      !ESTADOS_OK.has(String(before?.estado ?? '')) && ESTADOS_OK.has(String(after?.estado ?? ''));
    // También re-sincroniza si a un ítem ya depositado le AGREGARON un archivo
    // después (p. ej. el 2º antecedente judicial): el estado sigue en 'entregado'
    // (no hay transición a OK), pero el contenido cambió y el archivo nuevo quedaría
    // huérfano en Drive sin este disparo. La sync es incremental (dedup por nombre).
    const urlsAntes = new Set(urlsDeArchivos(before));
    const hayArchivoNuevo = urlsDeArchivos(after).some((u) => !urlsAntes.has(u));
    if (ya && !entroAOk && !hayArchivoNuevo) return;

    // Depósito con lock (serializa con el reintento manual). Único punto que toca
    // los flags drive_*. `ya` → re-sync incremental de lo que llegó tarde.
    const r = await ejecutarDepositoDrive(carpetaRef, postulacionId, Boolean(ya));
    if (r.estado === 'ok') {
      await db.collection('eventos').add({
        tipo: 'carpeta_sincronizada_drive',
        postulacion_id: postulacionId,
        drive_carpeta_id: r.drive_carpeta_id ?? null,
        archivos: r.subidos ?? 0,
        creado_en: FieldValue.serverTimestamp(),
        creado_por: 'system',
      });
      logger.info('[drive] carpeta depositada en la unidad', { postulacionId, subidos: r.subidos });
    } else if (r.estado === 'error') {
      logger.error('[drive] sync automática falló', { postulacionId, error: r.error });
    }
    // 'ocupado' / 'ya_sincronizada' / 'sin_carpeta' / 'anulada' / 'postulacion_terminal' → no-op
  },
);

/** URLs de todos los archivos del documento (los ítems múltiples usan `archivos[]`). */
function urlsDeArchivos(d: Record<string, unknown> | undefined): string[] {
  if (!d) return [];
  const arr = Array.isArray(d.archivos) ? (d.archivos as { url?: unknown }[]) : [];
  const urls = arr.map((a) => String(a?.url ?? '').trim()).filter(Boolean);
  if (urls.length) return urls;
  const single = String(d.archivo_url ?? '').trim();
  return single ? [single] : [];
}
