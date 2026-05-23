import { useState, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import type {
  PostulacionDoc,
  ReferenciaDoc,
  ResultadoReferencia,
  Recontrataria,
  RelacionLaboral,
} from '../../schemas';

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

const RESULTADO_OPCIONES: { value: ResultadoReferencia; label: string; color: string }[] = [
  { value: 'positiva', label: 'Positiva', color: 'bg-emerald-50 text-emerald-700' },
  { value: 'neutra', label: 'Neutra', color: 'bg-amber-50 text-amber-800' },
  { value: 'negativa', label: 'Negativa', color: 'bg-red-50 text-red-700' },
];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-navy-900">
            Verificación de referencias (paso 9)
          </h3>
          <p className="text-xs text-navy-500 mt-0.5">
            Formato VIDA-F-12 v2 · {docs.length} {docs.length === 1 ? 'referencia' : 'referencias'}
          </p>
        </div>
        <button
          onClick={() => setCrearAbierto(true)}
          className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800"
        >
          + Nueva referencia
        </button>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
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
        <div className="rounded-xl border border-dashed border-navy-200 bg-cream-50 p-10 text-center">
          <p className="font-display text-base font-semibold text-navy-900">Sin referencias todavía</p>
          <p className="text-sm text-navy-500 mt-1">
            Agrega al menos 2 referencias laborales del candidato.
          </p>
        </div>
      )}

      <div className="space-y-3">
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

// ─── Subcomponentes ────────────────────────────────────────────────────────

interface CrearProps {
  postulacion: PostulacionDoc;
  onCancelar: () => void;
  onCreada: () => void;
  onError: (msg: string) => void;
  crear: ReturnType<typeof useMutacion>['crear'];
  uid: string;
}

