import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, Send } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { Button } from '../brand';
import { AvalUploader } from './AvalUploader';
import { CamposCondiciones } from './CamposCondiciones';
import { formatearFecha } from '../../utils/fechas';
import { tieneRodamiento } from '../../utils/rodamiento';
import { motivosAval, textoMotivoAval } from '../../utils/avalSolicitud';
import { mensajeErrorFuncion } from '../../utils/errores';
import {
  condicionesDesdeVacante,
  validarCondiciones,
  type CondicionesForm,
} from '../../utils/condicionesForm';
import type { VacanteDoc } from '../../schemas';

/**
 * CorregirSolicitudModal · reu Karen + Diego 08-oct.
 *
 * Cuando GH devuelve una solicitud (estado `devuelta`), el líder la corrige aquí
 * y la reenvía: conserva el consecutivo y el historial, vuelve a "Pendientes" de
 * GH y a Diego le llega el correo con lo que cambió. Coordinación también puede
 * hacerlo en nombre del líder. La escritura la hace la callable
 * `reenviarSolicitudVacante` (los líderes no escriben vacantes directamente).
 *
 * Aquí van condiciones, justificación y aval; la identificación (sede, tipo de
 * solicitud, a quién reemplaza) se corrige con "Editar" en el detalle.
 */

const textareaClass =
  'mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 resize-y disabled:bg-slate-50';

interface Props {
  vacante: VacanteDoc;
  onClose: () => void;
}

type Respuesta = { cambios: string[]; correo: string };

