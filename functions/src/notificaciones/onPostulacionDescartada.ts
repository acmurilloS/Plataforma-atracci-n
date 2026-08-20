import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
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
  'descartado_entrevista_analista',
  'descartado_examenes_medicos',
];

/**
 * Sincroniza el examen médico a 'no_apto' cuando la postulación se marca
 * `descartado_examenes_medicos` desde el desplegable de estado (reu Karen 19-ago).
 * El desplegable solo cambia la postulación; la pantalla de Exámenes cuenta por el
 * estado del EXAMEN, así que sin esto la persona quedaba en "Revisión C&D" en vez
 * de "No aptos". No pisa un examen ya decidido (apto/no_apto). Best-effort.
 */
async function sincronizarExamenNoApto(postulacionId: string, uid: string): Promise<void> {
  const q = await db
    .collection('examenes_medicos')
    .where('postulacion_id', '==', postulacionId)
    .limit(1)
    .get();
  if (q.empty) return;
  const ref = q.docs[0].ref;
  const estadoEx = String(q.docs[0].data()?.estado ?? '');
  if (estadoEx === 'no_apto' || estadoEx === 'apto') return; // ya decidido, no tocar
  await ref.update({
    estado: 'no_apto',
    decision_cd: 'no_continua',
    sincronizado_desde_descarte: true,
    decidido_en: FieldValue.serverTimestamp(),
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: uid || 'sistema_sync_descarte',
  });
  logger.info('[examen-sync] examen -> no_apto por descarte de postulación', {
    postulacionId,
    estadoPrevio: estadoEx,
  });
}

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

    // #2 (reu Karen 19-ago): si el descarte es por exámenes, sincroniza el doc del
    // examen a 'no_apto' para que la pantalla de Exámenes lo cuente en "No aptos"
    // (y no en "Revisión C&D"). Va ANTES del corte del agradecimiento para no
    // depender de si ya se agradeció. Best-effort.
    if (estado === 'descartado_examenes_medicos') {
      try {
        await sincronizarExamenNoApto(event.params.id, String(after.actualizado_por ?? ''));
      } catch (e) {
        logger.error('[examen-sync] falló', {
          id: event.params.id,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    }

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
