/**
 * urlPortalDocValida · valida que `url` sea una URL de descarga de Firebase
 * Storage que apunta EXACTAMENTE a un objeto bajo `portal_docs/{token}/` — el
 * único path donde el candidato anónimo puede escribir.
 *
 * Endurecimiento (vs el viejo `url.includes(...)`): ancla el segmento del objeto
 * (la parte después de `/o/`), lo decodifica y exige el prefijo del token. Así no
 * se puede colar el prefijo en el query string ni apuntar a otro objeto.
 *
 * Acepta el host del emulador de Storage cuando se corre en local
 * (`FUNCTIONS_EMULATOR=true`), donde las URLs salen como `http://127.0.0.1:9199/…`
 * en vez de `https://firebasestorage.googleapis.com/…`.
 */
export function urlPortalDocValida(url: string, token: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }

  const emulador = process.env.FUNCTIONS_EMULATOR === 'true';
  const hostProd = u.hostname === 'firebasestorage.googleapis.com';
  const hostEmu = emulador && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (!hostProd && !hostEmu) return false;
  if (!emulador && u.protocol !== 'https:') return false;

  // Path típico: /v0/b/<bucket>/o/<objeto-url-encoded>
  const m = u.pathname.match(/\/o\/([^/?]+)$/);
  if (!m) return false;
  let objeto: string;
  try {
    objeto = decodeURIComponent(m[1]);
  } catch {
    return false;
  }
  return objeto.startsWith(`portal_docs/${token}/`);
}
