import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Garantiza una sesión (anónima) válida ANTES de subir a Storage desde el
 * portal o la landing. Las reglas exigen `request.auth != null`: si la sesión
 * no arrancó (red al abrir la página) o su token ya no se puede refrescar, la
 * subida fallaría con un "permission denied" incomprensible para el candidato.
 *
 * - Hay usuario y su token se refresca → listo.
 * - Hay usuario pero el refresco falla (cuenta borrada/vencida) → nueva sesión.
 * - No hay usuario → nueva sesión anónima.
 */
export async function asegurarSesionAnonima(): Promise<string> {
  const actual = auth.currentUser;
  if (actual) {
    try {
      await actual.getIdToken();
      return actual.uid;
    } catch {
      await signOut(auth).catch(() => undefined);
    }
  }
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}
