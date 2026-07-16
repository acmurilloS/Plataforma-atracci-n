import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CornerDownLeft, Search, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useColeccion } from '../hooks/useColeccion';
import { puedeVerVacante } from '../utils/accesoRutas';
import { cn } from '../utils/cn';
import type { VacanteDoc } from '../schemas';

/**
 * BuscadorGlobal · buscador tipo command-palette (⌘K / Ctrl+K) que aparece en la
 * barra lateral (reu 03-jul). Busca vacantes por consecutivo, cargo, empresa o
 * sede y navega al detalle. El disparador vive en el sidebar; los datos se cargan
 * solo al abrir el modal (y quedan cacheados por useColeccion).
 *
 * Solo se muestra a quien PUEDE abrir el detalle de una vacante: para GH,
 * Documentación o Gestor SST buscar una vacante terminaba en "Sin permisos"
 * (auditoría 14-jul).
 */
export function BuscadorGlobal() {
  const { rol } = useAuth();
  const habilitado = puedeVerVacante(rol);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!habilitado) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [habilitado]);

  if (!habilitado) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[12.5px] text-text-subtle hover:bg-white hover:border-slate-300 transition-colors"
      >
        <Search size={14} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1 truncate">Buscar vacante…</span>
        <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-text-subtle">
          ⌘K
        </kbd>
      </button>
      {abierto && <BuscadorModal onClose={() => setAbierto(false)} />}
    </>
  );
}

function BuscadorModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { rol, user } = useAuth();
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // El líder solo puede LISTAR sus propias vacantes (regla de confidencialidad).
  // Sin este filtro, el list traía vacantes de otros líderes, la regla denegaba
  // TODA la query y el buscador siempre decía "Sin resultados" con un
  // permission-denied (revisión 16-jul). Los demás roles listan todo.
  const { docs: vacantes } = useColeccion<VacanteDoc>('vacantes', {
    filtros: rol === 'lider' && user ? [['lider_uid', '==', user.uid]] : [],
    orden: ['creado_en', 'desc'],
    limit: 500,
  });

  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const resultados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return vacantes
      .filter((v) =>
        `${v.consecutivo} ${v.cargo_nombre} ${v.empresa_nombre} ${v.sede_nombre}`
          .toLowerCase()
          .includes(s),
      )
      .slice(0, 12);
  }, [q, vacantes]);

  useEffect(() => {
    setActivo(0);
  }, [q]);

  function abrir(v: VacanteDoc) {
    onClose();
    nav(`/vacantes/${v.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => Math.min(a + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && resultados[activo]) {
      e.preventDefault();
      abrir(resultados[activo]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 backdrop-blur-sm px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar vacante"
        className="bg-white rounded-md w-full max-w-xl shadow-xl border border-slate-200 flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-200">
          <Search size={17} strokeWidth={1.75} className="text-text-subtle shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por consecutivo, cargo, empresa o sede…"
            className="flex-1 bg-transparent text-[14px] text-text-strong placeholder:text-text-subtle focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-md text-text-subtle hover:text-text-strong hover:bg-slate-100 transition-colors"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Resultados */}
        <div className="overflow-y-auto flex-1">
          {!q.trim() ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-subtle">
              Escribe para buscar una vacante por consecutivo, cargo o empresa.
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-subtle">
              Sin resultados para “{q.trim()}”.
            </p>
          ) : (
            <ul className="py-1.5">
              {resultados.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => abrir(v)}
                    onMouseEnter={() => setActivo(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      i === activo ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="h-8 w-8 rounded-md bg-slate-100 text-text-muted flex items-center justify-center shrink-0">
                      <Building2 size={15} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-text-strong truncate">
                        {v.cargo_nombre}
                      </p>
                      <p className="text-[11px] text-text-subtle truncate">
                        <span className="font-mono">{v.consecutivo}</span> · {v.empresa_nombre} ·{' '}
                        {v.sede_nombre}
                      </p>
                    </div>
                    {i === activo && (
                      <CornerDownLeft size={14} strokeWidth={1.75} className="text-text-subtle shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10.5px] text-text-subtle flex items-center gap-3">
          <span>↑↓ moverse</span>
          <span>↵ abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
