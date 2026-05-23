import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardElevation = 'flat' | 'ambient' | 'elevated';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: CardPadding;
  elevation?: CardElevation;
  /**
   * Nivel tonal del fondo. El default `surface` (blanco puro) asume que vive
   * sobre un background más oscuro como `surface.low`. Para anidar cards,
   * usar `tier="lowest"`.
   */
  tier?: 'surface' | 'lowest' | 'low' | 'mid';
}

const PADDING_STYLES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const ELEVATION_STYLES: Record<CardElevation, string> = {
  flat: '',
  ambient: 'shadow-ambient',
  elevated: 'shadow-ambient-lg',
};

const TIER_STYLES: Record<NonNullable<CardProps['tier']>, string> = {
  surface: 'bg-white',
  lowest: 'bg-surface-lowest',
  low: 'bg-surface-low',
  mid: 'bg-surface-mid',
};

/**
 * Editorial Precision · Card.
 * - Sin bordes 1px. La separación se logra con tonal shift (tier) y ambient shadow.
 * - Radios generosos (rounded-2xl por defecto).
 * - Interactive: hover sutil que aumenta la elevación y sube a tier más bajo.
 */
export function Card({
  interactive = false,
  padding = 'md',
  elevation = 'ambient',
  tier = 'surface',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl transition-all duration-200',
        TIER_STYLES[tier],
        PADDING_STYLES[padding],
        ELEVATION_STYLES[elevation],
        interactive && 'cursor-pointer hover:shadow-ambient-lg hover:-translate-y-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardSubProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardSubProps) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function CardBody({ children, className }: CardSubProps) {
  return <div className={cn(className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardSubProps) {
  return (
    <div className={cn('mt-5 pt-4', 'ghost-border rounded-none border-0', className)}>
      {children}
    </div>
  );
}
