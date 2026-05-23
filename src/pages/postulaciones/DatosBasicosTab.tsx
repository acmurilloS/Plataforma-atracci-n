import { useEffect, useState, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ChevronDown, ChevronUp, IdCard, Plus, Trash2 } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { useEmpresas } from '../../hooks/useCatalogos';
import { formatearFecha } from '../../utils/fechas';
import type {
  DatosBasicosIntegranteDoc,
  EstadoCivil,
  EstadoDatosBasicos,
  GeneroIntegrante,
  GrupoSanguineo,
  Hijo,
  PostulacionDoc,
  TipoContratacion,
} from '../../schemas';

interface Props {
  postulacion: PostulacionDoc;
}

const ESTADO_LABEL: Record<EstadoDatosBasicos, string> = {
  borrador: 'Borrador',
  diligenciado_integrante: 'Diligenciado por integrante',
  autorizado_gh: 'Autorizado por GH',
  registrado_nomina: 'Registrado en nómina',
};

const ESTADO_COLOR: Record<EstadoDatosBasicos, string> = {
  borrador: 'bg-navy-50 text-navy-700',
  diligenciado_integrante: 'bg-amber-50 text-amber-800',
  autorizado_gh: 'bg-blue-50 text-blue-800',
  registrado_nomina: 'bg-emerald-50 text-emerald-700',
};

const SECCIONES = [
  { id: 'cabecera', label: 'Tipo de contratación y empresa' },
  { id: 'personal', label: '1. Información personal' },
  { id: 'laboral', label: '2. Información laboral' },
  { id: 'familiar', label: '3. Información familiar' },
  { id: 'emergencia', label: '4. En caso de emergencia avisar a' },
  { id: 'dotacion', label: '5. Dotación · tallajes' },
  { id: 'observaciones', label: '6. Observaciones y familiares en la organización' },
] as const;

