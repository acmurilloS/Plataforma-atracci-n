import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  titulo: string;
  descripcion?: string;
  icono?: ReactNode;
  accion?: ReactNode;
  variant?: 'surface' | 'plain';
  className?: string;
}

/**
 * Editorial Precision · EmptyState.
 * Sin bordes dashed. Usa surface-low con ghost-border sutil + negative space amplio.
 */
export function EmptyState({
  titulo,
  descripcion,
  icono,
  accion,
  variant = 'surface',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-14 text-center flex flex-col items-center',
        variant === 'surface' ? 'bg-surface-low ghost-border' : 'bg-white',
        className,
      )}
    >
      {icono && (
        <div className="mb-4 h-14 w-14 rounded-full bg-white text-navy-400 flex items-center justify-center shadow-ambient">
          {icono}
        </div>
      )}
      <p className="font-display text-xl font-bold text-navy-900">{titulo}</p>
      {descripcion && (
        <p className="text-sm text-navy-500 mt-2 max-w-md leading-relaxed">{descripcion}</p>
      )}
      {accion && <div className="mt-6">{accion}</div>}
    </div>
  );
}
