import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useColeccion } from '../hooks/useColeccion';
import { useMutacion } from '../hooks/useMutacion';
import type { NotificacionDoc } from '../schemas';
import { cn } from '../utils/cn';

/**
 * Campanita de notificaciones en el topbar (sistema brand).
 *
 * Hasta 10 notificaciones recientes. Las no leídas marcan la campana con un
 * dot rojo. Click marca como leída y navega al `link`.
 */
export function Campanita() {
  const { user } = useAuth();
  const { actualizar } = useMutacion();
  const [abierta, setAbierta] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { docs } = useColeccion<NotificacionDoc>('notificaciones', {
    filtros: user ? [['destinatario_uid', '==', user.uid]] : [],
    orden: ['creado_en', 'desc'],
    limit: 10,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierta(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const noLeidas = docs.filter((n) => !n.leida).length;

  async function marcarLeida(n: NotificacionDoc) {
    if (n.leida) return;
    await actualizar('notificaciones', n.id, {
      leida: true,
      leida_en: Timestamp.now(),
    });
  }

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierta(!abierta)}
        className={cn(
          'relative inline-flex items-center justify-center w-8 h-8 rounded-md',
          'text-text-muted hover:text-text-strong hover:bg-slate-100 transition-colors',
          abierta && 'bg-slate-100 text-text-strong',
        )}
        title="Notificaciones"
        aria-label="Notificaciones"
      >
        <Bell size={16} strokeWidth={1.75} />
        {noLeidas > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1',
              'bg-brand-600 text-white text-[10px] font-semibold tabular-nums rounded-full',
              'ring-2 ring-white',
            )}
          >
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-80 bg-white rounded-md shadow-brand-card border border-slate-200 z-50 overflow-hidden',
          )}
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-text-strong">Notificaciones</p>
            {noLeidas > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {noLeidas} sin leer
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {docs.length === 0 && (
              <div className="px-4 py-10 text-center text-text-muted">
                <BellOff
                  size={20}
                  strokeWidth={1.5}
                  className="mx-auto mb-2 text-text-subtle"
                />
                <p className="text-[12px]">Sin notificaciones.</p>
              </div>
            )}
            {docs.map((n) => (
              <Link
                key={n.id}
                to={n.link ?? '#'}
                onClick={() => {
                  marcarLeida(n);
                  setAbierta(false);
                }}
                className={cn(
                  'block px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors',
                  'hover:bg-slate-50/60',
                  !n.leida && 'bg-brand-50/40',
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.leida && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-[13px]',
                        !n.leida
                          ? 'font-semibold text-text-strong'
                          : 'font-medium text-text-body',
                      )}
                    >
                      {n.titulo}
                    </p>
                    <p className="text-[12px] text-text-muted mt-0.5 line-clamp-2 leading-[1.45]">
                      {n.mensaje}
                    </p>
                    {n.creado_en && (
                      <p className="text-[10px] text-text-subtle mt-1 tabular-nums">
                        {n.creado_en.toDate().toLocaleString('es-CO')}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
