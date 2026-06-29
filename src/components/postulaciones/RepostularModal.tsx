import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useColeccion } from '../../hooks/useColeccion';
import { functions } from '../../lib/firebase';
import { Button, Card } from '../brand';
import type { PostulacionDoc, VacanteDoc } from '../../schemas';

/** Vacantes que aún reciben candidatos a su pool (espejo del backend). */
const ESTADOS_DESTINO = ['lista_para_publicar', 'publicada', 'en_proceso'];

interface Props {
  postulacion: PostulacionDoc;
  onClose: () => void;
  onDone?: (vacanteDestinoConsecutivo: string) => void;
}

/**
 * RepostularModal · mueve un candidato a otra vacante ACTIVA sin re-inscribirlo
 * (reu 26-jun). Lista las vacantes abiertas (menos la actual) y llama la callable
 * `repostularCandidato`, que crea la postulación en el destino y deja la de
 * origen como repostulada con traza.
 */
export function RepostularModal({ postulacion, onClose, onDone }: Props) {
  const { docs: vacantes, cargando } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', 'in', ESTADOS_DESTINO]],
  });
  const [destinoId, setDestinoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const opciones = useMemo(
    () =>
      vacantes
        .filter((v) => v.id !== postulacion.vacante_id)
        .sort((a, b) => (b.consecutivo ?? '').localeCompare(a.consecutivo ?? '')),
    [vacantes, postulacion.vacante_id],
  );

  async function repostular() {
    if (!destinoId) return;
    setEnviando(true);
    setErr(null);
    try {
      const fn = httpsCallable(functions, 'repostularCandidato');
      const res = (await fn({
        postulacion_origen_id: postulacion.id,
        vacante_destino_id: destinoId,
      })) as { data: { vacante_destino_consecutivo?: string } };
      onDone?.(res.data?.vacante_destino_consecutivo ?? '');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos repostular al candidato.');
    } finally {
      setEnviando(false);
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
              Repostular candidato
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-text-strong">
              {postulacion.candidato_nombre}
            </h3>
            <p className="mt-1 text-[12px] text-text-muted">
              Se mueve a otra vacante activa sin volver a registrarlo: queda activo en el destino y
              repostulado en {postulacion.vacante_consecutivo}.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
              Vacante destino
            </label>
            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              disabled={cargando || enviando}
              className="mt-1.5 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 disabled:opacity-60"
            >
              <option value="" disabled>
                {cargando ? 'Cargando vacantes…' : 'Selecciona una vacante activa'}
              </option>
              {opciones.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.consecutivo} · {v.cargo_nombre} ({v.empresa_codigo}/{v.sede_codigo})
                </option>
              ))}
            </select>
            {!cargando && opciones.length === 0 && (
              <p className="mt-1.5 text-[12px] text-text-subtle">
                No hay otras vacantes activas disponibles.
              </p>
            )}
          </div>

          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="neutral-secondary" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              variant="brand-primary"
              onClick={repostular}
              loading={enviando}
              disabled={enviando || !destinoId}
            >
              Repostular
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
