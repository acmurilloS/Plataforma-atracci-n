import { type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/**
 * Sistema brand · Pill (microlabel / status).
 *
 * 5 tonos semánticos + neutral. Opcionalmente con dot 1.5×1.5 a la izquierda.
 * Uppercase tracking-wide, font-bold, text-[11px] — la firma del estilo.
 */

export type PillTono = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface PillProps {
  children: ReactNode;
  tono?: PillTono;
  dot?: boolean;
  className?: string;
}

const TONO: Record<PillTono, { caja: string; dot: string }> = {
  brand: { caja: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500' },
  success: { caja: 'bg-success-50 text-success-700', dot: 'bg-success-500' },
  warning: { caja: 'bg-warning-50 text-warning-700', dot: 'bg-warning-500' },
  danger: { caja: 'bg-danger-50 text-danger-700', dot: 'bg-danger-500' },
  info: { caja: 'bg-info-50 text-info-700', dot: 'bg-info-500' },
  neutral: { caja: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
};

export function Pill({ children, tono = 'neutral', dot = false, className }: PillProps) {
  const t = TONO[tono];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
        'text-[11px] font-bold uppercase tracking-[0.06em]',
        t.caja,
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}
