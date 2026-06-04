import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export interface TecnicoInvitado {
  cedula: string;
  nombre: string;
  empresa: string;
  sede: string;
  cargo: string;
  celular_e164: string;
  mensaje_personalizado: string;
  wa_me_url: string;
  link_landing: string;
}

export interface ExcluidosSummary {
  opt_out: number;
  sin_celular: number;
  antiguedad: number;
  manual: number;
  otra_sede: number;
}

export interface ResultadoGeneracion {
  ok: true;
  generacion_id: string;
  total_en_sheet: number;
  tecnicos: TecnicoInvitado[];
  excluidos: ExcluidosSummary;
  mensaje_difusion: string | null;
  link_landing_difusion: string | null;
}

export interface InputGeneracion {
  vacante_id: string;
  modo: 'personal' | 'difusion';
  mensaje_template: 'v1' | 'v2' | 'v3' | 'custom';
  mensaje_custom?: string | null;
  cedulas_excluidas_manualmente?: string[];
}

export function useReferidos() {
  const [ejecutando, setEjecutando] = useState(false);

  const generar = useCallback(async (input: InputGeneracion): Promise<ResultadoGeneracion> => {
    setEjecutando(true);
    try {
      const fn = httpsCallable<InputGeneracion, ResultadoGeneracion>(
        functions,
        'generarInvitacionesReferidos',
        { timeout: 60_000 },
      );
      const res = await fn(input);
      return res.data;
    } finally {
      setEjecutando(false);
    }
  }, []);

  const marcarEnviadas = useCallback(async (generacionId: string) => {
    const fn = httpsCallable<{ generacion_id: string }, { ok: true; ya_estaba_marcada: boolean }>(
      functions,
      'marcarComoEnviadasReferidos',
    );
    const res = await fn({ generacion_id: generacionId });
    return res.data;
  }, []);

  return { generar, marcarEnviadas, ejecutando };
}
