import { cn } from '../utils/cn';

interface Props {
  /** Reservado para compatibilidad. Hoy el logo es siempre a color sobre card blanca. */
  variant?: 'color' | 'blanco';
  /** Altura en píxeles; el ancho ajusta manteniendo proporción. */
  size?: number;
  /** Reservado para compatibilidad; se ignora. */
  soloSimbolo?: boolean;
  className?: string;
}

/**
 * Logo Equitel oficial, servido desde `public/equitel.png`.
 * Para fondos oscuros, envolver el componente en una card blanca con padding:
 * `<div className="rounded-lg bg-white p-2"><EquitelLogo size={24} /></div>`.
 */
export function EquitelLogo({ size = 32, className }: Props) {
  return (
    <img
      src="/equitel.png"
      alt="Equitel"
      className={cn('w-auto object-contain select-none', className)}
      style={{ height: `${size}px` }}
      draggable={false}
    />
  );
}
