import { useEffect, useState } from 'react';
import {
  collection,
  limit as limitFn,
  onSnapshot,
  orderBy,
  query,
  where,
  type FirestoreError,
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

/**
 * useColeccion · suscripción reactiva a una colección Firestore.
 *
 * Resiliencia clave: si la query falla por `FAILED_PRECONDITION` (índice
 * compuesto faltante o aún construyéndose), el hook hace un FALLBACK
 * automático ejecutando la misma query SIN `orderBy` y ordenando en cliente.
 * Esto evita que la UI quede vacía cuando se despliega un índice nuevo
 * o se olvida agregarlo, que fue lo que pasó con `/aprobaciones-aval`.
 *
 * Para colecciones grandes (>1000 docs) sí conviene agregar el índice en
 * `firestore.indexes.json` por performance, pero para listas <100 (vacantes,
 * carpetas, tickets activos) el orden en cliente es trivial.
 */
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

    const filtros = opciones.filtros ?? [];
    const orden = opciones.orden ?? null;

    function construirConstraints(conOrden: boolean): QueryConstraint[] {
      const cs: QueryConstraint[] = [];
      for (const [campo, op, valor] of filtros) cs.push(where(campo, op, valor));
      if (conOrden && orden) cs.push(orderBy(orden[0], orden[1]));
      cs.push(limitFn(lim));
      return cs;
    }

    function ordenarEnCliente(arr: T[]): T[] {
      if (!orden) return arr;
      const [campo, dir] = orden;
      const factor = dir === 'desc' ? -1 : 1;
      return [...arr].sort((a, b) => {
        const av = (a as Record<string, unknown>)[campo];
        const bv = (b as Record<string, unknown>)[campo];
        // Soporta Timestamp (toMillis), number, string, Date.
        const am = toComparable(av);
        const bm = toComparable(bv);
        if (am < bm) return -1 * factor;
        if (am > bm) return 1 * factor;
        return 0;
      });
    }

    // Primer intento: query completa (con orderBy si corresponde).
    let unsub = () => {};
    let fallback = false;

    function suscribir(conOrden: boolean) {
      const q = query(collection(db, coleccion), ...construirConstraints(conOrden));
      unsub = onSnapshot(
        q,
        (snap) => {
          const raw = snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) }) as T,
          );
          setDocs(conOrden ? raw : ordenarEnCliente(raw));
          setCargando(false);
        },
        (err: FirestoreError) => {
          if (
            !fallback &&
            conOrden &&
            (err.code === 'failed-precondition' || /index/i.test(err.message))
          ) {
            // Re-suscribir sin orderBy y ordenar en cliente.
            console.warn(
              `[useColeccion ${coleccion}] índice faltante para orderBy ${orden?.[0]} — fallback a orden en cliente.`,
            );
            fallback = true;
            unsub();
            suscribir(false);
            return;
          }
          console.error(`[useColeccion ${coleccion}] error:`, err);
          setError(err.message);
          setCargando(false);
        },
      );
    }

    suscribir(true);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coleccion, keyFiltros, keyOrden, lim]);

  return { docs, cargando, error };
}

function toComparable(v: unknown): number | string {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toMillis' in v) {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (v instanceof Date) return v.getTime();
  return String(v);
}
