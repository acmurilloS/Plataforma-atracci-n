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
 * Caché en memoria de resultados por query (colección + filtros + orden + límite).
 * Evita el "flash de 0" al cambiar de pestaña: al re-montar, el hook arranca con
 * los últimos datos vistos en vez de una lista vacía, y el snapshot fresco de
 * Firestore actualiza en el siguiente tick. Se vacía al recargar la página.
 * Con tope LRU para no crecer sin límite en sesiones largas.
 */
const cacheColeccion = new Map<string, unknown[]>();
const CACHE_MAX = 40;

function guardarCache(clave: string, valor: unknown[]): void {
  cacheColeccion.delete(clave); // re-inserta al final → recencia (LRU simple)
  cacheColeccion.set(clave, valor);
  if (cacheColeccion.size > CACHE_MAX) {
    const masViejo = cacheColeccion.keys().next().value;
    if (masViejo !== undefined) cacheColeccion.delete(masViejo);
  }
}

/**
 * useColeccion · suscripción reactiva a una colección Firestore.
 *
 * Resiliencia clave: si la query falla por `FAILED_PRECONDITION` (índice
 * compuesto faltante o aún construyéndose), el hook hace un FALLBACK
 * automático ejecutando la misma query SIN `orderBy` y ordenando en cliente.
 * En ese fallback NO se limita en servidor (Firestore truncaría por `__name__`
 * antes del orden en cliente, dejando fuera los más recientes): se traen los
 * filtrados y se corta tras ordenar.
 *
 * Para colecciones grandes (>1000 docs) sí conviene agregar el índice en
 * `firestore.indexes.json` por performance, pero para listas <100 (vacantes,
 * carpetas, tickets activos) el orden en cliente es trivial.
 */
export function useColeccion<T extends DocumentoBase>(
  coleccion: string,
  opciones: OpcionesColeccion = {},
): { docs: T[]; cargando: boolean; error: string | null } {
  const keyFiltros = JSON.stringify(opciones.filtros ?? []);
  const keyOrden = JSON.stringify(opciones.orden ?? null);
  const lim = opciones.limit ?? 100;
  const clave = `${coleccion}|${keyFiltros}|${keyOrden}|${lim}`;

  // Arranca con lo cacheado (si existe) → sin flash de 0 al re-montar.
  const [docs, setDocs] = useState<T[]>(() => (cacheColeccion.get(clave) as T[] | undefined) ?? []);
  const [cargando, setCargando] = useState(() => !cacheColeccion.has(clave));
  const [error, setError] = useState<string | null>(null);

  // Si la query cambia SIN desmontar (p.ej. cambian filtros), re-sembramos el
  // estado en el mismo render (patrón oficial de React) para no mostrar los
  // datos de la query anterior por un frame.
  const [claveActual, setClaveActual] = useState(clave);
  if (clave !== claveActual) {
    setClaveActual(clave);
    const cached = cacheColeccion.get(clave) as T[] | undefined;
    setDocs(cached ?? []);
    setCargando(!cached);
    setError(null);
  }

  useEffect(() => {
    setError(null);

    const filtros = opciones.filtros ?? [];
    const orden = opciones.orden ?? null;

    function construirConstraints(conOrden: boolean): QueryConstraint[] {
      const cs: QueryConstraint[] = [];
      for (const [campo, op, valor] of filtros) cs.push(where(campo, op, valor));
      if (conOrden && orden) cs.push(orderBy(orden[0], orden[1]));
      // En el fallback CON orden no se limita en servidor (ver doc del hook).
      if (conOrden || !orden) cs.push(limitFn(lim));
      return cs;
    }

    function ordenarEnCliente(arr: T[]): T[] {
      if (!orden) return arr;
      const [campo, dir] = orden;
      const factor = dir === 'desc' ? -1 : 1;
      return [...arr].sort((a, b) => {
        const av = (a as Record<string, unknown>)[campo];
        const bv = (b as Record<string, unknown>)[campo];
        const am = toComparable(av);
        const bm = toComparable(bv);
        if (am < bm) return -1 * factor;
        if (am > bm) return 1 * factor;
        return 0;
      });
    }

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
          // En el fallback se ordena en cliente y se corta al límite (el servidor
          // trajo TODOS los filtrados, sin truncar por __name__).
          const resultado = conOrden ? raw : ordenarEnCliente(raw).slice(0, lim);
          guardarCache(clave, resultado);
          setDocs(resultado);
          setCargando(false);
        },
        (err: FirestoreError) => {
          if (
            !fallback &&
            conOrden &&
            (err.code === 'failed-precondition' || /index/i.test(err.message))
          ) {
            console.warn(
              `[useColeccion ${coleccion}] índice faltante para orderBy ${orden?.[0]} — fallback a orden en cliente.`,
            );
            fallback = true;
            unsub();
            suscribir(false);
            return;
          }
          console.error(`[useColeccion ${coleccion}] error:`, err);
          // Error definitivo: no re-servir datos cacheados que ya no son válidos.
          cacheColeccion.delete(clave);
          setDocs([]);
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
