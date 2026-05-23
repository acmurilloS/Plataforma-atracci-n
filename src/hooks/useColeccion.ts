import { useEffect, useState } from 'react';
import {
  collection,
  limit as limitFn,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type WhereFilterOp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type FiltroTupla = [string, WhereFilterOp, unknown];

export interface OpcionesColeccion {
  filtros?: FiltroTupla[];
  orden?: [string, 'asc' | 'desc'] | null;
  limit?: number;
}

interface DocumentoBase {
  id: string;
}

export function useColeccion<T extends DocumentoBase>(
  coleccion: string,
  opciones: OpcionesColeccion = {},
): { docs: T[]; cargando: boolean; error: string | null } {
  const [docs, setDocs] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const keyFiltros = JSON.stringify(opciones.filtros ?? []);
  const keyOrden = JSON.stringify(opciones.orden ?? null);
  const lim = opciones.limit ?? 100;

  useEffect(() => {
    setCargando(true);
    setError(null);
    const constraints: QueryConstraint[] = [];
    for (const [campo, op, valor] of opciones.filtros ?? []) {
      constraints.push(where(campo, op, valor));
    }
    if (opciones.orden) constraints.push(orderBy(opciones.orden[0], opciones.orden[1]));
    constraints.push(limitFn(lim));
    const q = query(collection(db, coleccion), ...constraints);
    return onSnapshot(
      q,
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) }) as T));
        setCargando(false);
      },
      (err) => {
        console.error(`[useColeccion ${coleccion}] error:`, err);
        setError(err.message);
        setCargando(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coleccion, keyFiltros, keyOrden, lim]);

  return { docs, cargando, error };
}
