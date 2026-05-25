import { type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/**
 * Sistema brand · KpiCard (patrón premium).
 *
 * Estructura fija:
 *   eyebrow (dot color + label uppercase) ─ icono en cuadrito tinto
 *   hero number hairline (font-extralight, tracking negativo)
 *   caption opcional
 *   barra de progreso opcional X de Y
 */

export type KpiTono = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface KpiCardProps {
  eyebrow: string;
  valor: ReactNode;
  caption?: string;
  icono?: ReactNode;
  tono?: KpiTono;
  progreso?: {
    valor: number;
    total: number;
  };
  className?: string;
}

const TONO: Record<KpiTono, { dot: string; eyebrow: string; iconoBg: string; iconoText: string; valor: string; bar: string }> = {
  brand: {
    dot: 'bg-brand-500',
    eyebrow: 'text-brand-700',
    iconoBg: 'bg-brand-50',
    iconoText: 'text-brand-700',
    valor: 'text-brand-700',
    bar: 'bg-brand-500',
  },
  success: {
    dot: 'bg-success-500',
    eyebrow: 'text-success-700',
    iconoBg: 'bg-success-50',
    iconoText: 'text-success-700',
    valor: 'text-success-700',
    bar: 'bg-success-500',
  },
  warning: {
    dot: 'bg-warning-500',
    eyebrow: 'text-warning-700',
    iconoBg: 'bg-warning-50',
    iconoText: 'text-warning-700',
    valor: 'text-warning-700',
    bar: 'bg-warning-500',
  },
  danger: {
    dot: 'bg-danger-500',
    eyebrow: 'text-danger-700',
    iconoBg: 'bg-danger-50',
    iconoText: 'text-danger-700',
    valor: 'text-danger-700',
    bar: 'bg-danger-500',
  },
  info: {
    dot: 'bg-info-500',
    eyebrow: 'text-info-700',
    iconoBg: 'bg-info-50',
    iconoText: 'text-info-700',
    valor: 'text-info-700',
    bar: 'bg-info-500',
  },
  neutral: {
    dot: 'bg-slate-400',
    eyebrow: 'text-slate-600',
    iconoBg: 'bg-slate-100',
    iconoText: 'text-slate-700',
    valor: 'text-text-strong',
    bar: 'bg-slate-400',
  },
};

export function KpiCard({
  eyebrow,
  valor,
  caption,
  icono,
  tono = 'neutral',
  progreso,
  className,
}: KpiCardProps) {
  const t = TONO[tono];
  const porcentaje = progreso ? Math.min(100, Math.round((progreso.valor / Math.max(1, progreso.total)) * 100)) : null;

  return (
    <div
      className={cn(
        'bg-white rounded-md border border-slate-200 p-6 shadow-brand-card',
        'transition-shadow duration-200 ease-out hover:shadow-brand-card-hover',
        className,
      )}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />
          <p className={cn('text-[10px] font-bold tracking-[0.10em] uppercase', t.eyebrow)}>
            {eyebrow}
          </p>
        </div>
        {icono && (
          <div
            className={cn(
              'w-10 h-10 rounded-md flex items-center justify-center',
              t.iconoBg,
              t.iconoText,
            )}
          >
            {icono}
          </div>
        )}
      </div>

      <span
        className={cn(
          'text-[64px] font-extralight leading-[0.9] tracking-[-0.05em] tabular-nums',
          t.valor,
        )}
      >
        {valor}
      </span>

      {caption && (
        <p className="text-[12px] text-text-subtle font-medium mt-1">{caption}</p>
      )}

      {progreso && porcentaje !== null && (
        <div className="pt-4 mt-5 border-t border-slate-100">
          <div className="flex justify-between mb-2 text-[12px]">
            <span className="text-text-body tabular-nums">
              {progreso.valor} <span className="text-text-subtle">de {progreso.total}</span>
            </span>
            <span className={cn('font-bold', t.eyebrow)}>{porcentaje}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={cn('h-full', t.bar)} style={{ width: `${porcentaje}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
