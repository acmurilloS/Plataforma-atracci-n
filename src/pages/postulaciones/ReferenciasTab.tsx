import { useState, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { CheckCircle2, ClipboardList, Phone, Plus } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import type {
  PostulacionDoc,
  ReferenciaDoc,
  ResultadoReferencia,
  Recontrataria,
  RelacionLaboral,
} from '../../schemas';

/**
 * ReferenciasTab · sistema brand.
 *
 * Verificación de referencias laborales (paso 9 · VIDA-F-12 v2).
 * Card por cada referencia con eyebrow estado + cuestionario expandible.
 */

interface Props {
  postulacion: PostulacionDoc;
}

const RELACION_OPCIONES: { value: RelacionLaboral; label: string }[] = [
  { value: 'jefe_directo', label: 'Jefe directo' },
  { value: 'jefe_indirecto', label: 'Jefe indirecto' },
  { value: 'par', label: 'Par / compañero' },
  { value: 'subordinado', label: 'Subordinado' },
  { value: 'cliente_interno', label: 'Cliente interno' },
  { value: 'otro', label: 'Otro' },
];

const RECONTRATARIA_OPCIONES: { value: Recontrataria; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'con_reservas', label: 'Con reservas' },
];

const RESULTADO_OPCIONES: { value: ResultadoReferencia; label: string; tono: PillTono }[] = [
  { value: 'positiva', label: 'Positiva', tono: 'success' },
  { value: 'neutra', label: 'Neutra', tono: 'warning' },
  { value: 'negativa', label: 'Negativa', tono: 'danger' },
];

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

const textareaClass = inputClass + ' resize-none leading-relaxed';

