import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Sistema brand · Button.
 *
 * 10 variants × 3 sizes. API plana, sin gradients (eso era SaaS dated).
 * - rounded-md (flat).
 * - font-medium (no bold).
 * - transition-colors (no transition-all, evita repintar shadows en cada frame).
 * - focus-visible con outline brand.
 */

export type BrandButtonVariant =
  | 'brand-primary'
  | 'brand-secondary'
  | 'brand-tertiary'
  | 'neutral-primary'
  | 'neutral-secondary'
  | 'neutral-tertiary'
  | 'destructive-primary'
  | 'destructive-secondary'
  | 'destructive-tertiary'
  | 'inverse';

export type BrandButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrandButtonVariant;
  size?: BrandButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const VARIANT: Record<BrandButtonVariant, string> = {
  'brand-primary':
    'bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-700 shadow-brand-cta disabled:bg-brand-200 disabled:shadow-none',
  'brand-secondary':
    'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:bg-brand-50/60 disabled:text-brand-300',
  'brand-tertiary':
    'bg-transparent text-brand-700 hover:bg-brand-50 disabled:text-brand-300',
  'neutral-primary':
    'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400',
  'neutral-secondary':
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:bg-white disabled:text-slate-400',
  'neutral-tertiary':
    'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  'destructive-primary':
    'bg-danger-600 text-white hover:bg-danger-500 active:bg-danger-700 disabled:bg-danger-200',
  'destructive-secondary':
    'bg-danger-50 text-danger-700 hover:bg-danger-50/80 disabled:text-danger-300',
  'destructive-tertiary':
    'bg-transparent text-danger-700 hover:bg-danger-50 disabled:text-danger-300',
  inverse:
    'bg-transparent text-white hover:bg-white/15 disabled:text-white/40',
};

const SIZE: Record<BrandButtonSize, string> = {
  small: 'h-7 px-2.5 text-xs gap-1.5',
  medium: 'h-9 px-3 text-sm gap-2',
  large: 'h-10 px-4 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'brand-primary',
    size = 'medium',
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
        'inline-flex items-center justify-center rounded-md font-medium',
        'transition-colors duration-150 ease-out',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed',
        fullWidth && 'w-full',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={size === 'small' ? 12 : 14} strokeWidth={1.75} />}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
});
