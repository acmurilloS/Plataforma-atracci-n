import { Fragment, type ReactNode } from 'react';

/**
 * Textos configurables (Mensajes y reglas: aviso al candidato, reloj del líder)
 * con un marcado mínimo, para que se vean como los diseños de Karen (20-oct):
 *  - párrafos separados por una línea en blanco; un salto simple = salto de línea;
 *  - `**así**` = negrita.
 * El correo hace lo mismo en el servidor (onNotificacionCreate, avisoCompromiso).
 * Nunca se interpreta HTML: todo lo demás se muestra como texto.
 */

const NEGRITA = /\*\*([^*\n]+)\*\*/g;

function enLinea(linea: string): ReactNode[] {
  const out: ReactNode[] = [];
  let ultimo = 0;
  for (const m of linea.matchAll(NEGRITA)) {
    const i = m.index ?? 0;
    if (i > ultimo) out.push(linea.slice(ultimo, i));
    out.push(
      <strong key={i} className="font-semibold text-text-strong">
        {m[1]}
      </strong>,
    );
    ultimo = i + m[0].length;
  }
  if (ultimo < linea.length) out.push(linea.slice(ultimo));
  return out;
}

export function TextoMarcado({ texto, className }: { texto: string; className?: string }) {
  const parrafos = texto
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim());
  return (
    <div className={className}>
      {parrafos.map((p, i) => (
        <p key={i} className={i > 0 ? 'mt-3' : undefined}>
          {p.split('\n').map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {enLinea(l)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

/** Mismo texto sin las marcas (para vistas de una línea, como la campana). */
export function sinMarcas(texto: string): string {
  return texto.replace(NEGRITA, '$1');
}
