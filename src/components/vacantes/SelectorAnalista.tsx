import { useMemo } from 'react';
import { useColeccion } from '../../hooks/useColeccion';
import type { UsuarioDoc } from '../../schemas';

interface Props {
  value: string | null;
  onChange: (uid: string, nombre: string) => void;
  disabled?: boolean;
}

/**
 * SelectorAnalista · dropdown de analistas ACTIVAS para que el staff
 * (coordinador/admin) asigne la responsable de una vacante (reu 26-jun).
 *
 * Lee la colección usuarios (rol=analista) y filtra inactivas en cliente para
 * no requerir un índice compuesto. Devuelve uid + nombre (snapshot) al elegir.
 */
export function SelectorAnalista({ value, onChange, disabled }: Props) {
  const { docs, cargando } = useColeccion<UsuarioDoc>('usuarios', {
    filtros: [['rol', '==', 'analista']],
  });

  const analistas = useMemo(
    () =>
      docs
        .filter((u) => u.activo !== false)
        .sort((a, b) =>
          `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'),
        ),
    [docs],
  );

  return (
    <select
      value={value ?? ''}
      disabled={disabled || cargando}
      onChange={(e) => {
        const uid = e.target.value;
        const u = analistas.find((a) => a.id === uid);
        if (u) onChange(uid, `${u.nombre} ${u.apellido}`.trim());
      }}
      className="w-full rounded-brand-input border border-slate-300 bg-white px-3.5 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 disabled:opacity-60"
    >
      <option value="" disabled>
        {cargando ? 'Cargando analistas…' : 'Selecciona una analista'}
      </option>
      {analistas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.nombre} {a.apellido}
          {a.id === value ? ' · actual' : ''}
        </option>
      ))}
    </select>
  );
}
