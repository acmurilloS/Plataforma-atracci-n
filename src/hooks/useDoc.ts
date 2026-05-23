import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DocumentoBase {
  id: string;
}

export function useDoc<T extends DocumentoBase>(
  coleccion: string,
  id: string | null | undefined,
): { doc: T | null; cargando: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    return onSnapshot(
      doc(db, coleccion, id),
      (snap) => {
        if (!snap.exists()) {
          setData(null);
          setCargando(false);
          return;
        }
        setData({ id: snap.id, ...(snap.data() as Omit<T, 'id'>) } as T);
        setCargando(false);
      },
      (err) => {
        console.error(`[useDoc ${coleccion}/${id}] error:`, err);
        setError(err.message);
        setCargando(false);
      },
    );
  }, [coleccion, id]);

  return { doc: data, cargando, error };
}
