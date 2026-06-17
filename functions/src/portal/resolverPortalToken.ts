import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * resolverPortalToken · resuelve el token público del portal del candidato a los
 * datos que la página `/portal/{token}` necesita mostrar: datos del proceso,
 * estado de los consentimientos, estado del proceso y documentos ya subidos.
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
  const postulacionId = String(t.postulacion_id ?? '');

  // Estado de consentimientos + estado del proceso viven en la postulación.
  let datosAceptado = false;
  let imagenAceptado = false;
  let estado = '';
  let condiciones: Record<string, string> | null = null;
  let condicionesAceptadas = false;
  try {
    if (postulacionId) {
      const p = await db.collection('postulaciones').doc(postulacionId).get();
      if (p.exists) {
        const pd = p.data() ?? {};
        datosAceptado = !!pd.consentimiento_datos_aceptado_en;
        imagenAceptado = !!pd.consentimiento_imagen_aceptado_en;
        estado = String(pd.estado ?? '');
        if (pd.condiciones_enviadas_en && pd.condiciones_laborales) {
          condiciones = pd.condiciones_laborales as Record<string, string>;
          condicionesAceptadas = !!pd.condiciones_aceptadas_en;
        }
      }
    }
  } catch (e) {
    logger.warn('[portal] no se pudo leer la postulación', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  // Documentos que el candidato ya subió por el portal.
  let documentos: { nombre: string; url: string }[] = [];
  try {
    if (postulacionId) {
      const ds = await db
        .collection('documentos_portal')
        .where('postulacion_id', '==', postulacionId)
        .get();
      documentos = ds.docs
        .map((d) => d.data() as Record<string, unknown>)
        .map((d) => ({ nombre: String(d.nombre_archivo ?? ''), url: String(d.url ?? '') }))
        .filter((d) => d.url);
    }
  } catch (e) {
    logger.warn('[portal] no se pudieron leer documentos', {
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
    estado,
    consentimiento_datos_aceptado: datosAceptado,
    consentimiento_imagen_aceptado: imagenAceptado,
    condiciones,
    condiciones_aceptadas: condicionesAceptadas,
    documentos,
  };
});
