import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

/**
 * Editorial Precision · Button.
 * - `primary`: gradient rojo Equitel (500 → 700) con ambient shadow.
 * - `secondary`: glassmorphism blanco sobre cualquier fondo.
 * - `ghost`: texto puro con bg sutil en hover.
 * - `destructive`: rojo Tailwind utility (solo para acciones destructivas).
 * - `link`: texto sin caja, underline en hover.
 * Radios generosos (xl) + sombras ambient en lugar de drop shadows duras.
 */
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'text-white bg-gradient-to-br from-equitel-rojo-500 to-equitel-rojo-700 hover:from-equitel-rojo-600 hover:to-equitel-rojo-800 shadow-ambient disabled:from-equitel-rojo-200 disabled:to-equitel-rojo-300 disabled:shadow-none',
  secondary:
    'text-navy-900 glass-strong hover:bg-white/95 ghost-border disabled:text-navy-300',
  ghost:
    'text-navy-800 bg-transparent hover:bg-surface-mid/70 disabled:text-navy-300',
  destructive:
    'text-red-700 bg-red-50 hover:bg-red-100 disabled:text-red-300',
  link: 'text-equitel-rojo-700 bg-transparent hover:text-equitel-rojo-800 hover:underline underline-offset-4 disabled:text-navy-300',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-5 py-2.5 text-sm gap-2 rounded-xl',
  lg: 'px-7 py-3 text-base gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconPosition = 'left',
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-equitel-rojo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed',
        fullWidth && 'w-full',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        variant === 'link' && 'px-0 py-0 shadow-none',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 12 : 14} />}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
});
