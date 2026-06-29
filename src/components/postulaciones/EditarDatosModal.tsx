import { useEffect, useState, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useDoc } from '../../hooks/useDoc';
import { functions } from '../../lib/firebase';
import { Button, Card } from '../brand';
import type { CandidatoDoc } from '../../schemas';

const DOC_TIPOS = ['CC', 'CE', 'PA', 'PEP', 'NIT'];
// De exámenes en adelante, corregir cédula/nombre aquí ya impacta nómina/contrato.
const ESTADOS_SENSIBLES = [
  'en_examenes_medicos',
  'descartado_examenes_medicos',
  'en_contratacion',
  'contratado',
];

const INPUT =
  'w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500';

interface Props {
  candidatoId: string;
  postulacionId: string;
  postulacionEstado: string;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * EditarDatosModal · corrige los datos de registro del candidato/integrante
 * (cédula, nombre, contacto) — reu 26-jun. Llama la callable editarDatosCandidato
 * (valida + re-denormaliza en postulaciones + auditoría en eventos). El candidato
 * NO accede a esta pantalla; solo el staff/analista.
 */
export function EditarDatosModal({
  candidatoId,
  postulacionId,
  postulacionEstado,
  onClose,
  onDone,
}: Props) {
  const { doc: cand } = useDoc<CandidatoDoc>('candidatos', candidatoId);
  const [form, setForm] = useState({
    nombres: '',
    apellidos: '',
    documento_tipo: '',
    documento_numero: '',
    email: '',
    telefono: '',
  });
  const [listo, setListo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (cand && !listo) {
      setForm({
        nombres: cand.nombres ?? '',
        apellidos: cand.apellidos ?? '',
        documento_tipo: cand.documento_tipo ?? '',
        documento_numero: cand.documento_numero ?? '',
        email: cand.email ?? '',
        telefono: cand.telefono ?? '',
      });
      setListo(true);
    }
  }, [cand, listo]);

  const sensible = ESTADOS_SENSIBLES.includes(postulacionEstado);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function guardar() {
    setGuardando(true);
    setErr(null);
    try {
      const fn = httpsCallable(functions, 'editarDatosCandidato');
      await fn({
        candidato_id: candidatoId,
        postulacion_id: postulacionId,
        datos: {
          nombres: form.nombres,
          apellidos: form.apellidos,
          documento_tipo: form.documento_tipo || null,
          documento_numero: form.documento_numero,
          email: form.email,
          telefono: form.telefono,
        },
      });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar los cambios.');
    } finally {
      setGuardando(false);
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
              Editar datos del candidato
            </p>
            <p className="mt-1 text-[12px] text-text-muted">
              Corrige datos de registro (cédula, nombre, contacto). Queda registrado quién editó y
              qué cambió.
            </p>
          </div>

          {sensible && (
            <div className="rounded-md border border-warning-500/30 bg-warning-50 px-3.5 py-2.5 text-[12px] text-warning-700">
              ⚠️ Este candidato ya está en exámenes/contratación. Corregir cédula, nombre o contacto
              aquí impacta nómina y contrato: confirma el dato antes de guardar.
            </div>
          )}

          {!listo ? (
            <p className="text-[13px] text-text-muted">Cargando datos…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="Nombres">
                <input value={form.nombres} onChange={(e) => set('nombres', e.target.value)} className={INPUT} />
              </Campo>
              <Campo label="Apellidos">
                <input
                  value={form.apellidos}
                  onChange={(e) => set('apellidos', e.target.value)}
                  className={INPUT}
                />
              </Campo>
              <Campo label="Tipo de documento">
                <select
                  value={form.documento_tipo}
                  onChange={(e) => set('documento_tipo', e.target.value)}
                  className={INPUT}
                >
                  <option value="">—</option>
                  {DOC_TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Número de documento">
                <input
                  value={form.documento_numero}
                  onChange={(e) => set('documento_numero', e.target.value)}
                  className={INPUT}
                />
              </Campo>
              <Campo label="Correo">
                <input value={form.email} onChange={(e) => set('email', e.target.value)} className={INPUT} />
              </Campo>
              <Campo label="Teléfono">
                <input
                  value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                  className={INPUT}
                />
              </Campo>
            </div>
          )}

          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="neutral-secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              variant="brand-primary"
              onClick={guardar}
              loading={guardando}
              disabled={guardando || !listo || !form.nombres.trim() || !form.apellidos.trim()}
            >
              Guardar cambios
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
