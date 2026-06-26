import { useState } from 'react';
import { X, Recycle, Ban } from 'lucide-react';
import { Modal } from '../ui';
import { Button } from '../brand';
import { motivoDescarte, MOTIVO_DESCARTE_LABEL, MOTIVOS_RECICLABLES, type MotivoDescarte } from '../../schemas';
import { cn } from '../../utils/cn';

interface Props {
  open: boolean;
  candidatoNombre: string;
  onClose: () => void;
  onConfirmar: (motivo: MotivoDescarte, notas: string) => void | Promise<void>;
}

/**
 * DescarteModal · sistema brand.
 *
 * Pide motivo tipificado del enum `motivoDescarte` (+ notas opcionales).
 * Separa visualmente reciclables (success) de duros (danger) para que el
 * analista entienda la consecuencia en el pool futuro (ATR-11).
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
      size="lg"
      footer={
        <>
          <Button variant="neutral-secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="destructive-primary"
            onClick={confirmar}
            disabled={enviando || !motivo}
            loading={enviando}
            icon={<X size={13} strokeWidth={1.75} />}
          >
            {enviando ? 'Descartando…' : 'Descartar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <GrupoMotivos
          titulo="Motivos reciclables · integrante podría volver al pool"
          icono={<Recycle size={11} strokeWidth={1.75} />}
          tono="success"
          motivos={reciclables}
          seleccionado={motivo}
          onSeleccionar={setMotivo}
        />

        <GrupoMotivos
          titulo="Motivos duros · no reciclar al menos por 1 año"
          icono={<Ban size={11} strokeWidth={1.75} />}
          tono="danger"
          motivos={noReciclables}
          seleccionado={motivo}
          onSeleccionar={setMotivo}
        />

        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-1.5">
            Notas adicionales{' '}
            {motivo === 'otro' && <span className="text-danger-700">*</span>}
          </span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className={cn(
              'block w-full bg-slate-50 border border-slate-200 rounded-md',
              'px-3 py-1.5 text-[12px] text-text-strong placeholder:text-text-subtle',
              'transition-colors duration-150 ease-out resize-y',
              'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
            )}
            placeholder="Contexto adicional para auditoría / pool futuro."
          />
        </label>

        {err && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-1.5 text-[12px] text-danger-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function GrupoMotivos({
  titulo,
  icono,
  tono,
  motivos,
  seleccionado,
  onSeleccionar,
}: {
  titulo: string;
  icono: React.ReactNode;
  tono: 'success' | 'danger';
  motivos: MotivoDescarte[];
  seleccionado: MotivoDescarte | '';
  onSeleccionar: (m: MotivoDescarte) => void;
}) {
  const tonoMap = {
    success: {
      header: 'text-success-700',
      activo: 'border-success-400 bg-success-50',
      radio: 'text-success-600',
    },
    danger: {
      header: 'text-danger-700',
      activo: 'border-danger-400 bg-danger-50',
      radio: 'text-danger-600',
    },
  } as const;
  const t = tonoMap[tono];

  return (
    <div>
      <p
        className={cn(
          'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5',
          t.header,
        )}
      >
        {icono}
        {titulo}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {motivos.map((m) => {
          const activo = seleccionado === m;
          return (
            <label
              key={m}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer text-[12px] transition-colors leading-tight',
                activo
                  ? t.activo
                  : 'border-slate-200 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name="motivo"
                value={m}
                checked={activo}
                onChange={() => onSeleccionar(m)}
                className={cn(
                  'w-3.5 h-3.5 border-slate-300 focus:ring-brand-300/40 shrink-0',
                  t.radio,
                )}
              />
              <span className={cn(activo ? 'text-text-strong font-medium' : 'text-text-body')}>
                {MOTIVO_DESCARTE_LABEL[m]}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
