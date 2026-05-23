import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVacantes } from '../../hooks/useVacantes';
import { Button, Modal } from '../ui';

interface Props {
  vacanteId: string;
  onClose: () => void;
}

export function VacanteCreadaModal({ vacanteId, onClose }: Props) {
  const { suscribirVacante, obtenerVacante } = useVacantes();
  const nav = useNavigate();
  const [consecutivo, setConsecutivo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = suscribirVacante(
      vacanteId,
      (v) => {
        if (v.consecutivo) setConsecutivo(v.consecutivo);
      },
      (msg) => setError(msg),
    );
    return unsub;
  }, [vacanteId, suscribirVacante]);

  async function forzarRefresco() {
    setError(null);
    try {
      const v = await obtenerVacante(vacanteId);
      if (v?.consecutivo) setConsecutivo(v.consecutivo);
      else setError('El consecutivo todavía no está asignado. Intenta de nuevo en unos segundos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos refrescar.');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Solicitud enviada"
      description="Tu vacante quedó registrada. Consecutivo asignado:"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Nueva solicitud
          </Button>
          <Button
            variant="primary"
            disabled={!consecutivo}
            onClick={() => nav(`/vacantes/${vacanteId}`)}
          >
            Ver vacante
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-gradient-to-br from-equitel-rojo-50 to-equitel-rojo-100 px-6 py-5 text-center">
        {consecutivo ? (
          <span className="font-mono text-3xl font-bold tracking-wide text-equitel-rojo-800">
            {consecutivo}
          </span>
        ) : (
          <span className="text-sm text-navy-600 animate-pulse">Generando consecutivo…</span>
        )}
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}
      {!consecutivo && (
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          className="mt-3"
          onClick={forzarRefresco}
        >
          Verificar ahora
        </Button>
      )}
    </Modal>
  );
}
