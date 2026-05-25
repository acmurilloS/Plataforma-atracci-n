import { useState } from 'react';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { Modal } from '../ui';
import { Button, Pill } from '../brand';
import { useSourcing } from '../../hooks/useSourcing';
import type { VacanteDoc } from '../../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompletado: (busquedaId: string, encontrados: number) => void;
  vacante: VacanteDoc;
}

/**
 * BuscarCandidatosIAModal · sistema brand.
 *
 * Modal de confirmación previo a disparar Gemini con grounding (paso 4.5).
 * Muestra preview de la vacante + reglas operativas + advertencia habeas data.
 */
export function BuscarCandidatosIAModal({ open, onClose, onCompletado, vacante }: Props) {
  const { buscarCandidatos, ejecutando } = useSourcing();
  const [error, setError] = useState<string | null>(null);
  const [resultadoVacio, setResultadoVacio] = useState(false);

  async function ejecutar() {
    setError(null);
    setResultadoVacio(false);
    try {
      const res = await buscarCandidatos(vacante.id);
      if (res.modo === 'clay') {
        onCompletado(res.busqueda_id, 0);
        return;
      }
      if (res.encontrados === 0) {
        setResultadoVacio(true);
        return;
      }
      onCompletado(res.busqueda_id, res.encontrados ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos ejecutar la búsqueda.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Buscar candidatos con IA"
      description="Gemini hará deep research sobre perfiles públicos y devolverá hasta 15 personas que coincidan con esta vacante."
      footer={
        <>
          <Button variant="neutral-secondary" onClick={onClose} disabled={ejecutando}>
            Cancelar
          </Button>
          <Button
            variant="brand-primary"
            onClick={ejecutar}
            loading={ejecutando}
            disabled={ejecutando}
            icon={<Sparkles size={13} strokeWidth={1.75} />}
          >
            {ejecutando ? 'Buscando…' : 'Buscar ahora'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Preview vacante */}
        <div className="rounded-md bg-brand-50/40 border border-brand-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-brand-700 mb-1.5">
            Vacante
          </p>
          <p className="text-[15px] font-semibold tracking-[-0.012em] text-text-strong">
            {vacante.cargo_nombre}
          </p>
          <p className="text-[12px] text-text-muted mt-0.5">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          {vacante.consecutivo && (
            <p className="text-[11px] text-text-subtle font-mono mt-1">{vacante.consecutivo}</p>
          )}
        </div>

        {/* Reglas operativas */}
        <ul className="space-y-1.5">
          {[
            <>
              Los candidatos entran con estado{' '}
              <Pill tono="brand">sourceado_por_ia</Pill>.
            </>,
            <>Tú revisas cada uno y decides si avanza al flujo normal (paso 5).</>,
            <>El primer contacto debe incluir un mensaje de opt-in claro (Habeas Data).</>,
            <>La búsqueda toma entre 15 y 40 segundos. No cierres la ventana.</>,
          ].map((txt, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[12px] text-text-body leading-[1.5]"
            >
              <span className="w-1 h-1 rounded-full bg-text-subtle mt-1.5 shrink-0" />
              <span>{txt}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-[12px] text-danger-700 inline-flex items-start gap-2">
            <X size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {resultadoVacio && (
          <div className="rounded-md border border-warning-500/30 bg-warning-50/60 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={14}
                strokeWidth={1.75}
                className="text-warning-700 mt-0.5 shrink-0"
              />
              <div className="flex-1 space-y-1.5 text-[12px] text-warning-700">
                <p className="font-semibold">La búsqueda no encontró candidatos verificables.</p>
                <p className="leading-[1.5]">
                  Esto suele pasar cuando los criterios del perfilamiento son genéricos. Vuelve al
                  perfilamiento, agrega keywords concretas (años de experiencia, herramientas
                  específicas, sectores) y reintenta.
                </p>
                <p className="leading-[1.5]">
                  Las URLs inventadas por la IA fueron descartadas automáticamente. Cero candidatos
                  significa que ninguna URL pasó la validación.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