export function DatosBasicosTab({ postulacion }: Props) {
  const { docs } = useColeccion<DatosBasicosIntegranteDoc>('datos_basicos_integrante', {
    filtros: [['postulacion_id', '==', postulacion.id]],
    limit: 1,
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil, rol } = useAuth();
  const { empresas } = useEmpresas();
  const [err, setErr] = useState<string | null>(null);
  const [seccionAbierta, setSeccionAbierta] = useState<string>('personal');

  const dato = docs[0] ?? null;
  const esGH = rol === 'gh' || rol === 'admin' || rol === 'coordinador';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-lg font-semibold text-navy-900 flex items-center gap-2">
            <IdCard size={18} className="text-equitel-rojo-700" />
            Datos básicos del integrante (paso 18-19)
          </h3>
          <p className="text-xs text-navy-500 mt-0.5">
            Formato DGH-F-05 v8 · Información para registro en nómina
          </p>
        </div>
        {dato && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${ESTADO_COLOR[dato.estado]}`}>
            {ESTADO_LABEL[dato.estado]}
          </span>
        )}
      </div>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {!dato && (
        <CrearDatosBasicos
          postulacion={postulacion}
          empresas={empresas}
          uid={user?.uid ?? ''}
          onError={(m) => setErr(m)}
          crear={crear}
        />
      )}

      {dato && (
        <div className="space-y-3">
          {SECCIONES.map((s) => (
            <Seccion
              key={s.id}
              label={s.label}
              abierta={seccionAbierta === s.id}
              onToggle={() => setSeccionAbierta(seccionAbierta === s.id ? '' : s.id)}
            >
              <ContenidoSeccion
                seccionId={s.id}
                dato={dato}
                empresas={empresas}
                actualizar={actualizar}
                esGH={esGH}
                onError={(m) => setErr(m)}
              />
            </Seccion>
          ))}

          <AccionesWorkflow
            dato={dato}
            esGH={esGH}
            uid={user?.uid ?? ''}
            verificadorNombre={perfil ? `${perfil.nombre} ${perfil.apellido}` : null}
            actualizar={actualizar}
            onError={(m) => setErr(m)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Crear datos básicos ───────────────────────────────────────────────

function CrearDatosBasicos({
  postulacion,
  empresas,
  uid,
  onError,
  crear,
}: {
  postulacion: PostulacionDoc;
  empresas: { id: string; codigo: string; nombre: string }[];
  uid: string;
  onError: (msg: string) => void;
  crear: ReturnType<typeof useMutacion>['crear'];
}) {
  const [empresaCodigo, setEmpresaCodigo] = useState(empresas[0]?.codigo ?? '');
  const [tipoContrat, setTipoContrat] = useState<TipoContratacion>('directo');
  const [creando, setCreando] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      const empresa = empresas.find((e) => e.codigo === empresaCodigo);
      const nombreCompleto = postulacion.candidato_nombre ?? '';
      // Split heurístico nombre/apellidos
      const partes = nombreCompleto.trim().split(/\s+/);
      const nombres = partes.slice(0, Math.max(1, Math.floor(partes.length / 2))).join(' ');
      const apellidos = partes.slice(Math.max(1, Math.floor(partes.length / 2))).join(' ');

      await crear('datos_basicos_integrante', {
        postulacion_id: postulacion.id,
        candidato_id: postulacion.candidato_id,
        candidato_nombre: nombreCompleto,
        estado: 'borrador',
        tipo_contratacion: tipoContrat,
        empresa_codigo: empresaCodigo,
        empresa_nombre: empresa?.nombre ?? '',
        nombres,
        apellidos,
        documento_tipo: 'CC',
        documento_numero: '',
        documento_ciudad_expedicion: '',
        documento_dpto_expedicion: '',
        direccion: '',
        barrio: '',
        ciudad_domicilio: '',
        telefono_fijo: '',
        celular: postulacion.candidato_telefono ?? '',
        fecha_nacimiento: null,
        lugar_nacimiento: '',
        estado_civil: null,
        profesion_actividad: '',
        genero: null,
        grupo_sanguineo: null,
        alergico_a: '',
        dependiente_medicamento: '',
        libreta_militar_numero: '',
        libreta_militar_clase: '',
        correo_electronico: postulacion.candidato_email ?? '',
        cuenta_banco_numero: '',
        entidad_bancaria: '',
        fondo_pensiones_obligatorias: '',
        entidad_promotora_salud: '',
        fondo_cesantias: '',
        caja_compensacion: '',
        arl: '',
        riesgo_porcentaje: '',
        conyuge_nombre: '',
        conyuge_documento: '',
        conyuge_profesion_actividad: '',
        conyuge_fecha_nacimiento: null,
        hijos: [],
        emergencia_contacto_1: { nombre: '', telefono: '' },
        emergencia_contacto_2: { nombre: '', telefono: '' },
        talla_calzado: '',
        talla_pantalon: '',
        talla_chaleco: '',
        talla_guantes: '',
        talla_overol: '',
        talla_camisa_blusa: '',
        talla_otros: '',
        observaciones: '',
        tiene_familiares_organizacion: false,
        nombre_familiar_organizacion: '',
        firma_integrante_url: null,
        fecha_firma_integrante: null,
        autorizacion_gh_uid: null,
        autorizacion_gh_nombre: null,
        fecha_autorizacion_gh: null,
        registrado_nomina_uid: null,
        registrado_nomina_nombre: null,
        fecha_registrado_nomina: null,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos crear los datos básicos.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-navy-100 bg-white p-5 space-y-4">
      <div>
        <h4 className="font-display text-base font-semibold text-navy-900">Iniciar datos básicos del integrante</h4>
        <p className="text-xs text-navy-500 mt-1">
          El candidato seleccionado completa la información personal, laboral y familiar. GH valida y
          registra en nómina.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Tipo de contratación</span>
          <select value={tipoContrat} onChange={(e) => setTipoContrat(e.target.value as TipoContratacion)} className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm bg-white">
            <option value="directo">Directo</option>
            <option value="temporal">Temporal</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Empresa</span>
          <select value={empresaCodigo} onChange={(e) => setEmpresaCodigo(e.target.value)} required className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm bg-white">
            {empresas.map((e) => (
              <option key={e.codigo} value={e.codigo}>{e.nombre}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={creando} className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300">
        {creando ? 'Creando…' : 'Iniciar datos básicos'}
      </button>
      <p className="text-[11px] text-navy-400">uid sesión: {uid.slice(0, 8)}…</p>
    </form>
  );
}

// ─── Sección colapsable ────────────────────────────────────────────────

function Seccion({ label, abierta, onToggle, children }: { label: string; abierta: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center justify-between bg-cream-50 hover:bg-cream-100"
      >
        <span className="font-display text-sm font-bold text-navy-900">{label}</span>
        {abierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {abierta && <div className="px-5 py-4">{children}</div>}
    </div>
  );
}

// ─── Contenido por sección ─────────────────────────────────────────────

function ContenidoSeccion({
  seccionId,
  dato,
  empresas,
  actualizar,
  esGH,
  onError,
}: {
  seccionId: string;
  dato: DatosBasicosIntegranteDoc;
  empresas: { id: string; codigo: string; nombre: string }[];
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
  esGH: boolean;
  onError: (m: string) => void;
}) {
  const [local, setLocal] = useState<Partial<DatosBasicosIntegranteDoc>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setLocal({});
    setGuardado(false);
  }, [seccionId]);

  function set<K extends keyof DatosBasicosIntegranteDoc>(key: K, value: DatosBasicosIntegranteDoc[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setGuardado(false);
  }

  function get<K extends keyof DatosBasicosIntegranteDoc>(key: K): DatosBasicosIntegranteDoc[K] {
    return (local[key] ?? dato[key]) as DatosBasicosIntegranteDoc[K];
  }

  async function guardar() {
    if (Object.keys(local).length === 0) return;
    setGuardando(true);
    try {
      await actualizar('datos_basicos_integrante', dato.id, local);
      setGuardado(true);
      setLocal({});
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setGuardando(false);
    }
  }

  const hayCambios = Object.keys(local).length > 0;

  return (
    <div className="space-y-4">
      {seccionId === 'cabecera' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SelectField
            label="Tipo de contratación"
            value={get('tipo_contratacion') as string}
            onChange={(v) => set('tipo_contratacion', v as TipoContratacion)}
            options={[{ value: 'directo', label: 'Directo' }, { value: 'temporal', label: 'Temporal' }]}
          />
          <SelectField
            label="Empresa"
            value={get('empresa_codigo') as string}
            onChange={(v) => {
              const emp = empresas.find((e) => e.codigo === v);
              set('empresa_codigo', v);
              set('empresa_nombre', emp?.nombre ?? '');
            }}
            options={empresas.map((e) => ({ value: e.codigo, label: e.nombre }))}
          />
        </div>
      )}

      {seccionId === 'personal' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nombres" value={get('nombres') as string} onChange={(v) => set('nombres', v)} />
          <Field label="Apellidos" value={get('apellidos') as string} onChange={(v) => set('apellidos', v)} />
          <SelectField
            label="Tipo de documento"
            value={get('documento_tipo') as string}
            onChange={(v) => set('documento_tipo', v)}
            options={[
              { value: 'CC', label: 'C.C.' },
              { value: 'CE', label: 'C.E.' },
              { value: 'PEP', label: 'PEP' },
              { value: 'PA', label: 'Pasaporte' },
            ]}
          />
          <Field label="Número de documento" value={get('documento_numero') as string} onChange={(v) => set('documento_numero', v)} />
          <Field label="Ciudad de expedición" value={get('documento_ciudad_expedicion') as string} onChange={(v) => set('documento_ciudad_expedicion', v)} />
          <Field label="Departamento de expedición" value={get('documento_dpto_expedicion') as string} onChange={(v) => set('documento_dpto_expedicion', v)} />
          <Field label="Dirección de domicilio" value={get('direccion') as string} onChange={(v) => set('direccion', v)} />
          <Field label="Barrio" value={get('barrio') as string} onChange={(v) => set('barrio', v)} />
          <Field label="Ciudad de domicilio" value={get('ciudad_domicilio') as string} onChange={(v) => set('ciudad_domicilio', v)} />
          <Field label="Teléfono fijo" value={get('telefono_fijo') as string} onChange={(v) => set('telefono_fijo', v)} />
          <Field label="Celular" value={get('celular') as string} onChange={(v) => set('celular', v)} />
          <Field label="Fecha de nacimiento" type="date" value={fmtDate(get('fecha_nacimiento') as Timestamp | null)} onChange={(v) => set('fecha_nacimiento', v ? Timestamp.fromDate(new Date(v)) : null)} />
          <Field label="Lugar de nacimiento" value={get('lugar_nacimiento') as string} onChange={(v) => set('lugar_nacimiento', v)} />
          <SelectField
            label="Estado civil"
            value={(get('estado_civil') as string) ?? ''}
            onChange={(v) => set('estado_civil', (v || null) as EstadoCivil | null)}
            options={[
              { value: '', label: '—' },
              { value: 'soltero', label: 'Soltero(a)' },
              { value: 'casado', label: 'Casado(a)' },
              { value: 'union_libre', label: 'Unión libre' },
              { value: 'separado', label: 'Separado(a)' },
              { value: 'divorciado', label: 'Divorciado(a)' },
              { value: 'viudo', label: 'Viudo(a)' },
            ]}
          />
          <Field label="Profesión / actividad actual" value={get('profesion_actividad') as string} onChange={(v) => set('profesion_actividad', v)} />
          <SelectField
            label="Género"
            value={(get('genero') as string) ?? ''}
            onChange={(v) => set('genero', (v || null) as GeneroIntegrante | null)}
            options={[
              { value: '', label: '—' },
              { value: 'masculino', label: 'Masculino' },
              { value: 'femenino', label: 'Femenino' },
              { value: 'otro', label: 'Otro' },
            ]}
          />
          <SelectField
            label="RH"
            value={(get('grupo_sanguineo') as string) ?? ''}
            onChange={(v) => set('grupo_sanguineo', (v || null) as GrupoSanguineo | null)}
            options={[
              { value: '', label: '—' },
              { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
              { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
              { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
              { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
            ]}
          />
          <Field label="Alérgico a" value={get('alergico_a') as string} onChange={(v) => set('alergico_a', v)} placeholder="ej. penicilina, polvo" />
          <Field label="Dependiente a algún medicamento" value={get('dependiente_medicamento') as string} onChange={(v) => set('dependiente_medicamento', v)} />
          <Field label="N° libreta militar" value={get('libreta_militar_numero') as string} onChange={(v) => set('libreta_militar_numero', v)} />
          <Field label="Clase libreta militar" value={get('libreta_militar_clase') as string} onChange={(v) => set('libreta_militar_clase', v)} placeholder="1ra / 2da" />
          <Field label="Correo electrónico" type="email" value={get('correo_electronico') as string} onChange={(v) => set('correo_electronico', v)} />
        </div>
      )}

      {seccionId === 'laboral' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="N° cuenta de banco" value={get('cuenta_banco_numero') as string} onChange={(v) => set('cuenta_banco_numero', v)} />
            <Field label="Entidad bancaria" value={get('entidad_bancaria') as string} onChange={(v) => set('entidad_bancaria', v)} />
            <Field label="Fondo de pensiones obligatorias (AFP)" value={get('fondo_pensiones_obligatorias') as string} onChange={(v) => set('fondo_pensiones_obligatorias', v)} placeholder="ej. Porvenir, Protección, Colpensiones" />
            <Field label="EPS" value={get('entidad_promotora_salud') as string} onChange={(v) => set('entidad_promotora_salud', v)} placeholder="ej. Sura, Sanitas, Compensar" />
            <Field label="Fondo de cesantías" value={get('fondo_cesantias') as string} onChange={(v) => set('fondo_cesantias', v)} />
          </div>
          <div className="rounded-md border border-navy-200 bg-cream-50 p-3 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-navy-500 font-bold">
              Solo diligenciado por Gestión Humana
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field
                label="Caja de compensación"
                value={get('caja_compensacion') as string}
                onChange={(v) => set('caja_compensacion', v)}
                disabled={!esGH}
                placeholder="ej. Compensar, Cafam"
              />
              <Field
                label="ARL"
                value={get('arl') as string}
                onChange={(v) => set('arl', v)}
                disabled={!esGH}
                placeholder="ej. Sura, Positiva"
              />
              <Field
                label="Riesgo (%)"
                value={get('riesgo_porcentaje') as string}
                onChange={(v) => set('riesgo_porcentaje', v)}
                disabled={!esGH}
                placeholder="ej. 1, 2, 3, 4, 5"
              />
            </div>
            {!esGH && (
              <p className="text-[11px] text-navy-500 italic">
                Estos 3 campos los diligencia GH (Maribel) cuando autorice la contratación.
              </p>
            )}
          </div>
        </div>
      )}

      {seccionId === 'familiar' && (
        <div className="space-y-4">
          <div>
            <h5 className="text-xs uppercase tracking-widest text-navy-500 font-bold mb-2">Cónyuge</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nombre cónyuge" value={get('conyuge_nombre') as string} onChange={(v) => set('conyuge_nombre', v)} />
              <Field label="Documento de identidad" value={get('conyuge_documento') as string} onChange={(v) => set('conyuge_documento', v)} />
              <Field label="Profesión / actividad" value={get('conyuge_profesion_actividad') as string} onChange={(v) => set('conyuge_profesion_actividad', v)} />
              <Field label="Fecha de nacimiento" type="date" value={fmtDate(get('conyuge_fecha_nacimiento') as Timestamp | null)} onChange={(v) => set('conyuge_fecha_nacimiento', v ? Timestamp.fromDate(new Date(v)) : null)} />
            </div>
          </div>
          <div>
            <h5 className="text-xs uppercase tracking-widest text-navy-500 font-bold mb-2">Hijos</h5>
            <HijosEditor
              hijos={get('hijos') as Hijo[]}
              onChange={(v) => set('hijos', v)}
            />
          </div>
        </div>
      )}

      {seccionId === 'emergencia' && (
        <div className="space-y-3">
          <p className="text-xs text-navy-500">Hasta 2 contactos a quienes avisar en caso de emergencia.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-navy-100 p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wide font-bold text-navy-600">Contacto 1</p>
              <Field label="Nombre" value={(get('emergencia_contacto_1') as { nombre: string }).nombre} onChange={(v) => set('emergencia_contacto_1', { ...get('emergencia_contacto_1'), nombre: v })} />
              <Field label="Teléfono" value={(get('emergencia_contacto_1') as { telefono: string }).telefono} onChange={(v) => set('emergencia_contacto_1', { ...get('emergencia_contacto_1'), telefono: v })} />
            </div>
            <div className="rounded-md border border-navy-100 p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wide font-bold text-navy-600">Contacto 2</p>
              <Field label="Nombre" value={(get('emergencia_contacto_2') as { nombre: string }).nombre} onChange={(v) => set('emergencia_contacto_2', { ...get('emergencia_contacto_2'), nombre: v })} />
              <Field label="Teléfono" value={(get('emergencia_contacto_2') as { telefono: string }).telefono} onChange={(v) => set('emergencia_contacto_2', { ...get('emergencia_contacto_2'), telefono: v })} />
            </div>
          </div>
        </div>
      )}

      {seccionId === 'dotacion' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="N° calzado" value={get('talla_calzado') as string} onChange={(v) => set('talla_calzado', v)} placeholder="ej. 40" />
          <Field label="Pantalón" value={get('talla_pantalon') as string} onChange={(v) => set('talla_pantalon', v)} placeholder="ej. 32" />
          <Field label="Camisa / blusa" value={get('talla_camisa_blusa') as string} onChange={(v) => set('talla_camisa_blusa', v)} placeholder="ej. M, L" />
          <Field label="Chaleco" value={get('talla_chaleco') as string} onChange={(v) => set('talla_chaleco', v)} />
          <Field label="Guantes" value={get('talla_guantes') as string} onChange={(v) => set('talla_guantes', v)} />
          <Field label="Overol" value={get('talla_overol') as string} onChange={(v) => set('talla_overol', v)} />
          <Field label="Otros" value={get('talla_otros') as string} onChange={(v) => set('talla_otros', v)} />
        </div>
      )}

      {seccionId === 'observaciones' && (
        <div className="space-y-3">
          <TextareaField label="Observaciones" value={get('observaciones') as string} onChange={(v) => set('observaciones', v)} />
          <CheckField
            label="¿Tiene familiares en la organización?"
            checked={get('tiene_familiares_organizacion') as boolean}
            onChange={(v) => set('tiene_familiares_organizacion', v)}
          />
          {(get('tiene_familiares_organizacion') as boolean) && (
            <Field label="Nombre del familiar" value={get('nombre_familiar_organizacion') as string} onChange={(v) => set('nombre_familiar_organizacion', v)} />
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-navy-100">
        {guardado && <span className="text-xs text-emerald-600 font-semibold">✓ Guardado</span>}
        <button onClick={guardar} disabled={!hayCambios || guardando} className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300">
          {guardando ? 'Guardando…' : 'Guardar sección'}
        </button>
      </div>
    </div>
  );
}

// ─── Editor de hijos ───────────────────────────────────────────────────

function HijosEditor({ hijos, onChange }: { hijos: Hijo[]; onChange: (v: Hijo[]) => void }) {
  function actualizar(i: number, patch: Partial<Hijo>) {
    const next = [...hijos];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function agregar() {
    if (hijos.length >= 5) return;
    onChange([...hijos, { nombre: '', fecha_nacimiento: '' }]);
  }
  function eliminar(i: number) {
    onChange(hijos.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {hijos.map((h, i) => (
        <div key={i} className="flex gap-2 items-end">
          <div className="flex-1">
            <Field label={`Hijo ${i + 1} · nombre`} value={h.nombre} onChange={(v) => actualizar(i, { nombre: v })} />
          </div>
          <div className="flex-1">
            <Field label="Fecha de nacimiento" type="date" value={h.fecha_nacimiento ?? ''} onChange={(v) => actualizar(i, { fecha_nacimiento: v })} />
          </div>
          <button type="button" onClick={() => eliminar(i)} className="rounded-md p-2 hover:bg-red-50 text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {hijos.length < 5 && (
        <button type="button" onClick={agregar} className="text-sm text-equitel-rojo-700 hover:underline font-semibold inline-flex items-center gap-1">
          <Plus size={14} /> Agregar hijo
        </button>
      )}
      <p className="text-[11px] text-navy-400">Máximo 5 hijos según el formato.</p>
    </div>
  );
}

// ─── Workflow ──────────────────────────────────────────────────────────

function AccionesWorkflow({
  dato,
  esGH,
  uid,
  verificadorNombre,
  actualizar,
  onError,
}: {
  dato: DatosBasicosIntegranteDoc;
  esGH: boolean;
  uid: string;
  verificadorNombre: string | null;
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
  onError: (m: string) => void;
}) {
  async function marcarDiligenciado() {
    if (!dato.documento_numero || !dato.celular || !dato.correo_electronico || !dato.entidad_promotora_salud) {
      onError('Faltan campos mínimos: documento, celular, correo y EPS son obligatorios.');
      return;
    }
    try {
      await actualizar('datos_basicos_integrante', dato.id, {
        estado: 'diligenciado_integrante',
        fecha_firma_integrante: Timestamp.now(),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos guardar.');
    }
  }

  async function autorizarGH() {
    if (!dato.caja_compensacion || !dato.arl || !dato.riesgo_porcentaje) {
      onError('GH debe completar caja de compensación, ARL y riesgo % antes de autorizar.');
      return;
    }
    try {
      await actualizar('datos_basicos_integrante', dato.id, {
        estado: 'autorizado_gh',
        autorizacion_gh_uid: uid,
        autorizacion_gh_nombre: verificadorNombre,
        fecha_autorizacion_gh: Timestamp.now(),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos autorizar.');
    }
  }

  async function registrarNomina() {
    try {
      await actualizar('datos_basicos_integrante', dato.id, {
        estado: 'registrado_nomina',
        registrado_nomina_uid: uid,
        registrado_nomina_nombre: verificadorNombre,
        fecha_registrado_nomina: Timestamp.now(),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos marcar como registrado.');
    }
  }

  return (
    <div className="rounded-xl border border-equitel-rojo-200 bg-equitel-rojo-50/30 p-5 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="font-display text-sm font-semibold text-navy-900">Workflow</p>
        <p className="text-xs text-navy-600">
          Estado actual: <strong>{ESTADO_LABEL[dato.estado]}</strong>
        </p>
        {dato.fecha_firma_integrante && (
          <p className="text-[11px] text-navy-500">
            Diligenciado: {formatearFecha(dato.fecha_firma_integrante.toDate())}
          </p>
        )}
        {dato.fecha_autorizacion_gh && dato.autorizacion_gh_nombre && (
          <p className="text-[11px] text-navy-500">
            Autorizado por {dato.autorizacion_gh_nombre} el {formatearFecha(dato.fecha_autorizacion_gh.toDate())}
          </p>
        )}
        {dato.fecha_registrado_nomina && dato.registrado_nomina_nombre && (
          <p className="text-[11px] text-emerald-700 font-semibold">
            ✓ Registrado en nómina por {dato.registrado_nomina_nombre} el {formatearFecha(dato.fecha_registrado_nomina.toDate())}
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {dato.estado === 'borrador' && (
          <button onClick={marcarDiligenciado} className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800">
            Marcar como diligenciado
          </button>
        )}
        {dato.estado === 'diligenciado_integrante' && esGH && (
          <button onClick={autorizarGH} className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700">
            Autorizar GH
          </button>
        )}
        {dato.estado === 'autorizado_gh' && esGH && (
          <button onClick={registrarNomina} className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700">
            Marcar como registrado en nómina
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtDate(t: Timestamp | null): string {
  if (!t) return '';
  return t.toDate().toISOString().slice(0, 10);
}

function Field({ label, value, onChange, type, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <input
        type={type ?? 'text'}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-equitel-rojo-500 focus:outline-none focus:ring-2 focus:ring-equitel-rojo-500/20 disabled:bg-cream-100 disabled:text-navy-400"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm bg-white">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextareaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span className="text-sm text-navy-800">{label}</span>
    </label>
  );
}
