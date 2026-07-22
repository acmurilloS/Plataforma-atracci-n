import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarOrdenAGestores } from './ordenGestores';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * autorizarGestoresDiscapacidad · botón "Autorizar y enviar a gestores" en
 * Exámenes médicos, solo para GH/coordinación.
 *
 * Cuando el candidato es persona en condición de discapacidad, la orden NO sale
 * sola a los gestores al aprobar el líder (onExamenMedicoCreate la omite). GH la
 * revisa y, con esta callable, la autoriza: deja trazabilidad de quién/cuándo y
 * dispara el correo a los gestores SST (reusando ordenGestores con forzar=true).
 *
 * Idempotente en la práctica: si ya se autorizó, vuelve a permitir el envío (el
 * mismo comportamiento que "Reenviar a gestores").
 */
export const autorizarGestoresDiscapacidad = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['gh', 'coordinador', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Solo Gestión Humana puede autorizar el envío.');
    }

    const examenId = String(req.data?.examen_id ?? '').trim();
    if (!examenId) {
      throw new HttpsError('invalid-argument', 'Falta examen_id.');
    }

    const ref = db.collection('examenes_medicos').doc(examenId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'La solicitud de exámenes no existe.');
    }

    await ref.update({
      autorizado_gestores_en: FieldValue.serverTimestamp(),
      autorizado_gestores_por: req.auth.uid,
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: req.auth.uid,
    });

    const r = await enviarOrdenAGestores(examenId, { forzar: true });

    if (r.estado === 'sin_secrets') {
      throw new HttpsError(
        'failed-precondition',
        'El correo no está configurado (faltan credenciales). Avísale a soporte.',
      );
    }
    if (r.estado === 'error') {
      throw new HttpsError(
        'internal',
        r.error || 'No se pudo enviar el correo a los gestores. Reintenta en un momento.',
      );
    }

    return {
      ok: true as const,
      faltantes: r.faltantes,
      destinatarios: r.destinatarios.length,
    };
  },
);
