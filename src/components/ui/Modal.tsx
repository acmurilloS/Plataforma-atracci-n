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
 * Editorial Precision · Modal.
 * - Backdrop con glassmorphism (blur 24px) sobre overlay oscuro.
 * - Card glass strong con radios generosos y shadow ambient XL.
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-dark animate-fade-in"
      onClick={() => dismissable && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full rounded-2xl glass-strong shadow-ambient-xl animate-slide-up overflow-hidden',
          SIZE_STYLES[size],
        )}
      >
        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-2">
            <div className="min-w-0">
              {title && (
                <h2 className="font-display text-2xl font-bold text-navy-900">{title}</h2>
              )}
              {description && (
                <p className="text-sm text-navy-600 mt-1.5">{description}</p>
              )}
            </div>
            {dismissable && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="text-navy-400 hover:text-navy-900 shrink-0 rounded-full p-1 hover:bg-surface-mid/60 transition"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="px-7 py-5">{children}</div>
        {footer && (
          <div className="px-7 py-4 bg-surface-low/60 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
