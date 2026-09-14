import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { cuentaEnCurso, recalcularResumenVacante } from './resumenPostulaciones';

/**
 * onPostulacionResumen · mantiene `vacantes_resumen/{vacanteId}` (fase real en
 * Seguimiento, reu Karen 10-sep).
 *
 * Se dispara con cada escritura de `postulaciones` y recalcula DESDE CERO el
 * resumen de la vacante afectada (o de las dos, si la postulación cambió de
 * vacante), en transacción. Como el recálculo es idempotente y no depende del
 * orden de llegada de los eventos, `retry: true` es seguro: un fallo transitorio
 * (p. ej. contención cuando varias analistas mueven candidatos de la misma
 * vacante) se reintenta en vez de dejar la tarjeta desfasada hasta la
 * reconciliación diaria.
 *
 * Cortes tempranos (la inmensa mayoría de escrituras no mueve el conteo):
 *  - update que no cambia `vacante_id` ni `estado` (notas, marcas, fechas…).
 *  - la postulación no suma ni antes ni después: el lote de `sourceado_por_ia`
 *    de buscarCandidatosIA/Clay, un descarte que pasa a otro descarte, el
 *    borrado de un terminal.
 * Create y delete llegan con `before`/`after` vacío y cuentan como cambio.
 */
export const onPostulacionResumen = onDocumentWritten(
  { document: 'postulaciones/{id}', region: 'us-central1', retry: true },
  async (event) => {
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    if (!before && !after) return;

    const vacAntes = String(before?.vacante_id ?? '');
    const vacDespues = String(after?.vacante_id ?? '');
    const estadoAntes = String(before?.estado ?? '');
    const estadoDespues = String(after?.estado ?? '');
    if (before && after && vacAntes === vacDespues && estadoAntes === estadoDespues) return;

    // Vacante en la que la postulación sumaba antes / suma ahora ('' = en ninguna).
    const sumabaEn = before && cuentaEnCurso(estadoAntes) ? vacAntes : '';
    const sumaEn = after && cuentaEnCurso(estadoDespues) ? vacDespues : '';
    const vacantes = [...new Set([sumabaEn, sumaEn])].filter(Boolean);
    if (vacantes.length === 0) return;

    const postId = event.params.id;
    for (const vacanteId of vacantes) {
      try {
        const r = await recalcularResumenVacante(vacanteId);
        if (r?.cambiado) {
          logger.info('onPostulacionResumen · resumen actualizado', {
            post_id: postId,
            vacante_id: vacanteId,
            total_en_curso: r.total_en_curso,
          });
        }
      } catch (e) {
        logger.error('onPostulacionResumen · no se pudo recalcular el resumen', {
          post_id: postId,
          vacante_id: vacanteId,
          msg: e instanceof Error ? e.message : String(e),
        });
        throw e; // retry: true → se reintenta (el recálculo es idempotente)
      }
    }
  },
);
