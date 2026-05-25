import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/**
 * Sistema brand · Input (sunken style).
 *
 * Idle: bg-slate-50 + border slate-200 (se "hunde" sobre el card blanco).
 * Focus: bg blanco + outline brand-400 + ring tenue.
 * Soporta icono opcional a la izquierda (lucide en text-slate-400).
 */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, fullWidth = true, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className={cn(fullWidth && 'w-full')}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-text-strong mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block bg-slate-50 border border-slate-200 rounded-brand-input',
            'px-3.5 py-2.5 text-sm text-text-strong placeholder:text-text-subtle',
            'transition-colors duration-150 ease-out',
            'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
            'disabled:bg-slate-100 disabled:text-text-muted disabled:cursor-not-allowed',
            icon && 'pl-10',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/30',
            fullWidth && 'w-full',
            className,
          )}
          {...props}
        />
      </div>
      {(hint || error) && (
        <p
          className={cn(
            'mt-1.5 text-xs',
            error ? 'text-danger-700' : 'text-text-muted',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
