import { useState } from 'react';
import { useMutacion } from '../../hooks/useMutacion';
import { Button, Card } from '../brand';
import type { PostulacionDoc } from '../../schemas';

interface Props {
  postulacion: PostulacionDoc;
  onClose: () => void;
  onDone?: (marcada: boolean) => void;
}

/**
 * MarcarDiscapacidadModal · marca (o desmarca) desde Seguimiento que el candidato
 * es persona en condición de discapacidad + el tipo/observación (reu Karen
 * jul-2026). Escribe en la postulación (lo lee el flujo de exámenes) y espeja al
 * candidato (persona). Cuando queda marcada, la orden de exámenes NO sale sola a
 * los gestores: GH la autoriza; y la carpeta suma el certificado de discapacidad.
 */
export function MarcarDiscapacidadModal({ postulacion, onClose, onDone }: Props) {
  const { actualizar } = useMutacion();
  const [marcada, setMarcada] = useState<boolean>(Boolean(postulacion.discapacidad));
  const [obs, setObs] = useState<string>(postulacion.discapacidad_observacion ?? '');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setErr(null);
    try {
      const observacion = marcada ? obs.trim() : '';
      await actualizar('postulaciones', postulacion.id, {
        discapacidad: marcada,
        discapacidad_observacion: observacion,
      });
      // Espejo a la persona (best-effort: la fuente que lee el flujo es la postulación).
      if (postulacion.candidato_id) {
        try {
          await actualizar('candidatos', postulacion.candidato_id, {
            discapacidad: marcada,
            discapacidad_observacion: observacion,
          });
        } catch (e) {
          console.warn('[discapacidad] no se pudo espejar al candidato', e);
        }
      }
      onDone?.(marcada);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar la marca.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" className="space-y-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Condición de discapacidad
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-text-strong">
              {postulacion.candidato_nombre}
            </h3>
            <p className="mt-1 text-[12px] text-text-muted">
              Al marcarla, la orden de exámenes queda a la espera del visto bueno de Gestión Humana
              antes de ir a los gestores SST, y la carpeta suma el certificado de discapacidad.
            </p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={marcada}
              onChange={(e) => setMarcada(e.target.checked)}
              disabled={guardando}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
            />
            <span className="text-[13px] text-text-strong">
              Es persona en condición de discapacidad
            </span>
          </label>

          {marcada && (
            <div>
              <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
                Tipo / observación
              </label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                disabled={guardando}
                rows={3}
                placeholder="Ej.: discapacidad auditiva; requiere intérprete para la orden…"
                className="mt-1.5 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
              <p className="mt-1 text-[11px] text-text-subtle">
                Dato sensible. Se comparte con los gestores SST para tramitar la orden.
              </p>
            </div>
          )}

          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="neutral-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="brand-primary" onClick={guardar} loading={guardando} disabled={guardando}>
              Guardar
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
