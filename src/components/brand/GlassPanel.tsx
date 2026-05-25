import { type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

/**
 * Sistema brand · GlassPanel.
 *
 * Surface flotante con backdrop-blur + saturate. Para modales centrales,
 * formulario de Login, sidebars sticky en páginas brand.
 *
 * - `light`: glass blanco translúcido sobre fondo claro (default).
 * - `strong`: opacidad más alta para mejor legibilidad de contenido denso.
 * - `dark`: gradient oscuro Apple-pro para hero cards.
 */

export type GlassTone = 'light' | 'strong' | 'dark';
export type GlassRadius = 'card' | 'modal' | 'md';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  tono?: GlassTone;
  radius?: GlassRadius;
}

const RADIUS: Record<GlassRadius, string> = {
  card: 'rounded-brand-card',
  modal: 'rounded-brand-modal',
  md: 'rounded-md',
};

const TONO: Record<GlassTone, string> = {
  light: 'brand-glass',
  strong: 'brand-glass-strong',
  dark: 'brand-glass-dark text-white',
};

export function GlassPanel({
  tono = 'light',
  radius = 'card',
  className,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div className={cn(TONO[tono], RADIUS[radius], className)} {...props}>
      {children}
    </div>
  );
}
