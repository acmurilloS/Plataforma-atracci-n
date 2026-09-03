import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Button, Card } from '../brand';
import { TIPO_MOVIMIENTO_LABEL, type PostulacionDoc, type TipoMovimiento } from '../../schemas';

interface Props {
  postulacion: PostulacionDoc;
  /** Tipo por defecto (si la vacante ya se creó como movimiento interno). */
  tipoInicial?: TipoMovimiento | null;
  onClose: () => void;
  onDone?: (tipo: TipoMovimiento) => void;
}

const TIPOS: TipoMovimiento[] = ['vertical', 'horizontal', 'transversal'];

/**
 * MovimientoInternoModal · marca a una persona YA en el proceso como movimiento
 * interno (reu Karen sep-2026). Llama la callable `marcarMovimientoInterno`, que
 * la pasa directo a contratación saltando selección/terna: solo le pedirá el
 * reporte de novedad y la aceptación de condiciones (exámenes/aval opcionales).
 */
export function MovimientoInternoModal({ postulacion, tipoInicial, onClose, onDone }: Props) {
  const [tipo, setTipo] = useState<TipoMovimiento>(tipoInicial ?? 'horizontal');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function marcar() {
    setGuardando(true);
    setErr(null);
    try {
      const fn = httpsCallable<{ postulacion_id: string; tipo: TipoMovimiento }, { ok: true }>(
        functions,
        'marcarMovimientoInterno',
      );
      await fn({ postulacion_id: postulacion.id, tipo });
      onDone?.(tipo);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos marcar el movimiento interno.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" className="space-y-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Movimiento interno
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-text-strong">{postulacion.candidato_nombre}</h3>
            <p className="mt-1 text-[12px] text-text-muted leading-[1.5]">
              La persona ya es empleada y solo cambia de cargo. Al marcarla pasa <strong>directo a
              contratación</strong> (se saltan pruebas, entrevista y terna) y solo se le pedirá el{' '}
              <strong>reporte de novedad</strong> y la <strong>aceptación de condiciones</strong>. Los
              exámenes, el aval y la conexión/dotación quedan opcionales.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
              Tipo de movimiento
            </label>
            <div className="mt-2 space-y-2">
              {TIPOS.map((t) => (
                <label key={t} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="tipo_movimiento"
                    checked={tipo === t}
                    onChange={() => setTipo(t)}
                    disabled={guardando}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-300"
                  />
                  <span className="text-[13px] text-text-strong">{TIPO_MOVIMIENTO_LABEL[t]}</span>
                </label>
              ))}
            </div>
          </div>

          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="neutral-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="brand-primary" onClick={marcar} loading={guardando} disabled={guardando}>
              Marcar movimiento interno
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
