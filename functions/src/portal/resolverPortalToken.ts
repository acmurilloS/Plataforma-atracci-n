import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * resolverPortalToken · resuelve el token público del portal del candidato a los
 * datos que la página `/portal/{token}` necesita mostrar + el estado de los
 * consentimientos.
 *
 * Callable pública (sin login real): el candidato no tiene cuenta. Si el token
 * no existe o está malformado, devuelve `encontrado: false` sin exponer detalles.
 */
export const resolverPortalToken = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  if (!token) {
    throw new HttpsError('invalid-argument', 'Falta token.');
  }
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) {
    return { encontrado: false as const };
  }

  const snap = await db.collection('portal_candidato_tokens').doc(token).get();
  if (!snap.exists) {
    logger.info('[portal] token no encontrado', { token });
    return { encontrado: false as const };
  }
  const t = snap.data() as Record<string, unknown>;

  // El estado de los consentimientos vive en la postulación (mutable).
  let datosAceptado = false;
  let imagenAceptado = false;
  try {
    if (t.postulacion_id) {
      const p = await db.collection('postulaciones').doc(String(t.postulacion_id)).get();
      if (p.exists) {
        const pd = p.data() ?? {};
        datosAceptado = !!pd.consentimiento_datos_aceptado_en;
        imagenAceptado = !!pd.consentimiento_imagen_aceptado_en;
      }
    }
  } catch (e) {
    logger.warn('[portal] no se pudo leer la postulación', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    encontrado: true as const,
    candidato_nombre: String(t.candidato_nombre ?? ''),
    documento_numero: String(t.documento_numero ?? ''),
    cargo_nombre: String(t.cargo_nombre ?? ''),
    empresa_codigo: String(t.empresa_codigo ?? 'EQT'),
    consentimiento_datos_aceptado: datosAceptado,
    consentimiento_imagen_aceptado: imagenAceptado,
  };
});
