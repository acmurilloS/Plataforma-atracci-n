import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useColeccion } from '../hooks/useColeccion';
import { useMutacion } from '../hooks/useMutacion';
import type { NotificacionDoc } from '../schemas';
import { cn } from '../utils/cn';

/**
 * Campanita de notificaciones en el topbar.
 *
 * Muestra hasta 10 notificaciones recientes del usuario. Las no leídas marcan
 * la campana con punto rojo. Click en una notificación la marca como leída y
 * navega al `link` asociado (terna, vacante, etc.).
 *
 * Fuente: collection `notificaciones`, filtro por `destinatario_uid`.
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
        className="relative text-navy-600 hover:text-navy-900"
        title="Notificaciones"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 bg-red-600 text-white text-[10px] font-semibold rounded-full">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-navy-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-navy-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-navy-900">Notificaciones</p>
            {noLeidas > 0 && (
              <span className="text-xs text-navy-500">{noLeidas} sin leer</span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {docs.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-navy-500">Sin notificaciones.</p>
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
                  'block px-4 py-3 border-b border-navy-50 hover:bg-cream-50 transition',
                  !n.leida && 'bg-cream-100/40',
                )}
              >
                <p
                  className={cn(
                    'text-sm',
                    !n.leida ? 'font-semibold text-navy-900' : 'font-medium text-navy-700',
                  )}
                >
                  {n.titulo}
                </p>
                <p className="text-xs text-navy-600 mt-0.5 line-clamp-2">{n.mensaje}</p>
                {n.creado_en && (
                  <p className="text-[10px] text-navy-400 mt-1">
                    {n.creado_en.toDate().toLocaleString('es-CO')}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
