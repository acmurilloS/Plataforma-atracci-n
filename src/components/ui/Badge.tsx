import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeVariant =
  | 'fase-a'
  | 'fase-b'
  | 'fase-c'
  | 'fase-d'
  | 'fase-e'
  | 'fase-f'
  | 'criticidad-alta'
  | 'criticidad-media'
  | 'criticidad-baja'
  | 'util-ok'
  | 'util-warn'
  | 'util-crit'
  | 'neutral';

export type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  uppercase?: boolean;
  className?: string;
  children: ReactNode;
}

// Paleta monocromática rojo→negro para fases del flujograma.
// Los gold-* son aliases legacy que apuntan a la escala rojo Equitel.
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  'fase-a': 'bg-gold-50 text-gold-700 border border-gold-100',
  'fase-b': 'bg-gold-100 text-gold-700 border border-gold-200',
  'fase-c': 'bg-gold-200 text-gold-800 border border-gold-300',
  'fase-d': 'bg-gold-400 text-white border border-gold-500',
  'fase-e': 'bg-gold-600 text-white border border-gold-700',
  'fase-f': 'bg-navy-900 text-white border border-navy-800',
  'criticidad-alta': 'bg-equitel-rojo-600 text-white',
  'criticidad-media': 'bg-navy-400 text-white',
  'criticidad-baja': 'bg-navy-100 text-navy-700',
  'util-ok': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'util-warn': 'bg-amber-50 text-amber-700 border border-amber-200',
  'util-crit': 'bg-red-50 text-red-700 border border-red-200',
  neutral: 'bg-navy-50 text-navy-700 border border-navy-100',
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({
  variant = 'neutral',
  size = 'sm',
  uppercase = true,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold tracking-wide',
        uppercase && 'uppercase',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
