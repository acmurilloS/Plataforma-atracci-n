import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { enviarOrdenAGestores } from './ordenGestores';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * onExamenMedicoCreate · paso 15.
 *
 * Cuando el líder aprueba al candidato (TernaPage), se crea automáticamente la
 * solicitud `examenes_medicos/{id}` con estado 'solicitada'. Este trigger manda
 * el correo de orden de exámenes a los gestores SST apenas se crea la solicitud.
 *
 * La lógica vive en ./ordenGestores (compartida con la callable de reenvío):
 *  - completa los 6 datos requeridos (nombre, cédula, cargo, unidad, empresa, sede),
 *  - manda el correo a los gestores,
 *  - le confirma al analista por la campana (acuse), y
 *  - si el correo falla, le avisa al analista (campana + correo) para que reintente
 *    — antes el fallo era totalmente silencioso.
 *
 * Idempotente: ordenGestores no reenvía si el doc ya tiene correo_gestor_enviado_en.
 */
export const onExamenMedicoCreate = onDocumentCreated(
  {
    document: 'examenes_medicos/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    try {
      const r = await enviarOrdenAGestores(snap.id, { forzar: false });
      logger.info('onExamenMedicoCreate · resultado', { examen_id: snap.id, estado: r.estado });

      // Si no había credenciales de correo, el correo no salió: dejamos rastro en
      // el doc para que la UI lo muestre y GH pueda reintentar manualmente.
      if (r.estado === 'sin_secrets') {
        await snap.ref.update({
          correo_gestor_error: 'Correo no configurado (faltan credenciales).',
          correo_gestor_error_en: FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      logger.error('onExamenMedicoCreate · error inesperado', {
        examen_id: snap.id,
        msg: e instanceof Error ? e.message : String(e),
      });
      try {
        await snap.ref.update({
          correo_gestor_error: e instanceof Error ? e.message.slice(0, 500) : String(e),
          correo_gestor_error_en: FieldValue.serverTimestamp(),
        });
      } catch {
        /* si ni el update pasa, ya quedó el log */
      }
    }
  },
);
