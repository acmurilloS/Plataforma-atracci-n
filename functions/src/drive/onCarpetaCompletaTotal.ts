import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import {
  asegurarCarpetaRef,
  carpetaCompleta100,
  ejecutarDepositoDrive,
} from './sincronizarCarpeta';

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
    const data = (event.data?.after?.data() ?? event.data?.before?.data()) as
      | Record<string, unknown>
      | undefined;
    if (!data) return;
    const postulacionId = String(data.postulacion_id ?? '');
    if (!postulacionId) return;

    if (!(await carpetaCompleta100(postulacionId))) return;

    // Asegura la carpeta (idempotente) — cubre la carrera en que CyD y GH completan
    // en el mismo evento y onCarpetaCompletaCheck aún no la creó.
    const carpetaRef = await asegurarCarpetaRef(postulacionId);
    if (!carpetaRef) return;

    // Depósito con lock (serializa con el reintento manual). Único punto que toca
    // los flags drive_*.
    const r = await ejecutarDepositoDrive(carpetaRef, postulacionId);
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
    // 'ocupado' / 'ya_sincronizada' / 'sin_carpeta' → no-op
  },
);
