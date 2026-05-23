import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface PageHeaderProps {
  eyebrow?: string;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  className?: string;
  invertido?: boolean;
  /**
   * `editorial` (default): dramatic letter spacing y gran tipografía Apple-like.
   * `compact`: menor jerarquía para sub-secciones.
   */
  escala?: 'editorial' | 'compact';
}

/**
 * Editorial Precision · PageHeader.
 * Apila un eyebrow tertiary (rojo) sobre un display headline dramático y body legible.
 * Respeta negative space agresivo: pb-2 para dejar respirar el resto del layout.
 */
export function PageHeader({
  eyebrow,
  titulo,
  descripcion,
  accion,
  className,
  invertido = false,
  escala = 'editorial',
}: PageHeaderProps) {
  const tituloSize =
    escala === 'editorial'
      ? 'text-4xl md:text-5xl lg:text-[56px] font-bold tracking-[-0.02em] leading-[1.05]'
      : 'text-2xl md:text-3xl font-bold tracking-[-0.015em] leading-[1.1]';

  return (
    <div
      className={cn(
        'flex items-end justify-between gap-6 flex-wrap',
        escala === 'editorial' ? 'pb-2' : 'pb-1',
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p
            className={cn(
              'text-[11px] uppercase tracking-[0.22em] font-bold mb-4',
              invertido ? 'text-white/70' : 'text-equitel-rojo-700',
            )}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className={cn(
            'font-display',
            tituloSize,
            invertido ? 'text-white' : 'text-navy-900',
          )}
        >
          {titulo}
        </h1>
        {descripcion && (
          <p
            className={cn(
              'mt-4 text-base leading-relaxed max-w-2xl',
              invertido ? 'text-white/80' : 'text-navy-500',
            )}
          >
            {descripcion}
          </p>
        )}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}
