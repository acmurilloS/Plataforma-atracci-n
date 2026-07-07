import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * DrillDownVacantes · modal genérico que lista los ítems detrás de un KPI del
 * dashboard (reu 03-jul): al hundir "ANS vencidas", "En riesgo", una fase o
 * "Contratadas del mes", se abre este panel con esas vacantes/postulaciones y
 * cada fila navega al detalle. Cierra con Esc, click fuera o la X.
 */

export interface DrillItem {
  id: string;
  to: string;
  titulo: string;
  sub?: string;
  right?: ReactNode;
}

type Tono = 'danger' | 'warning' | 'success' | 'info' | 'brand';

const TONO: Record<Tono, { bg: string; fg: string }> = {
  danger: { bg: 'bg-danger-50', fg: 'text-danger-700' },
  warning: { bg: 'bg-warning-50', fg: 'text-warning-700' },
  success: { bg: 'bg-success-50', fg: 'text-success-700' },
  info: { bg: 'bg-info-50', fg: 'text-info-700' },
  brand: { bg: 'bg-brand-50', fg: 'text-brand-700' },
};

export function DrillDownVacantes({
  titulo,
  descripcion,
  tono = 'brand',
  icono,
  items,
  onClose,
}: {
  titulo: string;
  descripcion?: string;
  tono?: Tono;
  icono?: ReactNode;
  items: DrillItem[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus(); // foco inicial en el diálogo
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const t = TONO[tono];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-titulo"
        tabIndex={-1}
        className="bg-white rounded-md w-full max-w-2xl max-h-[calc(100vh-3rem)] flex flex-col shadow-xl border border-slate-200 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            {icono && (
              <div className={cn('w-11 h-11 rounded-md flex items-center justify-center shrink-0', t.bg, t.fg)}>
                {icono}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id="drill-titulo"
                className="text-[18px] font-semibold text-text-strong tracking-[-0.015em] truncate"
              >
                {titulo}
              </h2>
              <p className="text-[12px] text-text-muted mt-0.5">
                {items.length} {items.length === 1 ? 'vacante' : 'vacantes'}
                {descripcion ? ` · ${descripcion}` : ''}. Toca una para abrir.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-slate-100 text-text-subtle hover:text-text-strong transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-text-muted text-[13px]">No hay elementos.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((it) => (
                <li key={it.id}>
                  <Link
                    to={it.to}
                    onClick={onClose}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-text-strong group-hover:text-brand-700 transition-colors truncate">
                        {it.titulo}
                      </p>
                      {it.sub && <p className="text-[11px] text-text-subtle mt-0.5 truncate">{it.sub}</p>}
                    </div>
                    {it.right && <div className="shrink-0">{it.right}</div>}
                    <ChevronRight
                      size={16}
                      strokeWidth={1.75}
                      className="text-slate-300 group-hover:text-brand-600 transition-colors shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
