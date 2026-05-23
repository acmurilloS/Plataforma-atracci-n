import { useMemo, useState } from 'react';
import { useCargos } from '../../hooks/useCatalogos';
import type { CargoDoc } from '../../schemas';

interface Props {
  value?: string;
  onChange: (cargo: CargoDoc | null) => void;
  error?: string;
  disabled?: boolean;
}

export function SelectorCargo({ value, onChange, error, disabled }: Props) {
  const { cargos, cargando } = useCargos();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);

  const seleccionado = useMemo(
    () => cargos.find((c) => c.id === value) ?? null,
    [cargos, value],
  );

  const filtrados = useMemo(() => {
    const s = busqueda.trim().toLowerCase();
    if (!s) return cargos;
    return cargos.filter((c) => c.nombre.toLowerCase().includes(s));
  }, [cargos, busqueda]);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || cargando}
        onClick={() => setAbierto((o) => !o)}
        className={[
          'w-full rounded-md border px-3 py-2 text-left text-sm bg-white transition',
          error ? 'border-red-400' : 'border-navy-200 hover:border-navy-400',
          disabled ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {seleccionado ? seleccionado.nombre : cargando ? 'Cargando cargos…' : 'Selecciona un cargo'}
      </button>
      {abierto && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-navy-200 bg-white shadow-lg">
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cargo…"
            className="w-full rounded-t-md border-b border-navy-100 px-3 py-2 text-sm focus:outline-none"
          />
          <ul className="max-h-64 overflow-auto">
            {filtrados.length === 0 && (
              <li className="px-3 py-2 text-sm text-navy-500">Sin resultados.</li>
            )}
            {filtrados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setAbierto(false);
                    setBusqueda('');
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-100"
                >
                  <span className="font-medium text-navy-900">{c.nombre}</span>
                  <span className="ml-2 text-xs text-navy-500">
                    Criticidad sugerida: {c.criticidad_sugerida}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
