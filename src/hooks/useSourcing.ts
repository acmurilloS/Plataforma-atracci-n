import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

interface ResultadoBusqueda {
  ok: boolean;
  busqueda_id: string;
  /** null cuando estado='en_proceso' (modo Clay async). Número cuando completó (modo síncrono). */
  encontrados: number | null;
  postulaciones_ids: string[];
  modo: 'clay' | 'gemini' | 'dummy';
  estado?: 'en_proceso' | 'completada';
}

export function useSourcing() {
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscarCandidatos = useCallback(async (vacanteId: string): Promise<ResultadoBusqueda> => {
    setEjecutando(true);
    setError(null);
    try {
      const fn = httpsCallable<{ vacante_id: string }, ResultadoBusqueda>(
        functions,
        'buscarCandidatosIA',
      );
      const res = await fn({ vacante_id: vacanteId });
      return res.data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No pudimos ejecutar la búsqueda.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setEjecutando(false);
    }
  }, []);

  return { buscarCandidatos, ejecutando, error };
}
