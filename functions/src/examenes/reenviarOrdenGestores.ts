import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { enviarOrdenAGestores } from './ordenGestores';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * reenviarOrdenGestores · botón "Reenviar a gestores" de Exámenes médicos.
 *
 * Permite a GH / analista / coordinador reenviar manualmente el correo de la
 * orden de exámenes a los gestores SST: sirve cuando el envío automático falló,
 * o cuando faltaba un dato (típicamente la cédula) y ya se completó. Reusa la
 * misma lógica del trigger (ordenGestores) con forzar=true para reenviar aunque
 * ya se hubiera marcado como enviado.
 */
export const reenviarOrdenGestores = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const examenId = String(req.data?.examen_id ?? '').trim();
    if (!examenId) {
      throw new HttpsError('invalid-argument', 'Falta examen_id.');
    }

    const r = await enviarOrdenAGestores(examenId, { forzar: true });

    if (r.estado === 'no_existe') {
      throw new HttpsError('not-found', 'La solicitud de exámenes no existe.');
    }
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
