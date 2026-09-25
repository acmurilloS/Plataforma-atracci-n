import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { revisarCarpetaCore } from './revisarCarpetaCore';

/**
 * revisarCarpeta · botón "Revisar datos" de /carpetas (reu Karen 16-sep, C).
 * Cruza cédula, nombre, correo, celular y cargo entre candidato, postulación,
 * vacante y DGH-F-05 y deja las alertas en `carpetas_digitales.revision_datos`.
 * Mismos roles que aprobarCarpeta. También corre sola cuando la carpeta queda
 * lista para validar (notificarCarpetaListaValidarCore).
 */
const ROLES_AUTORIZADOS = ['analista', 'coordinador', 'gh', 'documentacion', 'admin'];

export const revisarCarpeta = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = String(req.auth.token.rol ?? '');
  if (!ROLES_AUTORIZADOS.includes(rol)) {
    throw new HttpsError('permission-denied', 'Rol no autorizado para revisar carpetas.');
  }
  const carpetaId = String(req.data?.carpeta_id ?? '').trim();
  if (!carpetaId) throw new HttpsError('invalid-argument', 'Falta carpeta_id.');
  try {
    return await revisarCarpetaCore(carpetaId, req.auth.uid);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no existe/.test(msg)) throw new HttpsError('not-found', msg);
    throw new HttpsError('internal', `No se pudo revisar la carpeta: ${msg}`);
  }
});
