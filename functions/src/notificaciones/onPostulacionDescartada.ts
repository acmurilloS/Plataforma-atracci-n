import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
  enviarAgradecimientoCore,
  mensajeAgradecimientoDefault,
} from './enviarAgradecimientoCandidato';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * Estados en los que NOSOTROS descartamos al candidato → se envía el agradecimiento
 * AUTOMÁTICO (texto por defecto neutro). Se excluyen los estados donde el candidato
 * se retira (desistio_candidato, pre_entrevistado_no_interesado): ahí el texto
 * "hemos continuado con otros" no aplica y el analista lo maneja con el botón manual.
 */
const ESTADOS_AGRADECIMIENTO_AUTO = [
  'filtrado_no_cumple',
  'descartado_por_lider',
  'descartado_examenes_medicos',
];

/**
 * onPostulacionDescartada · al pasar una postulación a un estado de descarte,
 * envía automáticamente el correo de agradecimiento al candidato (audit #17).
 *
 * Idempotente: no envía si ya hay `agradecimiento_enviado_en` (ya salió manual o
 * por un disparo previo). El botón manual del analista sigue disponible para
 * reenviar con texto editado. En descarte médico el texto por defecto es neutro
 * (no revela la causa) y pasa la validación anti-revelación del core.
 */
export const onPostulacionDescartada = onDocumentUpdated(
  {
    document: 'postulaciones/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const estado = String(after.estado ?? '');
    if (String(before.estado ?? '') === estado) return; // el estado no cambió
    if (!ESTADOS_AGRADECIMIENTO_AUTO.includes(estado)) return; // no es un descarte auto
    if (after.agradecimiento_enviado_en) return; // ya se envió (manual o auto previo)

    const email = String(after.candidato_email ?? '').trim();
    if (!email) {
      logger.info('[agradecimiento-auto] candidato sin correo, se omite', { id: event.params.id, estado });
      return;
    }

    const mensaje = mensajeAgradecimientoDefault(
      String(after.candidato_nombre ?? ''),
      String(after.cargo_nombre ?? '').trim(),
    );

    try {
      await enviarAgradecimientoCore(
        event.data!.after.ref,
        after,
        event.params.id,
        mensaje,
        'sistema_automatico',
      );
      logger.info('[agradecimiento-auto] enviado', { id: event.params.id, estado, email });
    } catch (e) {
      // No romper el flujo: el analista puede reenviar manualmente si falla.
      logger.error('[agradecimiento-auto] falló', {
        id: event.params.id,
        estado,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  },
);
