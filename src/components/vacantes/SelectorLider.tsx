import { useMemo } from 'react';
import { useColeccion } from '../../hooks/useColeccion';
import type { UsuarioDoc } from '../../schemas';

interface Props {
  value: string | null;
  onChange: (uid: string, nombre: string) => void;
  /** Creador de la vacante — se ofrece como "(yo)" para no perder el default. */
  creador?: { uid: string; nombre: string } | null;
  disabled?: boolean;
}

/**
 * SelectorLider · elige al LÍDER RESPONSABLE de la vacante: quien la ve en "Mis
 * vacantes", recibe todas las notificaciones (aval, concepto, terna) y DECIDE la
 * terna. Reu 18-ago (Opción A): cuando Coordinación/GH crea la vacante en nombre
 * de un líder, aquí se reasigna `lider_uid` al líder real y de ahí en adelante
 * todo el proceso se enruta hacia él (decidirTerna valida el `lider_uid`).
 *
 * Base = usuarios con rol 'lider' activos + el propio creador (por si él mismo es
 * el responsable). Solo se muestra a staff (admin/coord/gh), que es quien puede
 * leer la colección `usuarios` y quien crea vacantes en nombre de otros.
 */
export function SelectorLider({ value, onChange, creador, disabled }: Props) {
  const { docs: lideresDocs, cargando } = useColeccion<UsuarioDoc>('usuarios', {
    filtros: [['rol', '==', 'lider']],
  });

  const opciones = useMemo(() => {
    const lista = lideresDocs
      .filter((u) => u.activo !== false)
      .map((u) => ({ uid: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), yo: false }));
    // El creador va primero como "(yo)" si no está ya en la lista de líderes.
    if (creador && !lista.some((o) => o.uid === creador.uid)) {
      lista.push({ uid: creador.uid, nombre: creador.nombre, yo: true });
    }
    return lista.sort((a, b) => {
      if (a.yo) return -1;
      if (b.yo) return 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [lideresDocs, creador]);

  return (
    <select
      value={value ?? ''}
      disabled={disabled || cargando}
      onChange={(e) => {
        const uid = e.target.value;
        const o = opciones.find((x) => x.uid === uid);
        if (o) onChange(uid, o.nombre);
      }}
      className="w-full rounded-brand-input border border-slate-300 bg-white px-3.5 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 disabled:opacity-60"
    >
      <option value="" disabled>
        {cargando ? 'Cargando líderes…' : 'Selecciona al líder responsable'}
      </option>
      {opciones.map((o) => (
        <option key={o.uid} value={o.uid}>
          {o.nombre}
          {o.yo ? ' (yo)' : ''}
        </option>
      ))}
    </select>
  );
}
