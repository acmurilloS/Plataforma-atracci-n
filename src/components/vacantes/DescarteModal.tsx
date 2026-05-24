import { useState } from 'react';
import { Modal } from '../ui';
import { motivoDescarte, MOTIVO_DESCARTE_LABEL, MOTIVOS_RECICLABLES, type MotivoDescarte } from '../../schemas';

interface Props {
  open: boolean;
  candidatoNombre: string;
  onClose: () => void;
  onConfirmar: (motivo: MotivoDescarte, notas: string) => void | Promise<void>;
}

/**
 * Modal para descarte tipificado.
 *
 * Pide al usuario un motivo del enum `motivoDescarte` (+ notas libres opcionales).
 * Sin tipificar es imposible agregar datos para el pool futuro (ATR-11).
 *
 * Visualmente separa los motivos "reciclables" (candidato podría volver al pool
 * para otra vacante) de los "duros" (no reciclar al menos por 1 año).
 */
export function DescarteModal({ open, candidatoNombre, onClose, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState<MotivoDescarte | ''>('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reciclables = motivoDescarte.options.filter((m) => MOTIVOS_RECICLABLES.has(m));
  const noReciclables = motivoDescarte.options.filter((m) => !MOTIVOS_RECICLABLES.has(m));

  async function confirmar() {
    if (!motivo) {
      setErr('Selecciona un motivo.');
      return;
    }
    if (motivo === 'otro' && notas.trim().length < 5) {
      setErr('Si marcas "Otro", agrega una nota explicando el motivo.');
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      await onConfirmar(motivo, notas.trim());
      setMotivo('');
      setNotas('');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos descartar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Descartar a ${candidatoNombre}`}
      description="El motivo se guarda tipificado para que el pool futuro pueda distinguir reciclables de no reciclables."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={enviando}
            className="rounded-md border border-navy-200 px-4 py-2 text-sm text-navy-700 hover:bg-cream-100"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={enviando || !motivo}
            className="rounded-md bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:bg-red-300"
          >
            {enviando ? '…' : 'Descartar'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-1">
            Motivos reciclables · candidato podría volver al pool
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {reciclables.map((m) => (
              <label
                key={m}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm ${
                  motivo === m
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-navy-100 hover:bg-cream-50'
                }`}
              >
                <input
                  type="radio"
                  name="motivo"
                  value={m}
                  checked={motivo === m}
                  onChange={() => setMotivo(m)}
                />
                <span>{MOTIVO_DESCARTE_LABEL[m]}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-700 mb-1">
            Motivos duros · no reciclar al menos por 1 año
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {noReciclables.map((m) => (
              <label
                key={m}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm ${
                  motivo === m
                    ? 'border-red-400 bg-red-50'
                    : 'border-navy-100 hover:bg-cream-50'
                }`}
              >
                <input
                  type="radio"
                  name="motivo"
                  value={m}
                  checked={motivo === m}
                  onChange={() => setMotivo(m)}
                />
                <span>{MOTIVO_DESCARTE_LABEL[m]}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-navy-800">
            Notas adicionales {motivo === 'otro' && <span className="text-red-600">*</span>}
          </span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            placeholder="Contexto adicional para auditoría / pool futuro."
          />
        </label>

        {err && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">{err}</div>
        )}
      </div>
    </Modal>
  );
}
