import { useMemo } from 'react';
import { useColeccion } from '../../hooks/useColeccion';
import type { UsuarioDoc } from '../../schemas';

interface Props {
  value: string | null;
  onChange: (uid: string, nombre: string) => void;
  disabled?: boolean;
}

/**
 * SelectorAnalista · dropdown de responsables de una vacante. Base = analistas
 * activas; MÁS los usuarios habilitados puntualmente con `asignable_como_analista=true`
 * (reu 28-jul: Karen —que es admin— quedó en el listado para asignarse procesos
 * sin perder su rol, SIN meter a todos los admin). Dos queries + merge para no
 * requerir índice compuesto; se filtran inactivos en cliente.
 */
export function SelectorAnalista({ value, onChange, disabled }: Props) {
  const { docs: analistasDocs, cargando: c1 } = useColeccion<UsuarioDoc>('usuarios', {
    filtros: [['rol', '==', 'analista']],
  });
  const { docs: habilitadosDocs, cargando: c2 } = useColeccion<UsuarioDoc>('usuarios', {
    filtros: [['asignable_como_analista', '==', true]],
  });
  const cargando = c1 || c2;

  const analistas = useMemo(() => {
    const porId = new Map<string, UsuarioDoc>();
    for (const u of [...analistasDocs, ...habilitadosDocs]) porId.set(u.id, u);
    return [...porId.values()]
      .filter((u) => u.activo !== false)
      .sort((a, b) =>
        `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'),
      );
  }, [analistasDocs, habilitadosDocs]);

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