export function CorregirSolicitudModal({ vacante: v, onClose }: Props) {
  const [form, setForm] = useState<CondicionesForm>(() => condicionesDesdeVacante(v));
  const [justificacion, setJustificacion] = useState(v.justificacion ?? '');
  const [aval, setAval] = useState<{ url: string; driveFileId: string }>({
    url: v.aval_url ?? '',
    driveFileId: v.aval_drive_file_id ?? '',
  });
  const [noRequiereAval, setNoRequiereAval] = useState(Boolean(v.aval_no_requiere));
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState<Respuesta | null>(null);

  const rodamientoSinValorPrevio = Boolean(v.rodamiento) && !tieneRodamiento(v.rodamiento_valor);
  // Aval obligatorio (reu 08-oct): aumento de planta o reemplazo con cambio.
  const motivos = motivosAval(v);
  const avalObligatorio = motivos.length > 0;
  const devueltaEn = v.devuelta_en?.toDate?.() ?? null;

  async function reenviar() {
    const r = validarCondiciones(form, { rodamientoSinValorPrevio, exigirContrato: true });
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    if (justificacion.trim().length < 20) {
      setErr('La justificación debe tener al menos 20 caracteres.');
      return;
    }
    if (avalObligatorio && !aval.url) {
      setErr(`${textoMotivoAval(motivos)}: adjunta el aval firmado antes de reenviar.`);
      return;
    }
    const sinAval = noRequiereAval && !avalObligatorio;
    setEnviando(true);
    setErr(null);
    try {
      const fn = httpsCallable<unknown, Respuesta>(functions, 'reenviarSolicitudVacante');
      const res = await fn({
        vacante_id: v.id,
        nota: nota.trim(),
        cambios: {
          ...r.patch,
          justificacion: justificacion.trim(),
          aval_no_requiere: sinAval,
          aval_url: sinAval ? '' : aval.url,
          aval_drive_file_id: sinAval ? '' : aval.driveFileId,
        },
      });
      setListo(res.data);
    } catch (e) {
      setErr(mensajeErrorFuncion(e, 'No pudimos reenviar la solicitud.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-4 py-6 overflow-y-auto"
      onClick={() => !enviando && onClose()}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {listo ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-success-50 text-success-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} strokeWidth={1.75} />
            </div>
            <h2 className="text-[17px] font-semibold text-text-strong">Solicitud reenviada a GH</h2>
            <p className="text-[13px] text-text-muted leading-[1.55] max-w-sm mx-auto">
              <span className="font-mono">{v.consecutivo}</span> volvió a revisión de Cultura y
              Desarrollo con el mismo consecutivo.
              {listo.correo === 'enviado'
                ? ' A Diego le llegó el correo con lo que cambiaste.'
                : ' Quedó en Aprobaciones; el correo a GH no salió, coordinación ya está avisada.'}
            </p>
            {listo.cambios.length > 0 && (
              <ul className="text-left text-[12px] text-text-body bg-slate-50 border border-slate-200 rounded-md px-4 py-3 space-y-1 max-w-md mx-auto">
                {listo.cambios.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            )}
            <div className="pt-2">
              <Button variant="brand-primary" onClick={onClose}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-[16px] font-semibold text-text-strong">Corregir y reenviar a GH</h2>
            <p className="mt-1 text-[12px] text-text-muted leading-[1.5]">
              Ajusta lo que pidió Gestión Humana y reenvía la solicitud{' '}
              <span className="font-mono">{v.consecutivo}</span>. Conserva el mismo consecutivo; no
              hace falta crear una vacante nueva.
            </p>

            {/* Motivo de la devolución */}
            <div className="mt-4 rounded-md border border-danger-500/30 bg-danger-50/50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-danger-700">
                Motivo de la devolución
                {v.devuelta_por_nombre ? ` · ${v.devuelta_por_nombre}` : ''}
                {devueltaEn ? ` · ${formatearFecha(devueltaEn)}` : ''}
              </p>
              <p className="mt-1 text-[13px] text-text-strong whitespace-pre-line leading-relaxed">
                {v.aval_rechazo_motivo?.trim() || 'Sin motivo registrado.'}
              </p>
            </div>

            <div className="mt-5 space-y-5">
              <CamposCondiciones
                form={form}
                onChange={(c) => setForm((p) => ({ ...p, ...c }))}
                disabled={enviando}
              />

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Justificación
                </span>
                <textarea
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  disabled={enviando}
                  rows={3}
                  className={textareaClass}
                />
              </label>

              <div className="space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Aval firmado
                </span>
                {avalObligatorio ? (
                  <p className="text-[12px] text-danger-700 leading-[1.5]">
                    <span className="font-semibold">Obligatorio.</span> {textoMotivoAval(motivos)}: sin
                    el aval firmado no se puede reenviar.
                  </p>
                ) : (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noRequiereAval}
                      onChange={(e) => setNoRequiereAval(e.target.checked)}
                      disabled={enviando}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
                    />
                    <span className="text-[13px] text-text-body leading-[1.5]">
                      Este cargo no requiere aval (p. ej. un reemplazo en las mismas condiciones).
                    </span>
                  </label>
                )}
                {(!noRequiereAval || avalObligatorio) && (
                  <AvalUploader
                    empresaCodigo={v.empresa_codigo}
                    value={aval.url || undefined}
                    driveFileId={aval.driveFileId || undefined}
                    onChange={(info) => setAval({ url: info?.url ?? '', driveFileId: info?.driveFileId ?? '' })}
                    disabled={enviando}
                  />
                )}
              </div>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Nota para GH <span className="normal-case font-normal">(qué corregiste o por qué se mantiene)</span>
                </span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  disabled={enviando}
                  rows={2}
                  maxLength={1500}
                  placeholder="Ej.: ajusté el básico a $1.750.905 y adjunté el aval."
                  className={textareaClass}
                />
              </label>

              <p className="text-[11px] text-text-subtle leading-[1.5]">
                ¿Hay que cambiar la sede, el tipo de solicitud o a quién reemplaza? Usa «Editar» en
                Identificación (en el detalle) antes de reenviar.
              </p>
            </div>

            {err && <p className="mt-4 text-[12px] text-danger-700">{err}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="neutral-secondary" onClick={onClose} disabled={enviando}>
                Cancelar
              </Button>
              <Button
                variant="brand-primary"
                onClick={reenviar}
                disabled={enviando}
                loading={enviando}
                icon={<Send size={13} strokeWidth={1.75} />}
              >
                {enviando ? 'Reenviando…' : 'Reenviar a GH'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
