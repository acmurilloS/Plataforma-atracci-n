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
  /** Query/instrucción que Gemini ejecutó (resumen de su búsqueda). Útil para diagnóstico cuando encontrados=0. */
  query_usada?: string;
  /** Dominios/URLs que Gemini consultó vía Google Search grounding. */
  fuentes_consultadas?: string[];
  /** Cantidad de URLs descartadas por inválidas. Si > 0 y encontrados=0 → Gemini inventó perfiles. */
  urls_rotas?: number;
}

export function useSourcing() {
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscarCandidatos = useCallback(async (vacanteId: string): Promise<ResultadoBusqueda> => {
    setEjecutando(true);
    setError(null);
    try {
      // El cliente debe esperar AL MENOS lo que el servidor (timeoutSeconds 300).
      // Antes era 290s < 300s: en el peor caso útil, el cliente abortaba 10s
      // antes de que el servidor terminara, perdiendo un resultado válido. El
      // servidor se auto-limita a ~260s (presupuesto interno de Gemini 240s +
      // validación de URLs + escrituras), así que 300s da margen para recibirlo.
      const fn = httpsCallable<{ vacante_id: string }, ResultadoBusqueda>(
        functions,
        'buscarCandidatosIA',
        { timeout: 300_000 },
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
