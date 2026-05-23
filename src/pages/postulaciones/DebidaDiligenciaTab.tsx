import { useState, useEffect, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { useEmpresas } from '../../hooks/useCatalogos';
import { formatearFecha } from '../../utils/fechas';
import type {
  DebidaDiligenciaDoc,
  EstadoDebidaDiligencia,
  PostulacionDoc,
  TipoDocumentoIdentidad,
  TipoVinculacion,
  VinculadoPep,
} from '../../schemas';

interface Props {
  postulacion: PostulacionDoc;
}

const ESTADO_LABEL: Record<EstadoDebidaDiligencia, string> = {
  borrador: 'Borrador',
  firmado_integrante: 'Firmado por integrante',
  verificado_cumplimiento: 'Verificado por cumplimiento',
  completado: 'Completado',
  rechazado: 'Rechazado',
};

const ESTADO_COLOR: Record<EstadoDebidaDiligencia, string> = {
  borrador: 'bg-navy-50 text-navy-700',
  firmado_integrante: 'bg-amber-50 text-amber-800',
  verificado_cumplimiento: 'bg-blue-50 text-blue-800',
  completado: 'bg-emerald-50 text-emerald-700',
  rechazado: 'bg-red-50 text-red-700',
};

const SECCIONES = [
  { id: 'datos_empresa', label: '1. Empresa y registro' },
  { id: 'datos_generales', label: '2. Datos generales del integrante' },
  { id: 'familiar_empresa', label: '2b. Familiar en la empresa' },
  { id: 'conyuge', label: '3. Información del cónyuge' },
  { id: 'financiera', label: '4. Información financiera' },
  { id: 'pep', label: '5. PEP · Persona Expuesta Políticamente' },
  { id: 'clausulas', label: '6-8. Cláusulas y declaraciones' },
  { id: 'verificacion', label: '9. Verificación oficial de cumplimiento' },
] as const;

export function DebidaDiligenciaTab({ postulacion }: Props) {
  const { docs } = useColeccion<DebidaDiligenciaDoc>('debida_diligencia', {
    filtros: [['postulacion_id', '==', postulacion.id]],
    limit: 1,
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil, rol } = useAuth();
  const { empresas } = useEmpresas();
  const [err, setErr] = useState<string | null>(null);
  const [seccionAbierta, setSeccionAbierta] = useState<string>('datos_empresa');

  const dd = docs[0] ?? null;

  const esCumplimiento = rol === 'gh' || rol === 'admin' || rol === 'coordinador';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-lg font-semibold text-navy-900 flex items-center gap-2">
            <ShieldCheck size={18} className="text-equitel-rojo-700" />
            Debida diligencia SAGRILAFT (paso 19)
          </h3>
          <p className="text-xs text-navy-500 mt-0.5">
            Formato F-CAR-01 v5 · Cumplimiento legal Circular 100-000016/2020 + Decreto 830/2021
          </p>
        </div>
        {dd && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${ESTADO_COLOR[dd.estado]}`}>
            {ESTADO_LABEL[dd.estado]}
          </span>
        )}
      </div>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {!dd && (
        <CrearDebidaDiligencia
          postulacion={postulacion}
          empresas={empresas}
          uid={user?.uid ?? ''}
          onError={(m) => setErr(m)}
          crear={crear}
        />
      )}

      {dd && (
        <div className="space-y-3">
          {SECCIONES.map((s) => (
            <Seccion
              key={s.id}
              id={s.id}
              label={s.label}
              abierta={seccionAbierta === s.id}
              onToggle={() => setSeccionAbierta(seccionAbierta === s.id ? '' : s.id)}
            >
              <ContenidoSeccion
                seccionId={s.id}
                dd={dd}
                actualizar={actualizar}
                uid={user?.uid ?? ''}
                verificadorNombre={perfil ? `${perfil.nombre} ${perfil.apellido}` : null}
                esCumplimiento={esCumplimiento}
                onError={(m) => setErr(m)}
              />
            </Seccion>
          ))}

          {/* Acciones de workflow */}
          <AccionesWorkflow
            dd={dd}
            esCumplimiento={esCumplimiento}
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

// ─── Crear nueva diligencia ────────────────────────────────────────────

function CrearDebidaDiligencia({
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
  const [cargo, setCargo] = useState('');
  const [tipoVinc, setTipoVinc] = useState<TipoVinculacion>('directo');
  const [creando, setCreando] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      const empresa = empresas.find((e) => e.codigo === empresaCodigo);
      const ahora = Timestamp.now();
      await crear('debida_diligencia', {
        postulacion_id: postulacion.id,
        candidato_id: postulacion.candidato_id,
        candidato_nombre: postulacion.candidato_nombre,
        estado: 'borrador',
        empresa_codigo: empresaCodigo,
        empresa_nombre: empresa?.nombre ?? '',
        tipo_registro: 'nuevo_integrante',
        departamento: '',
        ciudad_municipio: '',
        fecha_diligenciamiento: ahora,
        fecha_ingreso: null,
        cargo,
        tipo_vinculacion: tipoVinc,
        primer_apellido: '',
        segundo_apellido: '',
        nombres: postulacion.candidato_nombre,
        identificacion: '',
        tipo_documento: 'CC',
        tipo_documento_otro: '',
        fecha_nacimiento: null,
        celular: postulacion.candidato_telefono ?? '',
        pais: 'Colombia',
        fecha_expedicion_documento: null,
        lugar_expedicion: '',
        direccion_residencial: '',
        correo_electronico: postulacion.candidato_email ?? '',
        tiene_familiar_empresa: false,
        nombre_apellidos_familiar: '',
        parentesco_familiar: '',
        cargo_familiar: '',
        conyuge_primer_apellido: '',
        conyuge_segundo_apellido: '',
        conyuge_nombres: '',
        conyuge_identificacion: '',
        conyuge_tipo_documento: null,
        conyuge_telefono: '',
        conyuge_ocupacion: '',
        conyuge_empleador: '',
        conyuge_parentesco: '',
        realiza_operaciones_moneda_extranjera: false,
        operaciones_moneda_extranjera_detalle: '',
        posee_productos_financieros_extranjero: false,
        productos_financieros_extranjero_detalle: '',
        realiza_actividad_ingresos_adicionales: false,
        ingresos_adicionales_observaciones: '',
        posee_reconocimiento_publico: false,
        posee_vinculo_pep: false,
        vinculados_pep: [],
        acepta_clausulas_anticorrupcion: false,
        acepta_declaracion_origenes_ingreso: false,
        acepta_politicas_laft: false,
        firma_integrante_url: null,
        fecha_firma_integrante: null,
        verificado_listas_vinculantes: null,
        fecha_consulta_listas: null,
        observaciones_verificacion: '',
        verificado_por_uid: null,
        verificado_por_nombre: null,
        cargo_verificador: '',
        vobo_oficial_cumplimiento: false,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos crear la diligencia.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-navy-100 bg-white p-5 space-y-4">
      <div>
        <h4 className="font-display text-base font-semibold text-navy-900">Iniciar debida diligencia</h4>
        <p className="text-xs text-navy-500 mt-1">
          Solo se diligencia para candidatos seleccionados. El integrante completa los campos y firma;
          el oficial de cumplimiento verifica en listas vinculantes.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Empresa</span>
          <select
            value={empresaCodigo}
            onChange={(e) => setEmpresaCodigo(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm bg-white"
          >
            {empresas.map((e) => (
              <option key={e.codigo} value={e.codigo}>{e.nombre}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Cargo</span>
          <input
            type="text"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Tipo de vinculación</span>
          <select
            value={tipoVinc}
            onChange={(e) => setTipoVinc(e.target.value as TipoVinculacion)}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm bg-white"
          >
            <option value="directo">Directo</option>
            <option value="temporal">Temporal</option>
            <option value="aprendiz">Aprendiz</option>
            <option value="practica">Práctica</option>
            <option value="contratista">Contratista</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={creando}
        className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
      >
        {creando ? 'Creando…' : 'Iniciar diligencia'}
      </button>
      <p className="text-[11px] text-navy-400">uid sesión: {uid.slice(0, 8)}…</p>
    </form>
  );
}

// ─── Sección colapsable ────────────────────────────────────────────────

function Seccion({
  id,
  label,
  abierta,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  abierta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
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
      <input type="hidden" name={`sec-${id}`} />
    </div>
  );
}

// ─── Contenido por sección ─────────────────────────────────────────────

function ContenidoSeccion({
  seccionId,
  dd,
  actualizar,
  uid,
  verificadorNombre,
  esCumplimiento,
  onError,
}: {
  seccionId: string;
  dd: DebidaDiligenciaDoc;
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
  uid: string;
  verificadorNombre: string | null;
  esCumplimiento: boolean;
  onError: (m: string) => void;
}) {
  const [local, setLocal] = useState<Partial<DebidaDiligenciaDoc>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  // Reset local cuando cambia la sección
  useEffect(() => {
    setLocal({});
    setGuardado(false);
  }, [seccionId]);

  function set<K extends keyof DebidaDiligenciaDoc>(key: K, value: DebidaDiligenciaDoc[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setGuardado(false);
  }

  function get<K extends keyof DebidaDiligenciaDoc>(key: K): DebidaDiligenciaDoc[K] {
    return (local[key] ?? dd[key]) as DebidaDiligenciaDoc[K];
  }

  async function guardar() {
    if (Object.keys(local).length === 0) return;
    setGuardando(true);
    try {
      await actualizar('debida_diligencia', dd.id, local);
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
      {seccionId === 'datos_empresa' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Departamento" value={get('departamento') as string} onChange={(v) => set('departamento', v)} />
          <Field label="Ciudad / municipio" value={get('ciudad_municipio') as string} onChange={(v) => set('ciudad_municipio', v)} />
          <Field label="Cargo" value={get('cargo') as string} onChange={(v) => set('cargo', v)} />
          <SelectField
            label="Tipo de vinculación"
            value={get('tipo_vinculacion') as string}
            onChange={(v) => set('tipo_vinculacion', v as TipoVinculacion)}
            options={[
              { value: 'directo', label: 'Directo' },
              { value: 'temporal', label: 'Temporal' },
              { value: 'aprendiz', label: 'Aprendiz' },
              { value: 'practica', label: 'Práctica' },
              { value: 'contratista', label: 'Contratista' },
            ]}
          />
        </div>
      )}

      {seccionId === 'datos_generales' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Primer apellido" value={get('primer_apellido') as string} onChange={(v) => set('primer_apellido', v)} />
          <Field label="Segundo apellido" value={get('segundo_apellido') as string} onChange={(v) => set('segundo_apellido', v)} />
          <Field label="Nombres" value={get('nombres') as string} onChange={(v) => set('nombres', v)} />
          <SelectField
            label="Tipo de documento"
            value={get('tipo_documento') as string}
            onChange={(v) => set('tipo_documento', v as TipoDocumentoIdentidad)}
            options={[
              { value: 'CC', label: 'Cédula de ciudadanía' },
              { value: 'CE', label: 'Cédula de extranjería' },
              { value: 'PEP', label: 'Permiso especial de permanencia' },
              { value: 'PA', label: 'Pasaporte' },
              { value: 'OTRO', label: 'Otro' },
            ]}
          />
          {get('tipo_documento') === 'OTRO' && (
            <Field label="¿Otro, cuál?" value={get('tipo_documento_otro') as string} onChange={(v) => set('tipo_documento_otro', v)} />
          )}
          <Field label="N° identificación" value={get('identificacion') as string} onChange={(v) => set('identificacion', v)} />
          <Field label="Fecha de nacimiento" type="date" value={fmtDate(get('fecha_nacimiento') as Timestamp | null)} onChange={(v) => set('fecha_nacimiento', v ? Timestamp.fromDate(new Date(v)) : null)} />
          <Field label="Celular" value={get('celular') as string} onChange={(v) => set('celular', v)} />
          <Field label="País" value={get('pais') as string} onChange={(v) => set('pais', v)} />
          <Field label="Fecha de expedición documento" type="date" value={fmtDate(get('fecha_expedicion_documento') as Timestamp | null)} onChange={(v) => set('fecha_expedicion_documento', v ? Timestamp.fromDate(new Date(v)) : null)} />
          <Field label="Lugar de expedición" value={get('lugar_expedicion') as string} onChange={(v) => set('lugar_expedicion', v)} />
          <Field label="Dirección residencial" value={get('direccion_residencial') as string} onChange={(v) => set('direccion_residencial', v)} />
          <Field label="Correo electrónico" type="email" value={get('correo_electronico') as string} onChange={(v) => set('correo_electronico', v)} />
        </div>
      )}

      {seccionId === 'familiar_empresa' && (
        <div className="space-y-3">
          <CheckField
            label="¿Tiene algún familiar empleado en esta empresa?"
            checked={get('tiene_familiar_empresa') as boolean}
            onChange={(v) => set('tiene_familiar_empresa', v)}
          />
          {get('tiene_familiar_empresa') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-6 border-l-2 border-navy-100">
              <Field label="Nombre y apellidos del familiar" value={get('nombre_apellidos_familiar') as string} onChange={(v) => set('nombre_apellidos_familiar', v)} />
              <Field label="Parentesco" value={get('parentesco_familiar') as string} onChange={(v) => set('parentesco_familiar', v)} />
              <Field label="Cargo que ocupa" value={get('cargo_familiar') as string} onChange={(v) => set('cargo_familiar', v)} />
            </div>
          )}
        </div>
      )}

      {seccionId === 'conyuge' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Primer apellido" value={get('conyuge_primer_apellido') as string} onChange={(v) => set('conyuge_primer_apellido', v)} />
          <Field label="Segundo apellido" value={get('conyuge_segundo_apellido') as string} onChange={(v) => set('conyuge_segundo_apellido', v)} />
          <Field label="Nombres" value={get('conyuge_nombres') as string} onChange={(v) => set('conyuge_nombres', v)} />
          <Field label="N° identificación" value={get('conyuge_identificacion') as string} onChange={(v) => set('conyuge_identificacion', v)} />
          <Field label="Teléfono fijo o celular" value={get('conyuge_telefono') as string} onChange={(v) => set('conyuge_telefono', v)} />
          <Field label="Ocupación" value={get('conyuge_ocupacion') as string} onChange={(v) => set('conyuge_ocupacion', v)} />
          <Field label="Empleador" value={get('conyuge_empleador') as string} onChange={(v) => set('conyuge_empleador', v)} />
          <Field label="Parentesco" value={get('conyuge_parentesco') as string} onChange={(v) => set('conyuge_parentesco', v)} placeholder="ej. Cónyuge, compañero(a) permanente" />
        </div>
      )}

      {seccionId === 'financiera' && (
        <div className="space-y-4">
          <PreguntaSiNo
            pregunta="¿Realiza operaciones en moneda extranjera?"
            valor={get('realiza_operaciones_moneda_extranjera') as boolean}
            detalle={get('operaciones_moneda_extranjera_detalle') as string}
            onValor={(v) => set('realiza_operaciones_moneda_extranjera', v)}
            onDetalle={(v) => set('operaciones_moneda_extranjera_detalle', v)}
          />
          <PreguntaSiNo
            pregunta="¿Posee productos financieros en el extranjero?"
            valor={get('posee_productos_financieros_extranjero') as boolean}
            detalle={get('productos_financieros_extranjero_detalle') as string}
            onValor={(v) => set('posee_productos_financieros_extranjero', v)}
            onDetalle={(v) => set('productos_financieros_extranjero_detalle', v)}
          />
          <PreguntaSiNo
            pregunta="¿Realiza alguna actividad que genere ingresos adicionales?"
            valor={get('realiza_actividad_ingresos_adicionales') as boolean}
            detalle={get('ingresos_adicionales_observaciones') as string}
            onValor={(v) => set('realiza_actividad_ingresos_adicionales', v)}
            onDetalle={(v) => set('ingresos_adicionales_observaciones', v)}
            etiquetaDetalle="Observaciones"
          />
        </div>
      )}

      {seccionId === 'pep' && (
        <div className="space-y-4">
          <CheckField
            label="¿El integrante posee reconocimiento público?"
            checked={get('posee_reconocimiento_publico') as boolean}
            onChange={(v) => set('posee_reconocimiento_publico', v)}
          />
          <CheckField
            label="¿El integrante posee vínculo con una persona públicamente expuesta (PEP)?"
            checked={get('posee_vinculo_pep') as boolean}
            onChange={(v) => set('posee_vinculo_pep', v)}
          />
          {(get('posee_vinculo_pep') as boolean) && (
            <VinculadosPepEditor
              vinculados={get('vinculados_pep') as VinculadoPep[]}
              onChange={(v) => set('vinculados_pep', v)}
            />
          )}
          <p className="text-[11px] text-navy-500 italic">
            Decreto 830/2021: la calidad PEP se mantiene durante el ejercicio del cargo y por 2 años más
            desde su desvinculación.
          </p>
        </div>
      )}

      {seccionId === 'clausulas' && (
        <div className="space-y-3">
          <p className="text-xs text-navy-600 italic">
            Mediante la firma del documento, el integrante declara que conoce y acepta las políticas de
            Transparencia y Ética Empresarial de la Organización Equitel y sus empresas. Los textos completos
            están en el formato F-CAR-01 oficial.
          </p>
          <CheckField
            label="6. Acepta las cláusulas anticorrupción y antisoborno transnacional"
            checked={get('acepta_clausulas_anticorrupcion') as boolean}
            onChange={(v) => set('acepta_clausulas_anticorrupcion', v)}
          />
          <CheckField
            label="7. Acepta la declaración de orígenes de ingreso"
            checked={get('acepta_declaracion_origenes_ingreso') as boolean}
            onChange={(v) => set('acepta_declaracion_origenes_ingreso', v)}
          />
          <CheckField
            label="8. Acepta las políticas y procedimientos LA/FT"
            checked={get('acepta_politicas_laft') as boolean}
            onChange={(v) => set('acepta_politicas_laft', v)}
          />
          {dd.fecha_firma_integrante && (
            <p className="text-xs text-emerald-700 font-semibold">
              ✓ Firmado el {formatearFecha(dd.fecha_firma_integrante.toDate())}
            </p>
          )}
        </div>
      )}

      {seccionId === 'verificacion' && (
        <div className="space-y-3">
          {esCumplimiento ? (
            <>
              <CheckField
                label="¿Se verificó al integrante en listas vinculantes / restrictivas?"
                checked={!!get('verificado_listas_vinculantes')}
                onChange={(v) => set('verificado_listas_vinculantes', v)}
              />
              <Field label="Fecha de consulta" type="date" value={fmtDate(get('fecha_consulta_listas') as Timestamp | null)} onChange={(v) => set('fecha_consulta_listas', v ? Timestamp.fromDate(new Date(v)) : null)} />
              <TextareaField label="Observaciones de la verificación" value={get('observaciones_verificacion') as string} onChange={(v) => set('observaciones_verificacion', v)} />
              <Field label="Cargo del verificador" value={get('cargo_verificador') as string} onChange={(v) => set('cargo_verificador', v)} placeholder="ej. Oficial de Cumplimiento" />
              <p className="text-[11px] text-navy-500">
                Al guardar, queda registrado: {verificadorNombre ?? '—'} (uid {uid.slice(0, 8)}…)
              </p>
            </>
          ) : (
            <p className="text-sm text-navy-500 italic">
              Esta sección solo es editable por el oficial de cumplimiento (rol GH, coordinador o admin).
            </p>
          )}
        </div>
      )}

      {/* Botón guardar de la sección */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-navy-100">
        {guardado && <span className="text-xs text-emerald-600 font-semibold">✓ Guardado</span>}
        <button
          onClick={guardar}
          disabled={!hayCambios || guardando}
          className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
        >
          {guardando ? 'Guardando…' : 'Guardar sección'}
        </button>
      </div>
    </div>
  );
}

// ─── Editor de vinculados PEP ──────────────────────────────────────────

function VinculadosPepEditor({
  vinculados,
  onChange,
}: {
  vinculados: VinculadoPep[];
  onChange: (v: VinculadoPep[]) => void;
}) {
  function actualizar(i: number, patch: Partial<VinculadoPep>) {
    const next = [...vinculados];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function agregar() {
    onChange([...vinculados, { nombre: '', relacion: '', identidad: '', cargo_ocupacion: '', fecha_desvinculacion: '' }]);
  }
  function eliminar(i: number) {
    onChange(vinculados.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2 border-l-2 border-navy-100 pl-4">
      {vinculados.map((v, i) => (
        <div key={i} className="rounded-md border border-navy-100 p-3 bg-cream-50 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Nombre vinculado" value={v.nombre} onChange={(val) => actualizar(i, { nombre: val })} />
            <Field label="Relación" value={v.relacion} onChange={(val) => actualizar(i, { relacion: val })} />
            <Field label="N° identidad" value={v.identidad} onChange={(val) => actualizar(i, { identidad: val })} />
            <Field label="Cargo u ocupación" value={v.cargo_ocupacion} onChange={(val) => actualizar(i, { cargo_ocupacion: val })} />
            <Field label="Fecha desvinculación" type="date" value={v.fecha_desvinculacion ?? ''} onChange={(val) => actualizar(i, { fecha_desvinculacion: val })} />
          </div>
          <button onClick={() => eliminar(i)} className="text-xs text-red-600 hover:underline">Eliminar</button>
        </div>
      ))}
      <button onClick={agregar} className="text-sm text-equitel-rojo-700 hover:underline font-semibold">
        + Agregar vinculado
      </button>
    </div>
  );
}

// ─── Acciones de workflow ──────────────────────────────────────────────

function AccionesWorkflow({
  dd,
  esCumplimiento,
  uid,
  verificadorNombre,
  actualizar,
  onError,
}: {
  dd: DebidaDiligenciaDoc;
  esCumplimiento: boolean;
  uid: string;
  verificadorNombre: string | null;
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
  onError: (m: string) => void;
}) {
  async function firmarIntegrante() {
    if (!dd.acepta_clausulas_anticorrupcion || !dd.acepta_declaracion_origenes_ingreso || !dd.acepta_politicas_laft) {
      onError('El integrante debe aceptar las 3 cláusulas (sección 6-8) antes de firmar.');
      return;
    }
    try {
      await actualizar('debida_diligencia', dd.id, {
        estado: 'firmado_integrante',
        fecha_firma_integrante: Timestamp.now(),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos firmar.');
    }
  }

  async function aprobarCumplimiento() {
    if (dd.verificado_listas_vinculantes !== true) {
      onError('Debe marcar la verificación en listas vinculantes antes de aprobar.');
      return;
    }
    try {
      await actualizar('debida_diligencia', dd.id, {
        estado: 'completado',
        verificado_por_uid: uid,
        verificado_por_nombre: verificadorNombre,
        vobo_oficial_cumplimiento: true,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos aprobar.');
    }
  }

  async function rechazar() {
    const motivo = window.prompt('Motivo del rechazo:');
    if (!motivo) return;
    try {
      await actualizar('debida_diligencia', dd.id, {
        estado: 'rechazado',
        observaciones_verificacion: `${dd.observaciones_verificacion}\n[RECHAZO ${new Date().toISOString()}] ${motivo}`,
        verificado_por_uid: uid,
        verificado_por_nombre: verificadorNombre,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos rechazar.');
    }
  }

  return (
    <div className="rounded-xl border border-equitel-rojo-200 bg-equitel-rojo-50/30 p-5 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="font-display text-sm font-semibold text-navy-900">Workflow</p>
        <p className="text-xs text-navy-600">
          Estado actual: <strong>{ESTADO_LABEL[dd.estado]}</strong>
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {dd.estado === 'borrador' && (
          <button onClick={firmarIntegrante} className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800">
            Marcar como firmado por integrante
          </button>
        )}
        {dd.estado === 'firmado_integrante' && esCumplimiento && (
          <>
            <button onClick={rechazar} className="rounded-md border border-red-200 text-red-700 px-3 py-1.5 text-xs font-semibold hover:bg-red-50">
              Rechazar
            </button>
            <button onClick={aprobarCumplimiento} className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700">
              Aprobar VoBo Cumplimiento
            </button>
          </>
        )}
        {dd.estado === 'completado' && dd.verificado_por_nombre && (
          <p className="text-xs text-emerald-700 font-semibold">
            ✓ Aprobado por {dd.verificado_por_nombre}
          </p>
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

function Field({ label, value, onChange, type, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <input
        type={type ?? 'text'}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-equitel-rojo-500 focus:outline-none focus:ring-2 focus:ring-equitel-rojo-500/20"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
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

function TextareaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-equitel-rojo-500 focus:outline-none focus:ring-2 focus:ring-equitel-rojo-500/20"
      />
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

function PreguntaSiNo({ pregunta, valor, detalle, onValor, onDetalle, etiquetaDetalle }: { pregunta: string; valor: boolean; detalle: string; onValor: (v: boolean) => void; onDetalle: (v: string) => void; etiquetaDetalle?: string }) {
  return (
    <div className="rounded-md border border-navy-100 p-3 bg-cream-50/50 space-y-2">
      <div className="flex items-center gap-4">
        <span className="text-sm text-navy-800 font-medium flex-1">{pregunta}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onValor(true)}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${valor === true ? 'bg-equitel-rojo-600 text-white' : 'bg-white border border-navy-200 text-navy-700'}`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => onValor(false)}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${valor === false ? 'bg-navy-700 text-white' : 'bg-white border border-navy-200 text-navy-700'}`}
          >
            No
          </button>
        </div>
      </div>
      {valor && (
        <Field label={etiquetaDetalle ?? 'Especifique'} value={detalle} onChange={onDetalle} />
      )}
    </div>
  );
}
