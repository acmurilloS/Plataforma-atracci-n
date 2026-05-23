import { cn } from '../../utils/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarColor = 'negro' | 'rojo' | 'gris';

interface AvatarProps {
  nombre: string;
  size?: AvatarSize;
  color?: AvatarColor;
  className?: string;
}

const SIZE_STYLES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

const COLOR_STYLES: Record<AvatarColor, string> = {
  negro: 'bg-navy-900 text-white',
  rojo: 'bg-equitel-rojo-600 text-white',
  gris: 'bg-navy-200 text-navy-800',
};

function iniciales(nombre: string): string {
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function Avatar({ nombre, size = 'sm', color = 'negro', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold shrink-0',
        SIZE_STYLES[size],
        COLOR_STYLES[color],
        className,
      )}
      aria-label={nombre}
      title={nombre}
    >
      {iniciales(nombre)}
    </div>
  );
}
