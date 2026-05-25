import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { useVacantes } from '../../hooks/useVacantes';
import { Modal } from '../ui';
import { Button } from '../brand';

interface Props {
  vacanteId: string;
  onClose: () => void;
}

/**
 * VacanteCreadaModal · sistema brand.
 *
 * Modal de éxito con tono Apple-pro: hero del consecutivo en card glass
 * dark mini + CTAs brand. El consecutivo llega async desde la Cloud
 * Function (onVacanteCreate), de ahí el estado "generando…" con animación.
 */
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
      else
        setError(
          'El consecutivo todavía no está asignado. Intenta de nuevo en unos segundos.',
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos refrescar.');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Solicitud enviada"
      description="Tu vacante quedó registrada y GH la revisará pronto."
      size="md"
      footer={
        <>
          <Button variant="neutral-secondary" onClick={onClose}>
            Nueva solicitud
          </Button>
          <Button
            variant="brand-primary"
            disabled={!consecutivo}
            onClick={() => nav(`/vacantes/${vacanteId}`)}
          >
            Ver vacante →
          </Button>
        </>
      }
    >
      {/* Consecutivo hero — glass dark Apple pro */}
      <div className="brand-glass-dark rounded-brand-card px-6 py-8 text-center text-white relative overflow-hidden">
        {/* Glow decorativo */}
        <div
          aria-hidden
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(190,30,13,0.35) 0%, rgba(190,30,13,0) 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-2.5 py-0.5 mb-4">
            <Sparkles size={11} strokeWidth={1.75} className="text-brand-300" />
            <span className="text-[10px] font-bold tracking-[0.10em] uppercase text-brand-200">
              Consecutivo asignado
            </span>
          </div>
          {consecutivo ? (
            <p className="font-mono text-[36px] font-light tracking-[-0.02em] text-white">
              {consecutivo}
            </p>
          ) : (
            <p className="text-[13px] text-white/60 animate-pulse">
              Generando consecutivo…
            </p>
          )}
        </div>
      </div>

      {/* Estado check */}
      {consecutivo && (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-success-700">
          <CheckCircle2 size={14} strokeWidth={1.75} />
          <span>Cloud Function asignó el consecutivo correctamente.</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[12px] text-danger-700">
          {error}
        </div>
      )}

      {/* Refresco manual */}
      {!consecutivo && (
        <button
          type="button"
          onClick={forzarRefresco}
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2"
        >
          <RefreshCw size={12} strokeWidth={1.75} />
          Verificar ahora
        </button>
      )}
    </Modal>
  );
}
