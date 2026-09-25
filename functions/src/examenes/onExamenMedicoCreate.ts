import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
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

    // Filtro de discapacidad (reu Karen jul-2026): si el candidato es persona en
    // condición de discapacidad, la orden NO sale sola a los gestores. GH la revisa
    // y la autoriza (callable autorizarGestoresDiscapacidad). Aquí solo avisamos a
    // GH que hay una orden pendiente de su visto bueno y NO enviamos el correo.
    const d = snap.data() as Record<string, unknown>;
    if (d.requiere_autorizacion_gh && !d.autorizado_gestores_en) {
      try {
        await avisarGHAutorizacionPendiente(snap.id, d);
      } catch (e) {
        logger.error('onExamenMedicoCreate · no se pudo avisar a GH', {
          examen_id: snap.id,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
      logger.info('onExamenMedicoCreate · pendiente de autorización de GH (discapacidad)', {
        examen_id: snap.id,
      });
      return;
    }

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

/**
 * Avisa a GH (rol gh + coordinador, activos) que una orden de exámenes de una
 * persona en condición de discapacidad quedó pendiente de su autorización antes
 * de enviarla a los gestores SST. Campana + correo (onNotificacionCreate lo manda).
 * NUNCA detalla la condición médica en la notificación (anti-revelación).
 */
async function avisarGHAutorizacionPendiente(
  examenId: string,
  ex: Record<string, unknown>,
): Promise<void> {
  const nombre = String(ex.candidato_nombre ?? 'el integrante').trim() || 'el integrante';
  const cargo = String(ex.cargo_nombre ?? '').trim();
  const gh = await db
    .collection('usuarios')
    .where('rol', 'in', ['gh', 'coordinador'])
    .where('activo', '==', true)
    .get();
  if (gh.empty) {
    logger.warn('onExamenMedicoCreate · sin usuarios GH/coordinador activos para autorizar', {
      examen_id: examenId,
    });
    return;
  }
  await Promise.all(
    gh.docs.map((u) =>
      db.collection('notificaciones').add({
        destinatario_uid: u.id,
        tipo: 'exam_solicitado',
        titulo: 'Orden de exámenes pendiente de tu autorización',
        mensaje: `La orden de exámenes de ${nombre}${
          cargo ? ` (${cargo})` : ''
        } requiere tu autorización antes de enviarse a los gestores SST (persona en condición de discapacidad). Revísala y autoriza el envío en Exámenes médicos.`,
        link: `/examenes-medicos?examen=${encodeURIComponent(examenId)}`,
        leida: false,
        leida_en: null,
        creado_en: FieldValue.serverTimestamp(),
        creado_por: 'system',
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: 'system',
      }),
    ),
  );
}
