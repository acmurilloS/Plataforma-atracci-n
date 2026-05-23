import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface PulseCardProps {
  titulo: string;
  subtitulo?: string;
  tag?: string;
  /** Contenido del fondo: puede ser un gradient, imagen o patrón. */
  fondo?: ReactNode;
  accion?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Alto mínimo del "canvas" superior. Default `aspect-[16/10]`. */
  aspecto?: 'video' | 'wide' | 'square';
}

const ASPECTO: Record<NonNullable<PulseCardProps['aspecto']>, string> = {
  video: 'aspect-video',
  wide: 'aspect-[16/10]',
  square: 'aspect-square',
};

/**
 * Editorial Precision · PulseCard.
 * Featured card con full-bleed background y overlay glassmorphic al pie.
 * Uso: destacar una vacante prioritaria, un anuncio, una métrica crítica.
 */
export function PulseCard({
  titulo,
  subtitulo,
  tag,
  fondo,
  accion,
  onClick,
  className,
  aspecto = 'wide',
}: PulseCardProps) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl shadow-ambient transition-all group',
        clickable && 'cursor-pointer hover:shadow-ambient-lg hover:-translate-y-0.5',
        className,
      )}
    >
      <div className={cn('relative w-full', ASPECTO[aspecto])}>
        {fondo ?? (
          <div className="absolute inset-0 bg-gradient-to-br from-equitel-rojo-600 via-equitel-rojo-700 to-navy-900" />
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 glass-strong">
        {tag && (
          <span className="inline-block rounded-full bg-equitel-rojo-600 text-white px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-3">
            {tag}
          </span>
        )}
        <h3 className="font-display text-2xl md:text-3xl font-bold text-navy-900 leading-tight">
          {titulo}
        </h3>
        {subtitulo && (
          <p className="mt-1.5 text-sm text-navy-600 leading-relaxed max-w-lg">{subtitulo}</p>
        )}
        {accion && <div className="mt-4">{accion}</div>}
      </div>
    </div>
  );
}
