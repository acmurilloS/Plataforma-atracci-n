import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Modal } from '../ui';
import { useSourcing } from '../../hooks/useSourcing';
import type { VacanteDoc } from '../../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompletado: (busquedaId: string, encontrados: number) => void;
  vacante: VacanteDoc;
}

export function BuscarCandidatosIAModal({ open, onClose, onCompletado, vacante }: Props) {
  const { buscarCandidatos, ejecutando } = useSourcing();
  const [error, setError] = useState<string | null>(null);
  const [resultadoVacio, setResultadoVacio] = useState(false);

  async function ejecutar() {
    setError(null);
    setResultadoVacio(false);
    try {
      const res = await buscarCandidatos(vacante.id);
      // Modo Clay: async, redirigir inmediato a SourcingPage que se suscribe al estado.
      if (res.modo === 'clay') {
        onCompletado(res.busqueda_id, 0);
        return;
      }
      // Modos síncronos (Gemini / dummy)
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
          <Button variant="ghost" onClick={onClose} disabled={ejecutando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={ejecutar} loading={ejecutando} icon={<Sparkles size={14} />}>
            {ejecutando ? 'Buscando…' : 'Buscar ahora'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-cream-50 border border-navy-100 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-navy-500 font-bold">Vacante</p>
          <p className="font-display text-base font-semibold text-navy-900">
            {vacante.cargo_nombre}
          </p>
          <p className="text-xs text-navy-600">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          {vacante.consecutivo && (
            <p className="text-[11px] text-navy-500 font-mono">{vacante.consecutivo}</p>
          )}
        </div>

        <ul className="text-xs text-navy-700 space-y-1.5 list-disc pl-5">
          <li>Los candidatos entran al sistema con estado <code>sourceado_por_ia</code>.</li>
          <li>Tú revisas cada uno y decides si avanza al flujo normal (paso 5).</li>
          <li>El primer contacto debe incluir un mensaje de opt-in claro (Habeas Data).</li>
          <li>La búsqueda toma entre 15 y 40 segundos. No cierres la ventana.</li>
        </ul>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {resultadoVacio && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">La búsqueda no encontró candidatos verificables.</p>
            <p>
              Esto suele pasar cuando los criterios del perfilamiento son genéricos. Vuelve al
              perfilamiento, agrega keywords concretas (años de experiencia, herramientas
              específicas, sectores) y reintenta.
            </p>
            <p>
              Las URLs inventadas por la IA fueron descartadas automáticamente. Cero candidatos
              significa que ninguna URL pasó la validación.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
