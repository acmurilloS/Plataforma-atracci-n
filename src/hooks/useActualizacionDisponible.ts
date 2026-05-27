import { useEffect, useRef, useState } from 'react';

/**
 * useActualizacionDisponible · detecta si hay un build nuevo en prod.
 *
 * Cómo funciona:
 *  - Al montar guarda los `src` de los <script> que cargaron la SPA actual
 *    (Vite genera hashes únicos por build, ej. `/assets/index-Bn5DXEhr.js`).
 *  - Cada `intervaloMs` hace fetch a `/index.html` (con cache:'no-store').
 *  - Si el set de scripts del index.html del servidor difiere del que cargó
 *    la sesión actual, hay un deploy nuevo → retorna `disponible = true`.
 *  - El usuario hace click "Recargar" → `window.location.reload()`.
 *
 * No requiere generar archivos extra (version.json) — usa el index.html que
 * Firebase Hosting sirve con Cache-Control: no-cache,no-store, así el fetch
 * siempre trae la versión más reciente.
 *
 * En dev (Vite HMR) la verificación se queda silenciada — los hot-reloads
 * ya manejan los updates en vivo.
 */
export function useActualizacionDisponible(intervaloMs = 60_000): {
  disponible: boolean;
  recargar: () => void;
} {
  const [disponible, setDisponible] = useState(false);
  const scriptsIniciales = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (import.meta.env.DEV) return;

    scriptsIniciales.current = extraerScriptsDelDocumento();
    if (scriptsIniciales.current.size === 0) return;

    let cancelado = false;

    async function check() {
      try {
        const resp = await fetch('/index.html', {
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' },
        });
        if (!resp.ok || cancelado) return;
        const html = await resp.text();
        const scriptsServidor = extraerScriptsDelHtml(html);
        if (scriptsServidor.size === 0) return;
        const cambio = !setIguales(scriptsIniciales.current, scriptsServidor);
        if (cambio && !cancelado) {
          setDisponible(true);
        }
      } catch {
        // Silencio: errores de red transitorios no deben molestar al user.
      }
    }

    check();
    const id = window.setInterval(check, intervaloMs);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [intervaloMs]);

  function recargar() {
    window.location.reload();
  }

  return { disponible, recargar };
}

function extraerScriptsDelDocumento(): Set<string> {
  const set = new Set<string>();
  document.querySelectorAll('script[src]').forEach((s) => {
    const src = (s as HTMLScriptElement).src;
    if (src.includes('/assets/')) set.add(rutaRelativa(src));
  });
  return set;
}

function extraerScriptsDelHtml(html: string): Set<string> {
  const set = new Set<string>();
  const regex = /<script[^>]+src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    if (m[1].includes('/assets/')) set.add(rutaRelativa(m[1]));
  }
  return set;
}

/** Normaliza URLs absolutas a su pathname para comparar src cross-origin. */
function rutaRelativa(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function setIguales(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
