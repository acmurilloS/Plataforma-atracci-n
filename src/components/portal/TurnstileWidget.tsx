import { useEffect, useRef } from 'react';

/**
 * TurnstileWidget · renderiza el CAPTCHA de Cloudflare Turnstile y entrega el
 * token al padre (que lo manda al backend para validarlo server-side). Carga el
 * script oficial una sola vez. `resetTrigger` permite pedir un token fresco tras
 * un intento (los tokens son de un solo uso).
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromesa: Promise<void> | null = null;
function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromesa) return scriptPromesa;
  scriptPromesa = new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolver();
    s.onerror = () => rechazar(new Error('No se pudo cargar Turnstile'));
    document.head.appendChild(s);
  });
  return scriptPromesa;
}

export function TurnstileWidget({
  siteKey,
  onToken,
  resetTrigger = 0,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  resetTrigger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    cargarScript()
      .then(() => {
        if (cancelado || !ref.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (tk: string) => onToken(tk),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelado = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* noop */
        }
        widgetId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  useEffect(() => {
    if (resetTrigger > 0 && widgetId.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetId.current);
      } catch {
        /* noop */
      }
      onToken(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]);

  return <div ref={ref} className="min-h-[65px]" />;
}
