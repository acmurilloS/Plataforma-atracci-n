import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';
import { tokenVigente } from './tokenVigente';

/** Texto neutro para el candidato: NUNCA dice la causa del cierre (anti-revelación). */
export const MENSAJE_PROCESO_FINALIZADO = 'Este proceso ya finalizó. Si tienes dudas, escríbenos.';

/**
 * asegurarPortalEscribible · guard común de las callables del portal que
 * ESCRIBEN (documentos de la carpeta, firmas, consentimientos, formularios,
 * condiciones).
 *
 * Además del token vigente, exige que la postulación del token exista y NO esté
 * en un estado terminal (reu Karen 10-sep: el portal de un repostulado seguía
 * vivo y alimentaba la carpeta vieja de CU-BOG-1240, que GH no podía aprobar).
 * Revocar el token al cerrar el proceso no basta como única defensa: aquí se
 * evalúa el estado ACTUAL de la postulación en cada escritura, así que un
 * 'descartado_por_lider' que se reabre al pool vuelve a poder escribir solo.
 *
 * Orden de uso: llamarlo DESPUÉS de verificar la cédula, para que el estado del
 * proceso no se le revele a quien solo tiene el token. Los llamadores conservan
 * su chequeo previo de `tokenVigente` (antes de la cédula, para no gastar
 * intentos en un enlace muerto); el de aquí deja el guard completo por sí solo.
 *
 * NO usar en `resolverPortalToken` ni en lecturas: el candidato debe poder entrar
 * y ver su mensaje de proceso finalizado.
 *
 * Devuelve la postulación ya leída para que el llamador no la vuelva a pedir.
 */
export async function asegurarPortalEscribible(
  t: Record<string, unknown>,
): Promise<{ postulacionId: string; postulacion: Record<string, unknown> }> {
  if (!tokenVigente(t)) {
    throw new HttpsError(
      'failed-precondition',
      'El enlace expiró o fue revocado. Pídele al equipo de Atracción que te reenvíe tu portal.',
    );
  }
  const postulacionId = String(t.postulacion_id ?? '');
  if (!postulacionId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  const snap = await db.collection('postulaciones').doc(postulacionId).get();
  if (!snap.exists) {
    // Postulación borrada: no dejar documentos huérfanos de un proceso que ya no existe.
    logger.warn('[portal] escritura rechazada: la postulación no existe', { postulacionId });
    throw new HttpsError('failed-precondition', MENSAJE_PROCESO_FINALIZADO);
  }
  const postulacion = (snap.data() ?? {}) as Record<string, unknown>;
  if (esPostulacionTerminal(postulacion.estado)) {
    // El estado técnico queda solo en el log del servidor, nunca en la respuesta.
    logger.info('[portal] escritura rechazada: proceso finalizado', {
      postulacionId,
      estado: String(postulacion.estado ?? ''),
    });
    throw new HttpsError('failed-precondition', MENSAJE_PROCESO_FINALIZADO);
  }
  return { postulacionId, postulacion };
}
