import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/**
 * Hook simplificado v1 (decisión JC 2026-06-04):
 * solo registra cuándo Karen activó referidos para una vacante y con qué
 * plantilla. No genera lista de técnicos ni lee Sheet.
 */
export interface MarcarReferidosInput {
  vacante_id: string;
  plantilla: 'v1' | 'v2' | 'v3' | 'custom';
  mensaje_usado: string;
  link_landing: string;
}

export function useReferidos() {
  const [ejecutando, setEjecutando] = useState(false);

  const marcarEnviadas = useCallback(async (input: MarcarReferidosInput) => {
    setEjecutando(true);
    try {
      const fn = httpsCallable<
        MarcarReferidosInput,
        { ok: true; generacion_id: string }
      >(functions, 'marcarComoEnviadasReferidos');
      const res = await fn(input);
      return res.data;
    } finally {
      setEjecutando(false);
    }
  }, []);

  return { marcarEnviadas, ejecutando };
}