export function ReferenciasTab({ postulacion }: Props) {
  const { docs } = useColeccion<ReferenciaDoc>('referencias', {
    filtros: [['postulacion_id', '==', postulacion.id]],
    orden: ['creado_en', 'asc'],
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil } = useAuth();

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [verificarAbierto, setVerificarAbierto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Phone size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Verificación de referencias · paso 9
            </p>
          </div>
          <p className="text-[12px] text-text-subtle mt-1 italic">
            Formato VIDA-F-12 v2 · {docs.length}{' '}
            {docs.length === 1 ? 'referencia' : 'referencias'}
          </p>
        </div>
        <Button
          variant="brand-primary"
          onClick={() => setCrearAbierto(true)}
          icon={<Plus size={13} strokeWidth={1.75} />}
        >
          Nueva referencia
        </Button>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}

      {crearAbierto && (
        <NuevaReferenciaForm
          postulacion={postulacion}
          onCancelar={() => setCrearAbierto(false)}
          onCreada={() => {
            setCrearAbierto(false);
            setErr(null);
          }}
          onError={(msg) => setErr(msg)}
          crear={crear}
          uid={user?.uid ?? ''}
        />
      )}

      {docs.length === 0 && !crearAbierto && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[15px] font-medium text-text-strong">Sin referencias todavía</p>
          <p className="text-[12px] text-text-muted mt-1">
            Agrega al menos 2 referencias laborales del candidato.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {docs.map((r) => (
          <ReferenciaCard
            key={r.id}
            referencia={r}
            verificandoAbierto={verificarAbierto === r.id}
            onAbrirVerificar={() => setVerificarAbierto(r.id)}
            onCerrarVerificar={() => setVerificarAbierto(null)}
            actualizar={actualizar}
            uid={user?.uid ?? ''}
            verificadorNombre={perfil ? `${perfil.nombre} ${perfil.apellido}` : null}
            onError={(msg) => setErr(msg)}
          />
        ))}
      </div>
    </div>
  );
}

interface CrearProps {
  postulacion: PostulacionDoc;
  onCancelar: () => void;
  onCreada: () => void;
  onError: (msg: string) => void;
  crear: ReturnType<typeof useMutacion>['crear'];
  uid: string;
}

function NuevaReferenciaForm({
  postulacion,
  onCancelar,
  onCreada,
  onError,
  crear,
}: CrearProps) {
  const [form, setForm] = useState({
    empresa_contactada: '',
    nombre_contacto: '',
    cargo_contacto: '',
    telefono_contacto: '',
    email_contacto: '',
    cargo_aspirante: '',
    tiempo_laborado: '',
    rango_salarial: '',
    relacion_laboral: 'jefe_directo' as RelacionLaboral,
  });
  const [guardando, setGuardando] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await crear('referencias', {
        ...form,
        postulacion_id: postulacion.id,
        candidato_id: postulacion.candidato_id,
        candidato_nombre: postulacion.candidato_nombre,
        verificada: false,
        verificada_en: null,
        verificada_por_uid: null,
        verificada_por_nombre: null,
        funciones_responsabilidades: '',
        fortalezas_caracteristicas: '',
        logros: '',
        areas_mejora: '',
        descripcion_desempeno: '',
        recontrataria: null,
        recontrataria_porque: '',
        motivo_retiro: '',
        observaciones: '',
        resultado: null,
      });
      onCreada();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card padding="lg">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong">
            Nueva referencia
          </h4>
          <Pill tono="neutral">Datos previos al contacto</Pill>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-2">
            Contacto en la empresa
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Empresa contactada"
              required
              value={form.empresa_contactada}
              onChange={(v) => setForm({ ...form, empresa_contactada: v })}
            />
            <Field
              label="Nombre del contacto"
              required
              value={form.nombre_contacto}
              onChange={(v) => setForm({ ...form, nombre_contacto: v })}
            />
            <Field
              label="Cargo del contacto"
              value={form.cargo_contacto}
              onChange={(v) => setForm({ ...form, cargo_contacto: v })}
            />
            <SelectField
              label="Relación laboral con el aspirante"
              value={form.relacion_laboral}
              onChange={(v) => setForm({ ...form, relacion_laboral: v as RelacionLaboral })}
              options={RELACION_OPCIONES.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Field
              label="Teléfono"
              required
              value={form.telefono_contacto}
              onChange={(v) => setForm({ ...form, telefono_contacto: v })}
            />
            <Field
              label="Email"
              type="email"
              value={form.email_contacto}
              onChange={(v) => setForm({ ...form, email_contacto: v })}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-2">
            Contexto del aspirante en esa empresa
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field
              label="Cargo del aspirante"
              value={form.cargo_aspirante}
              onChange={(v) => setForm({ ...form, cargo_aspirante: v })}
              placeholder="ej. Ejecutivo de cuenta"
            />
            <Field
              label="Tiempo laborado"
              value={form.tiempo_laborado}
              onChange={(v) => setForm({ ...form, tiempo_laborado: v })}
              placeholder="ej. 3 años 6 meses"
            />
            <Field
              label="Rango salarial"
              value={form.rango_salarial}
              onChange={(v) => setForm({ ...form, rango_salarial: v })}
              placeholder="ej. $4M – $5M"
            />
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="neutral-secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand-primary" disabled={guardando} loading={guardando}>
            {guardando ? 'Guardando…' : 'Guardar referencia'}
          </Button>
        </div>
        <p className="text-[11px] text-text-subtle">
          Después de guardar, llamas a la referencia y diligencias el cuestionario VIDA-F-12 con el
          botón "Verificar".
        </p>
      </form>
    </Card>
  );
}

interface CardProps {
  referencia: ReferenciaDoc;
  verificandoAbierto: boolean;
  onAbrirVerificar: () => void;
  onCerrarVerificar: () => void;
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
  uid: string;
  verificadorNombre: string | null;
  onError: (msg: string) => void;
}

function ReferenciaCard({
  referencia: r,
  verificandoAbierto,
  onAbrirVerificar,
  onCerrarVerificar,
  actualizar,
  uid,
  verificadorNombre,
  onError,
}: CardProps) {
  const resultadoOpt = RESULTADO_OPCIONES.find((o) => o.value === r.resultado);

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong">
              {r.empresa_contactada}
            </h4>
            {r.verificada && resultadoOpt ? (
              <Pill tono={resultadoOpt.tono} dot>
                ✓ {resultadoOpt.label}
              </Pill>
            ) : (
              <Pill tono="warning" dot>
                Pendiente verificar
              </Pill>
            )}
          </div>
          <p className="text-[13px] text-text-body mt-1">
            {r.nombre_contacto}
            {r.cargo_contacto && <span className="text-text-muted"> · {r.cargo_contacto}</span>}
          </p>
          <p className="text-[12px] text-text-muted">
            {r.telefono_contacto}
            {r.email_contacto && <span> · {r.email_contacto}</span>}
          </p>
          {(r.cargo_aspirante || r.tiempo_laborado || r.rango_salarial) && (
            <p className="text-[12px] text-text-muted mt-2">
              <span className="font-semibold text-text-body">Aspirante: </span>
              {[r.cargo_aspirante, r.tiempo_laborado, r.rango_salarial].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {!r.verificada && !verificandoAbierto && (
          <Button
            variant="brand-primary"
            size="small"
            onClick={onAbrirVerificar}
            icon={<ClipboardList size={11} strokeWidth={1.75} />}
          >
            Verificar
          </Button>
        )}
      </div>

      {r.verificada && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-[13px]">
          {r.funciones_responsabilidades && (
            <Detalle label="Funciones" valor={r.funciones_responsabilidades} />
          )}
          {r.fortalezas_caracteristicas && (
            <Detalle label="Fortalezas" valor={r.fortalezas_caracteristicas} />
          )}
          {r.logros && <Detalle label="Logros" valor={r.logros} />}
          {r.areas_mejora && <Detalle label="Áreas de mejora" valor={r.areas_mejora} />}
          {r.descripcion_desempeno && (
            <Detalle label="Desempeño" valor={r.descripcion_desempeno} />
          )}
          {r.recontrataria !== null && (
            <Detalle
              label="¿Lo contrataría otra vez?"
              valor={`${
                RECONTRATARIA_OPCIONES.find((o) => o.value === r.recontrataria)?.label ??
                r.recontrataria
              }${r.recontrataria_porque ? ' — ' + r.recontrataria_porque : ''}`}
            />
          )}
          {r.motivo_retiro && <Detalle label="Motivo de retiro" valor={r.motivo_retiro} />}
          {r.observaciones && <Detalle label="Observaciones" valor={r.observaciones} />}
          {r.verificada_en && (
            <p className="text-[11px] text-text-subtle pt-2 inline-flex items-center gap-1">
              <CheckCircle2 size={11} strokeWidth={1.75} className="text-success-600" />
              Verificada por {r.verificada_por_nombre ?? '—'} el{' '}
              {formatearFecha(r.verificada_en.toDate())}
            </p>
          )}
        </div>
      )}

      {verificandoAbierto && !r.verificada && (
        <VerificarForm
          referencia={r}
          uid={uid}
          verificadorNombre={verificadorNombre}
          onCancelar={onCerrarVerificar}
          onVerificada={onCerrarVerificar}
          onError={onError}
          actualizar={actualizar}
        />
      )}
    </Card>
  );
}

function Detalle({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="text-[13px]">
      <span className="text-[10px] uppercase tracking-[0.06em] text-text-subtle font-bold">
        {label}:{' '}
      </span>
      <span className="text-text-body">{valor}</span>
    </p>
  );
}

interface VerificarProps {
  referencia: ReferenciaDoc;
  uid: string;
  verificadorNombre: string | null;
  onCancelar: () => void;
  onVerificada: () => void;
  onError: (msg: string) => void;
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
}

function VerificarForm({
  referencia,
  uid,
  verificadorNombre,
  onCancelar,
  onVerificada,
  onError,
  actualizar,
}: VerificarProps) {
  const [form, setForm] = useState({
    funciones_responsabilidades: '',
    fortalezas_caracteristicas: '',
    logros: '',
    areas_mejora: '',
    descripcion_desempeno: '',
    recontrataria: null as Recontrataria | null,
    recontrataria_porque: '',
    motivo_retiro: '',
    observaciones: '',
    resultado: 'positiva' as ResultadoReferencia,
  });
  const [guardando, setGuardando] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await actualizar('referencias', referencia.id, {
        ...form,
        verificada: true,
        verificada_en: Timestamp.now(),
        verificada_por_uid: uid,
        verificada_por_nombre: verificadorNombre,
      });
      onVerificada();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos guardar la verificación.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-slate-100 space-y-4">
      <Pill tono="brand">Cuestionario VIDA-F-12</Pill>

      <Textarea
        label="Funciones y responsabilidades"
        value={form.funciones_responsabilidades}
        onChange={(v) => setForm({ ...form, funciones_responsabilidades: v })}
      />
      <Textarea
        label="Fortalezas y características"
        value={form.fortalezas_caracteristicas}
        onChange={(v) => setForm({ ...form, fortalezas_caracteristicas: v })}
      />
      <Textarea label="Logros" value={form.logros} onChange={(v) => setForm({ ...form, logros: v })} />
      <Textarea
        label="Áreas de mejora"
        value={form.areas_mejora}
        onChange={(v) => setForm({ ...form, areas_mejora: v })}
      />
      <Textarea
        label="¿Cómo describe su desempeño?"
        value={form.descripcion_desempeno}
        onChange={(v) => setForm({ ...form, descripcion_desempeno: v })}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectField
          label="¿Lo contrataría otra vez?"
          value={form.recontrataria ?? ''}
          onChange={(v) =>
            setForm({ ...form, recontrataria: (v || null) as Recontrataria | null })
          }
          options={[
            { value: '', label: '—' },
            ...RECONTRATARIA_OPCIONES.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <Field
          label="¿Por qué?"
          value={form.recontrataria_porque}
          onChange={(v) => setForm({ ...form, recontrataria_porque: v })}
        />
      </div>
      <Textarea
        label="Motivo del retiro"
        value={form.motivo_retiro}
        onChange={(v) => setForm({ ...form, motivo_retiro: v })}
      />
      <Textarea
        label="Observaciones generales"
        value={form.observaciones}
        onChange={(v) => setForm({ ...form, observaciones: v })}
      />

      <div className="rounded-md bg-slate-50 border border-slate-200 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-3">
          Resultado final de la referencia
        </p>
        <div className="flex gap-2 flex-wrap">
          {RESULTADO_OPCIONES.map((opt) => {
            const activo = form.resultado === opt.value;
            const bordeActivo =
              opt.tono === 'success'
                ? 'border-success-500 bg-success-50 text-success-700'
                : opt.tono === 'warning'
                  ? 'border-warning-500 bg-warning-50 text-warning-700'
                  : 'border-danger-500 bg-danger-50 text-danger-700';
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => setForm({ ...form, resultado: opt.value })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-semibold border transition-colors duration-150',
                  activo
                    ? bordeActivo
                    : 'bg-white border-slate-300 text-text-body hover:bg-slate-50',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="neutral-secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" variant="brand-primary" disabled={guardando} loading={guardando}>
          {guardando ? 'Guardando…' : 'Marcar como verificada'}
        </Button>
      </div>
    </form>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}
function Field({ label, value, onChange, required, placeholder, type }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">
        {label} {required && <span className="text-brand-600">*</span>}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}
function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface TextareaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}
function Textarea({ label, value, onChange, rows }: TextareaProps) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">{label}</span>
      <textarea
        rows={rows ?? 2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
    </label>
  );
}
