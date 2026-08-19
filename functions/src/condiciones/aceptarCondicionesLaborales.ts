import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from '../portal/tokenVigente';
import { verificarCedula } from '../portal/verificarCedula';

/**
 * aceptarCondicionesLaborales · E (lote GH 16-jun).
 *
 * El candidato acepta, desde su portal público, las condiciones laborales que le
 * envió el analista. Guarda la aceptación (fecha + evidencia) en la postulación.
 */
export const aceptarCondicionesLaborales = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');

  const ref = db.collection('portal_candidato_tokens').doc(token);
  const tSnap = await ref.get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
  if (!tokenVigente(t)) {
    throw new HttpsError(
      'failed-precondition',
      'El enlace expiró o fue revocado. Pídele al equipo de Atracción que te reenvíe tu portal.',
    );
  }
  // 2º factor: la cédula, para que aceptar las condiciones no se pueda forjar con
  // solo el token (revisión 16-jul).
  const ced = await verificarCedula(ref, String(req.data?.cedula ?? '').trim());
  if (!ced.ok) {
    throw new HttpsError('permission-denied', 'Cédula incorrecta o bloqueada. Verifica e intenta de nuevo.');
  }
  const postId = String(t.postulacion_id ?? '');
  if (!postId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  const postRef = db.collection('postulaciones').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
  const pd = postSnap.data() as Record<string, unknown>;
  if (!pd.condiciones_enviadas_en) {
    throw new HttpsError('failed-precondition', 'Aún no te han enviado las condiciones.');
  }
  if (pd.condiciones_aceptadas_en) {
    return { ok: true as const, yaAceptado: true }; // idempotente: no pisa la aceptación
  }

  const raw = req.rawRequest as unknown as {
    ip?: string;
    headers?: Record<string, string | undefined>;
  };
  const ip = String(raw?.ip ?? '').slice(0, 64);
  const ua = String(raw?.headers?.['user-agent'] ?? '').slice(0, 256);

  await postRef.update({
    condiciones_aceptadas_en: FieldValue.serverTimestamp(),
    condiciones_aceptadas_evidencia: { ip, user_agent: ua, via: 'portal_candidato' },
  });
  await db.collection('eventos').add({
    tipo: 'condiciones_laborales_aceptadas',
    postulacion_id: postId,
    evidencia_ip: ip,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  // Avisar al analista (campana + correo) que el candidato aceptó. Antes no
  // llegaba nada y el equipo no tenía cómo verificar la aceptación (reu Karen
  // 28-jul); la notificación queda como evidencia y linkea al proceso.
  try {
    const vacId = String(pd.vacante_id ?? '');
    let analistaUid = '';
    if (vacId) {
      const v = await db.collection('vacantes').doc(vacId).get();
      if (v.exists) analistaUid = String(v.data()?.analista_uid ?? '');
    }
    if (analistaUid) {
      const nombre = String(pd.candidato_nombre ?? 'El candidato');
      const cargo = String(pd.cargo_nombre ?? '');
      // Desglose de las condiciones que se le enviaron: evidencia que pide GH (reu
      // 18-ago: la notificación llegaba sin decir QUÉ condiciones aceptó). Texto
      // plano con \n (onNotificacionCreate lo pasa a <br> y escapa el HTML).
      const cl = (pd.condiciones_laborales ?? {}) as Record<string, unknown>;
      const linea = (etiqueta: string, valor: unknown) => {
        const v = String(valor ?? '').trim();
        return v ? `• ${etiqueta}: ${v}` : '';
      };
      const desglose = [
        linea('Cargo', cl.cargo ?? cargo),
        linea('Empresa', cl.empresa),
        linea('Unidad', cl.unidad),
        linea('Tipo de contrato', cl.tipo_contrato),
        linea('Tiempo de contrato', cl.tiempo_contrato),
        linea('Salario', cl.salario ?? cl.salario_base),
        linea('Comisiones', cl.comisiones),
        linea('Rodamiento', cl.rodamiento),
        linea('Horario', cl.horario ?? cl.horario_laboral),
      ]
        .filter(Boolean)
        .join('\n');
      await db.collection('notificaciones').add({
        destinatario_uid: analistaUid,
        tipo: 'condiciones_aceptadas',
        titulo: 'El candidato aceptó las condiciones laborales',
        mensaje: `${nombre}${cargo ? ` (${cargo})` : ''} aceptó las condiciones laborales desde su portal.${
          desglose ? `\n\nCondiciones enviadas y aceptadas:\n${desglose}` : ''
        }\n\nQueda como evidencia en su proceso; puedes adjuntarla en "Aceptación de condiciones" de la carpeta.`,
        link: `/postulaciones/${postId}`,
        vacante_id: vacId,
        postulacion_id: postId,
        leida: false,
        leida_en: null,
        creado_en: FieldValue.serverTimestamp(),
        creado_por: 'system',
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: 'system',
      });
    }
  } catch (e) {
    logger.warn('[condiciones] no se pudo notificar al analista', { postId, e: String(e) });
  }

  logger.info('[condiciones] aceptadas en portal', { postId });
  return { ok: true as const };
});
