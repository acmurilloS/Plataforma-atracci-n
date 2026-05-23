import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../utils/cn';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  rightSlot?: ReactNode;
  className?: string;
}

/**
 * Editorial Precision · Input.
 * - Bg `surface.low`, sin border 1px. Focus → bg white + ring primary 40%.
 * - Label semibold arriba. Error y hint visuales debajo.
 */
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>, FieldProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, rightSlot, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('block', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-navy-800 mb-1.5"
        >
          {label}
          {required && <span className="text-equitel-rojo-600 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          required={required}
          className={cn(
            'w-full rounded-xl bg-surface-low px-4 py-3 text-sm text-navy-900 placeholder:text-navy-400 transition',
            'focus:outline-none focus:bg-white focus:ring-2 focus:ring-equitel-rojo-500/40',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            error && 'ring-2 ring-red-400/50 bg-red-50/40',
            rightSlot && 'pr-11',
          )}
          {...props}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-3 flex items-center text-navy-400 pointer-events-none">
            {rightSlot}
          </div>
        )}
      </div>
      {hint && !error && <p className="text-xs text-navy-500 mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
});

/**
 * Editorial Precision · Textarea.
 */
interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>,
    FieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, id, rows = 3, ...props },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <div className={cn('block', className)}>
      {label && (
        <label
          htmlFor={areaId}
          className="block text-sm font-semibold text-navy-800 mb-1.5"
        >
          {label}
          {required && <span className="text-equitel-rojo-600 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        required={required}
        className={cn(
          'w-full rounded-xl bg-surface-low px-4 py-3 text-sm text-navy-900 placeholder:text-navy-400 transition resize-y',
          'focus:outline-none focus:bg-white focus:ring-2 focus:ring-equitel-rojo-500/40',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          error && 'ring-2 ring-red-400/50 bg-red-50/40',
        )}
        {...props}
      />
      {hint && !error && <p className="text-xs text-navy-500 mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
});

/**
 * Editorial Precision · Select.
 */
interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>,
    FieldProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, id, children, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('block', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-semibold text-navy-800 mb-1.5"
        >
          {label}
          {required && <span className="text-equitel-rojo-600 ml-0.5">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        required={required}
        className={cn(
          'w-full rounded-xl bg-surface-low px-4 py-3 text-sm text-navy-900 transition appearance-none cursor-pointer',
          'focus:outline-none focus:bg-white focus:ring-2 focus:ring-equitel-rojo-500/40',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          error && 'ring-2 ring-red-400/50 bg-red-50/40',
          'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%227%22%20viewBox%3D%220%200%2012%207%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M1%201.5L6%206.5L11%201.5%22%20stroke%3D%22%235c5c5c%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E")] bg-[length:10px_6px] bg-[position:right_1rem_center] bg-no-repeat pr-10',
        )}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <p className="text-xs text-navy-500 mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
});
