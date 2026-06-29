import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useColeccion } from '../../hooks/useColeccion';
import { functions } from '../../lib/firebase';
import { Button, Card } from '../brand';
import type { DatosBasicosIntegranteDoc } from '../../schemas';

const TALLAS = [
  { key: 'talla_calzado', label: 'Calzado' },
  { key: 'talla_pantalon', label: 'Pantalón' },
  { key: 'talla_chaleco', label: 'Chaleco' },
  { key: 'talla_guantes', label: 'Guantes' },
  { key: 'talla_overol', label: 'Overol' },
  { key: 'talla_camisa_blusa', label: 'Camisa / blusa' },
  { key: 'talla_otros', label: 'Otros' },
] as const;
type TallaKey = (typeof TALLAS)[number]['key'];

const INPUT =
  'w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500';

const vacio = () => Object.fromEntries(TALLAS.map((t) => [t.key, ''])) as Record<TallaKey, string>;

interface Props {
  postulacionId: string;
  candidatoNombre: string;
  cargoNombre: string;
  yaEnviada?: boolean;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * DotacionModal · subpaso de entrega de carpeta (reu 26-jun). Trae las tallas de
 * Datos Básicos (editables aquí) y dispara la callable enviarSolicitudDotacion,
 * que las manda a compras/gestores con reply-to al analista. Solo se abre para
 * cargos que requieren dotación.
 */
export function DotacionModal({
  postulacionId,
  candidatoNombre,
  cargoNombre,
  yaEnviada,
  onClose,
  onDone,
}: Props) {
  const { docs } = useColeccion<DatosBasicosIntegranteDoc>('datos_basicos_integrante', {
    filtros: [['postulacion_id', '==', postulacionId]],
  });
  const dato = docs[0];
  const [tallas, setTallas] = useState<Record<TallaKey, string>>(vacio);
  const [obs, setObs] = useState('');
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (dato && !listo) {
      setTallas(
        Object.fromEntries(TALLAS.map((t) => [t.key, String(dato[t.key] ?? '')])) as Record<
          TallaKey,
          string
        >,
      );
      setListo(true);
    }
  }, [dato, listo]);

  async function enviar() {
    setEnviando(true);
    setErr(null);
    try {
      const fn = httpsCallable(functions, 'enviarSolicitudDotacion');
      await fn({ postulacion_id: postulacionId, tallas, observaciones: obs });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos enviar la solicitud de dotación.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" className="space-y-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Solicitud de dotación
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-text-strong">{candidatoNombre}</h3>
            <p className="mt-0.5 text-[12px] text-text-muted">
              {cargoNombre} · las tallas vienen de Datos Básicos; corrígelas aquí si cambiaron antes
              de enviar a compras/gestores.
            </p>
          </div>

          {yaEnviada && (
            <div className="rounded-md border border-success-500/30 bg-success-50 px-3.5 py-2 text-[12px] text-success-700">
              Ya se envió una solicitud de dotación para este integrante. Puedes reenviarla con las
              tallas corregidas.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TALLAS.map((t) => (
              <label key={t.key} className="block">
                <span className="block text-[10px] font-bold tracking-[0.06em] uppercase text-text-subtle mb-1">
                  {t.label}
                </span>
                <input
                  value={tallas[t.key]}
                  onChange={(e) => setTallas((s) => ({ ...s, [t.key]: e.target.value }))}
                  className={INPUT}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="block text-[10px] font-bold tracking-[0.06em] uppercase text-text-subtle mb-1">
              Observaciones (opcional)
            </span>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className={`${INPUT} resize-y`}
            />
          </label>

          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="neutral-secondary" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button variant="brand-primary" onClick={enviar} loading={enviando} disabled={enviando}>
              {yaEnviada ? 'Reenviar a compras/gestores' : 'Enviar a compras/gestores'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
