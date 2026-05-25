import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

/**
 * Sistema brand · Card.
 *
 * Default flat (~90% de los casos): bg blanco, border slate-200, sombra layered.
 * Variante `clickable`: añade lift+scale en hover (muy distintivo).
 * Variante `dark-hero`: gradient oscuro Apple-pro para piezas destacadas.
 */

export type BrandCardVariant = 'flat' | 'dark-hero';
export type BrandCardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BrandCardVariant;
  padding?: BrandCardPadding;
  clickable?: boolean;
}

const PADDING: Record<BrandCardPadding, string> = {
  none: 'p-0',
  sm: 'p-5',
  md: 'p-6',
  lg: 'p-7',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'flat', padding = 'md', clickable = false, className, children, ...props },
  ref,
) {
  if (variant === 'dark-hero') {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-brand-card text-white',
          'brand-glass-dark',
          PADDING[padding === 'md' ? 'lg' : padding],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        'bg-white rounded-md border border-slate-200 shadow-brand-card',
        'transition-all duration-200 ease-out',
        clickable && 'hover:shadow-brand-card-hover hover:-translate-y-1 hover:scale-[1.015] hover:border-slate-300 hover:z-10 cursor-pointer',
        !clickable && 'hover:shadow-brand-card-hover',
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