function NuevaReferenciaForm({ postulacion, onCancelar, onCreada, onError, crear, uid }: CrearProps) {
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
    <form onSubmit={submit} className="rounded-xl border border-navy-100 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-base font-semibold text-navy-900">Nueva referencia</h4>
        <p className="text-[11px] uppercase tracking-widest text-navy-500">Datos previos al contacto</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-navy-700 mb-2 uppercase tracking-wide">
          Contacto en la empresa
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Empresa contactada" required value={form.empresa_contactada} onChange={(v) => setForm({ ...form, empresa_contactada: v })} />
          <Field label="Nombre del contacto" required value={form.nombre_contacto} onChange={(v) => setForm({ ...form, nombre_contacto: v })} />
          <Field label="Cargo del contacto" value={form.cargo_contacto} onChange={(v) => setForm({ ...form, cargo_contacto: v })} />
          <SelectField
            label="Relación laboral con el aspirante"
            value={form.relacion_laboral}
            onChange={(v) => setForm({ ...form, relacion_laboral: v as RelacionLaboral })}
            options={RELACION_OPCIONES.map((o) => ({ value: o.value, label: o.label }))}
          />
          <Field label="Teléfono" required value={form.telefono_contacto} onChange={(v) => setForm({ ...form, telefono_contacto: v })} />
          <Field label="Email" type="email" value={form.email_contacto} onChange={(v) => setForm({ ...form, email_contacto: v })} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-navy-700 mb-2 uppercase tracking-wide">
          Contexto del aspirante en esa empresa
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Cargo del aspirante" value={form.cargo_aspirante} onChange={(v) => setForm({ ...form, cargo_aspirante: v })} placeholder="ej. Ejecutivo de cuenta" />
          <Field label="Tiempo laborado" value={form.tiempo_laborado} onChange={(v) => setForm({ ...form, tiempo_laborado: v })} placeholder="ej. 3 años 6 meses" />
          <Field label="Rango salarial" value={form.rango_salarial} onChange={(v) => setForm({ ...form, rango_salarial: v })} placeholder="ej. $4M – $5M" />
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2 border-t border-navy-100">
        <button type="button" onClick={onCancelar} className="rounded-md border border-navy-200 px-4 py-2 text-sm text-navy-700 hover:bg-cream-100">
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300">
          {guardando ? 'Guardando…' : 'Guardar referencia'}
        </button>
      </div>
      <p className="text-xs text-navy-500">
        Después de guardar, llamas a la referencia y diligencias el cuestionario VIDA-F-12 con el botón "Verificar".
      </p>
      <p className="text-[11px] text-navy-400">uid sesión: {uid.slice(0, 8)}…</p>
    </form>
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
    <div className="rounded-xl border border-navy-100 bg-white p-5 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-display text-base font-semibold text-navy-900">
              {r.empresa_contactada}
            </h4>
            {r.verificada ? (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${resultadoOpt?.color ?? 'bg-navy-50 text-navy-700'}`}>
                ✓ {resultadoOpt?.label ?? 'Verificada'}
              </span>
            ) : (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-800">
                Pendiente verificar
              </span>
            )}
          </div>
          <p className="text-sm text-navy-700 mt-0.5">
            {r.nombre_contacto}
            {r.cargo_contacto && <span className="text-navy-500"> · {r.cargo_contacto}</span>}
          </p>
          <p className="text-xs text-navy-500">
            {r.telefono_contacto}
            {r.email_contacto && <span> · {r.email_contacto}</span>}
          </p>
          {(r.cargo_aspirante || r.tiempo_laborado || r.rango_salarial) && (
            <p className="text-xs text-navy-600 mt-2">
              <span className="font-semibold">Aspirante:</span>{' '}
              {[r.cargo_aspirante, r.tiempo_laborado, r.rango_salarial].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {!r.verificada && !verificandoAbierto && (
          <button
            onClick={onAbrirVerificar}
            className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800 whitespace-nowrap"
          >
            Verificar →
          </button>
        )}
      </div>

      {r.verificada && (
        <div className="mt-3 pt-3 border-t border-navy-100 space-y-1.5 text-sm">
          {r.funciones_responsabilidades && <Detalle label="Funciones" valor={r.funciones_responsabilidades} />}
          {r.fortalezas_caracteristicas && <Detalle label="Fortalezas" valor={r.fortalezas_caracteristicas} />}
          {r.logros && <Detalle label="Logros" valor={r.logros} />}
          {r.areas_mejora && <Detalle label="Áreas de mejora" valor={r.areas_mejora} />}
          {r.descripcion_desempeno && <Detalle label="Desempeño" valor={r.descripcion_desempeno} />}
          {r.recontrataria !== null && (
            <Detalle
              label="¿Lo contrataría otra vez?"
              valor={`${RECONTRATARIA_OPCIONES.find((o) => o.value === r.recontrataria)?.label ?? r.recontrataria}${r.recontrataria_porque ? ' — ' + r.recontrataria_porque : ''}`}
            />
          )}
          {r.motivo_retiro && <Detalle label="Motivo de retiro" valor={r.motivo_retiro} />}
          {r.observaciones && <Detalle label="Observaciones" valor={r.observaciones} />}
          {r.verificada_en && (
            <p className="text-[11px] text-navy-400 pt-1">
              Verificada por {r.verificada_por_nombre ?? '—'} el {formatearFecha(r.verificada_en.toDate())}
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
    </div>
  );
}

function Detalle({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="text-sm">
      <span className="text-[11px] uppercase tracking-wide text-navy-500 font-bold">{label}: </span>
      <span className="text-navy-800">{valor}</span>
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

function VerificarForm({ referencia, uid, verificadorNombre, onCancelar, onVerificada, onError, actualizar }: VerificarProps) {
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
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-navy-100 space-y-3">
      <p className="text-[11px] uppercase tracking-widest text-gold-700 font-bold">
        Cuestionario VIDA-F-12
      </p>
      <Textarea label="Funciones y responsabilidades" value={form.funciones_responsabilidades} onChange={(v) => setForm({ ...form, funciones_responsabilidades: v })} />
      <Textarea label="Fortalezas y características" value={form.fortalezas_caracteristicas} onChange={(v) => setForm({ ...form, fortalezas_caracteristicas: v })} />
      <Textarea label="Logros" value={form.logros} onChange={(v) => setForm({ ...form, logros: v })} />
      <Textarea label="Áreas de mejora" value={form.areas_mejora} onChange={(v) => setForm({ ...form, areas_mejora: v })} />
      <Textarea label="¿Cómo describe su desempeño?" value={form.descripcion_desempeno} onChange={(v) => setForm({ ...form, descripcion_desempeno: v })} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SelectField
          label="¿Lo contrataría otra vez?"
          value={form.recontrataria ?? ''}
          onChange={(v) => setForm({ ...form, recontrataria: (v || null) as Recontrataria | null })}
          options={[{ value: '', label: '—' }, ...RECONTRATARIA_OPCIONES.map((o) => ({ value: o.value, label: o.label }))]}
        />
        <Field label="¿Por qué?" value={form.recontrataria_porque} onChange={(v) => setForm({ ...form, recontrataria_porque: v })} />
      </div>
      <Textarea label="Motivo del retiro" value={form.motivo_retiro} onChange={(v) => setForm({ ...form, motivo_retiro: v })} />
      <Textarea label="Observaciones generales" value={form.observaciones} onChange={(v) => setForm({ ...form, observaciones: v })} />

      <div className="rounded-md bg-cream-50 border border-navy-100 p-3">
        <label className="block text-xs font-semibold text-navy-700 mb-2 uppercase tracking-wide">
          Resultado final de la referencia
        </label>
        <div className="flex gap-2 flex-wrap">
          {RESULTADO_OPCIONES.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setForm({ ...form, resultado: opt.value })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold border transition ${
                form.resultado === opt.value
                  ? `${opt.color} border-current`
                  : 'bg-white border-navy-200 text-navy-600 hover:bg-cream-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancelar} className="rounded-md border border-navy-200 px-4 py-2 text-sm text-navy-700 hover:bg-cream-100">
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300">
          {guardando ? 'Guardando…' : 'Marcar como verificada'}
        </button>
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
      <span className="text-xs font-medium text-navy-700">
        {label} {required && <span className="text-equitel-rojo-600">*</span>}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-equitel-rojo-500 focus:outline-none focus:ring-2 focus:ring-equitel-rojo-500/20"
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
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
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
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <textarea
        rows={rows ?? 2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-equitel-rojo-500 focus:outline-none focus:ring-2 focus:ring-equitel-rojo-500/20"
      />
    </label>
  );
}
