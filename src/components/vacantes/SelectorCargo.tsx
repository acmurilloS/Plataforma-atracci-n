import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useCargos } from '../../hooks/useCatalogos';
import type { CargoDoc } from '../../schemas';
import { cn } from '../../utils/cn';

interface Props {
  value?: string;
  onChange: (cargo: CargoDoc | null) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * SelectorCargo · sistema brand.
 *
 * Combobox custom con trigger sunken + dropdown glass blanco. Buscador con
 * icono Search. Selección con checkmark brand y eyebrow de criticidad.
 */
export function SelectorCargo({ value, onChange, error, disabled }: Props) {
  const { cargos, cargando } = useCargos();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const seleccionado = useMemo(
    () => cargos.find((c) => c.id === value) ?? null,
    [cargos, value],
  );

  const filtrados = useMemo(() => {
    const s = busqueda.trim().toLowerCase();
    if (!s) return cargos;
    return cargos.filter((c) => c.nombre.toLowerCase().includes(s));
  }, [cargos, busqueda]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    if (abierto) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [abierto]);

  const criticidadColor = (c: 'Alta' | 'Media' | 'Baja') =>
    c === 'Alta' ? 'text-danger-700' : c === 'Media' ? 'text-warning-700' : 'text-success-700';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || cargando}
        onClick={() => setAbierto((o) => !o)}
        className={cn(
          'w-full rounded-brand-input bg-slate-50 border px-3.5 py-2.5 text-left text-[13px]',
          'flex items-center justify-between gap-2 transition-colors duration-150 ease-out',
          'focus:outline-none focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
          error
            ? 'border-danger-500'
            : abierto
              ? 'bg-white border-brand-400 ring-2 ring-brand-300/40'
              : 'border-slate-200 hover:bg-white hover:border-slate-300',
          disabled && 'opacity-60 cursor-not-allowed bg-slate-100',
        )}
      >
        <span className={seleccionado ? 'text-text-strong font-medium' : 'text-text-subtle'}>
          {seleccionado
            ? seleccionado.nombre
            : cargando
              ? 'Cargando cargos…'
              : 'Selecciona un cargo'}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={cn(
            'text-text-muted transition-transform duration-200 ease-cult',
            abierto && 'rotate-180',
          )}
        />
      </button>

      {abierto && !disabled && (
        <div className="absolute z-30 mt-2 w-full rounded-md border border-slate-200 bg-white shadow-brand-modal overflow-hidden animate-fade-in-up">
          {/* Buscador */}
          <div className="relative border-b border-slate-100">
            <Search
              size={14}
              strokeWidth={1.75}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
            />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cargo…"
              className="w-full pl-9 pr-3 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle focus:outline-none"
            />
          </div>
          {/* Lista */}
          <ul className="max-h-72 overflow-auto py-1">
            {filtrados.length === 0 && (
              <li className="px-3.5 py-3 text-[12px] text-text-muted italic">
                Sin resultados.
              </li>
            )}
            {filtrados.map((c) => {
              const activo = c.id === value;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setAbierto(false);
                      setBusqueda('');
                    }}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left text-[13px] transition-colors',
                      activo ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'font-medium truncate',
                          activo ? 'text-brand-700' : 'text-text-strong',
                        )}
                      >
                        {c.nombre}
                      </p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
                        <span className="text-text-subtle">Criticidad sugerida: </span>
                        <span className={criticidadColor(c.criticidad_sugerida)}>
                          {c.criticidad_sugerida}
                        </span>
                      </p>
                    </div>
                    {activo && (
                      <Check
                        size={15}
                        strokeWidth={2}
                        className="text-brand-700 shrink-0 mt-0.5"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
