import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type StatVariant =
  | 'neutral'
  | 'destacado'
  | 'fase-a'
  | 'fase-b'
  | 'fase-c'
  | 'fase-d'
  | 'fase-e'
  | 'fase-f';

interface StatProps {
  label: string;
  valor: number | string;
  variant?: StatVariant;
  icono?: ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<StatVariant, string> = {
  neutral: 'bg-white text-navy-800 shadow-ambient',
  destacado:
    'bg-gradient-to-br from-equitel-rojo-500 to-equitel-rojo-700 text-white shadow-ambient-lg',
  'fase-a': 'bg-gold-50 text-gold-800 shadow-ambient',
  'fase-b': 'bg-gold-100 text-gold-800 shadow-ambient',
  'fase-c': 'bg-gold-200 text-gold-900 shadow-ambient',
  'fase-d': 'bg-gold-400 text-white shadow-ambient',
  'fase-e': 'bg-gold-600 text-white shadow-ambient',
  'fase-f': 'bg-navy-900 text-white shadow-ambient',
};

export function Stat({ label, valor, variant = 'neutral', icono, className }: StatProps) {
  return (
    <div
      className={cn(
        'rounded-2xl px-4 py-4 text-center transition-transform hover:-translate-y-0.5',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {icono && <div className="flex justify-center mb-1.5 opacity-80">{icono}</div>}
      <p className="text-3xl md:text-4xl font-bold font-display leading-none tracking-tight">
        {valor}
      </p>
      <p className="text-[10px] md:text-xs font-semibold mt-2 uppercase tracking-[0.12em]">
        {label}
      </p>
    </div>
  );
}
