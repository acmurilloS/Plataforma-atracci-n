import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  size?: ModalSize;
  children: ReactNode;
  dismissable?: boolean;
}

const SIZE_STYLES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal · sistema brand.
 *
 * Backdrop con text-strong/50 + backdrop-blur. Card blanca con shadow brand-card,
 * tipografía Inter, tokens text-strong / text-muted. Footer con bg slate sutil.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
  dismissable = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissable) onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-strong/50 backdrop-blur-sm animate-fade-in"
      onClick={() => dismissable && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full rounded-lg bg-white shadow-brand-card border border-slate-200 overflow-hidden animate-slide-up',
          SIZE_STYLES[size],
        )}
      >
        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-4 pb-1">
            <div className="min-w-0">
              {title && (
                <h2 className="text-[18px] font-semibold tracking-[-0.012em] text-text-strong leading-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-[12px] text-text-muted mt-1 leading-[1.45]">{description}</p>
              )}
            </div>
            {dismissable && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="text-text-muted hover:text-text-strong shrink-0 rounded-md p-1 hover:bg-slate-100 transition-colors"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}
        <div className="px-6 py-3">{children}</div>
        {footer && (
          <div className="px-6 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
