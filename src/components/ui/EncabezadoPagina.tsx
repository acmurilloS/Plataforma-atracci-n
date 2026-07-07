import { type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/**
 * EncabezadoPagina · encabezado estándar de página con ÍCONO en cuadro de color
 * (reu 03-jul, estilo referencia): [ícono] eyebrow + título grande + descripción,
 * con una acción opcional a la derecha. Unifica el header de todas las páginas.
 */

type Tono = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONO: Record<Tono, { bg: string; fg: string }> = {
  brand: { bg: 'bg-brand-50', fg: 'text-brand-700' },
  success: { bg: 'bg-success-50', fg: 'text-success-700' },
  warning: { bg: 'bg-warning-50', fg: 'text-warning-700' },
  danger: { bg: 'bg-danger-50', fg: 'text-danger-700' },
  info: { bg: 'bg-info-50', fg: 'text-info-700' },
  neutral: { bg: 'bg-slate-100', fg: 'text-text-muted' },
};

export function EncabezadoPagina({
  icono,
  tono = 'brand',
  eyebrow,
  titulo,
  descripcion,
  accion,
}: {
  icono: ReactNode;
  tono?: Tono;
  eyebrow?: string;
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
}) {
  const t = TONO[tono];
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-4 min-w-0">
        <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center shrink-0', t.bg, t.fg)}>
          {icono}
        </div>
        <div className="min-w-0">
          {eyebrow && (
            <p className={cn('text-[11px] font-bold uppercase tracking-[0.10em]', t.fg)}>{eyebrow}</p>
          )}
          <h1
            className="mt-1 text-[36px] font-light leading-[1.05] tracking-[-0.03em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            {titulo}
          </h1>
          {descripcion && (
            <p className="mt-2 text-[14px] text-text-muted leading-[1.55] max-w-2xl">{descripcion}</p>
          )}
        </div>
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}
