import { useState, useEffect, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { useEmpresas } from '../../hooks/useCatalogos';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import type {
  DebidaDiligenciaDoc,
  EstadoDebidaDiligencia,
  PostulacionDoc,
  TipoDocumentoIdentidad,
  TipoVinculacion,
  VinculadoPep,
} from '../../schemas';

/**
 * DebidaDiligenciaTab · sistema brand.
 *
 * Cuestionario SAGRILAFT F-CAR-01 v5 (paso 19). Secciones colapsables
 * tipo accordion brand. Workflow: borrador → firmado_integrante → completado.
 */

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

const ESTADO_TONO: Record<EstadoDebidaDiligencia, PillTono> = {
  borrador: 'neutral',
  firmado_integrante: 'warning',
  verificado_cumplimiento: 'info',
  completado: 'success',
  rechazado: 'danger',
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

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

const textareaClass = inputClass + ' resize-none leading-relaxed';

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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Debida diligencia SAGRILAFT · paso 19
            </p>
            <p className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong mt-1">
              Formato F-CAR-01 v5
            </p>
            <p className="text-[11px] text-text-subtle italic mt-0.5">
              Circular 100-000016/2020 + Decreto 830/2021
            </p>
          </div>
        </div>
        {dd && (
          <Pill tono={ESTADO_TONO[dd.estado]} dot>
            {ESTADO_LABEL[dd.estado]}
          </Pill>
        )}
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
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
    <Card padding="lg">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h4 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong">
            Iniciar debida diligencia
          </h4>
          <p className="text-[12px] text-text-muted mt-1.5 max-w-2xl">
            Solo se diligencia para candidatos seleccionados. El integrante completa los
            campos y firma; el oficial de cumplimiento verifica en listas vinculantes.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="block text-[13px] font-medium text-text-strong mb-1.5">Empresa</span>
            <select
              value={empresaCodigo}
              onChange={(e) => setEmpresaCodigo(e.target.value)}
              required
              className={inputClass}
            >
              {empresas.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-text-strong mb-1.5">Cargo</span>
            <input
              type="text"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-text-strong mb-1.5">
              Tipo de vinculación
            </span>
            <select
              value={tipoVinc}
              onChange={(e) => setTipoVinc(e.target.value as TipoVinculacion)}
              className={inputClass}
            >
              <option value="directo">Directo</option>
              <option value="temporal">Temporal</option>
              <option value="aprendiz">Aprendiz</option>
              <option value="practica">Práctica</option>
              <option value="contratista">Contratista</option>
            </select>
          </label>
        </div>
        <Button type="submit" variant="brand-primary" disabled={creando} loading={creando}>
          {creando ? 'Creando…' : 'Iniciar diligencia'}
        </Button>
      </form>
    </Card>
  );
}

// ─── Sección colapsable ────────────────────────────────────────────────

function Seccion({
  label,
  abierta,
  onToggle,
  children,
}: {
  label: string;
  abierta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-md border border-slate-200 shadow-brand-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
      >
        <span className="text-[13px] font-semibold text-text-strong">{label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={cn(
            'text-text-muted transition-transform duration-200 ease-cult',
            abierta && 'rotate-180',
          )}
        />
      </button>
      {abierta && (
        <div className="border-t border-slate-100 px-5 py-5 animate-fade-in-up">{children}</div>
      )}
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
    <div className="space-y-5">
      {seccionId === 'datos_empresa' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="space-y-4">
          <CheckField
            label="¿Tiene algún familiar empleado en esta empresa?"
            checked={get('tiene_familiar_empresa') as boolean}
            onChange={(v) => set('tiene_familiar_empresa', v)}
          />
          {(get('tiene_familiar_empresa') as boolean) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-5 border-l-2 border-slate-200">
              <Field label="Nombre y apellidos del familiar" value={get('nombre_apellidos_familiar') as string} onChange={(v) => set('nombre_apellidos_familiar', v)} />
              <Field label="Parentesco" value={get('parentesco_familiar') as string} onChange={(v) => set('parentesco_familiar', v)} />
              <Field label="Cargo que ocupa" value={get('cargo_familiar') as string} onChange={(v) => set('cargo_familiar', v)} />
            </div>
          )}
        </div>
      )}

      {seccionId === 'conyuge' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="rounded-md bg-info-50 border border-info-500/20 px-3.5 py-2.5 text-[11px] text-info-700 italic">
            Decreto 830/2021: la calidad PEP se mantiene durante el ejercicio del cargo y por 2 años
            más desde su desvinculación.
          </div>
        </div>
      )}

      {seccionId === 'clausulas' && (
        <div className="space-y-3">
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5">
            <p className="text-[12px] text-text-body italic">
              Mediante la firma del documento, el integrante declara que conoce y acepta las
              políticas de Transparencia y Ética Empresarial de la Organización Equitel y sus
              empresas. Los textos completos están en el formato F-CAR-01 oficial.
            </p>
          </div>
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
            <div className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
              <CheckCircle2 size={13} strokeWidth={1.75} />
              Firmado el {formatearFecha(dd.fecha_firma_integrante.toDate())}
            </div>
          )}
        </div>
      )}

      {seccionId === 'verificacion' && (
        <div className="space-y-4">
          {esCumplimiento ? (
            <>
              <CheckField
                label="¿Se verificó al integrante en listas vinculantes / restrictivas?"
                checked={!!get('verificado_listas_vinculantes')}
                onChange={(v) => set('verificado_listas_vinculantes', v)}
              />
              <Field
                label="Fecha de consulta"
                type="date"
                value={fmtDate(get('fecha_consulta_listas') as Timestamp | null)}
                onChange={(v) =>
                  set('fecha_consulta_listas', v ? Timestamp.fromDate(new Date(v)) : null)
                }
              />
              <TextareaField
                label="Observaciones de la verificación"
                value={get('observaciones_verificacion') as string}
                onChange={(v) => set('observaciones_verificacion', v)}
              />
              <Field
                label="Cargo del verificador"
                value={get('cargo_verificador') as string}
                onChange={(v) => set('cargo_verificador', v)}
                placeholder="ej. Oficial de Cumplimiento"
              />
              <p className="text-[11px] text-text-subtle">
                Al guardar, queda registrado: {verificadorNombre ?? '—'} (uid{' '}
                {uid.slice(0, 8)}…)
              </p>
            </>
          ) : (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-[13px] text-text-muted italic">
              Esta sección solo es editable por el oficial de cumplimiento (rol GH,
              coordinador o admin).
            </div>
          )}
        </div>
      )}

      {/* Botón guardar */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        {guardado && (
          <span className="text-[12px] text-success-700 font-medium inline-flex items-center gap-1">
            <Check size={12} strokeWidth={2} />
            Guardado
          </span>
        )}
        <Button
          onClick={guardar}
          variant="brand-primary"
          size="medium"
          disabled={!hayCambios || guardando}
          loading={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar sección'}
        </Button>
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
    onChange([
      ...vinculados,
      { nombre: '', relacion: '', identidad: '', cargo_ocupacion: '', fecha_desvinculacion: '' },
    ]);
  }
  function eliminar(i: number) {
    onChange(vinculados.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3 border-l-2 border-slate-200 pl-5">
      {vinculados.map((v, i) => (
        <div key={i} className="rounded-md border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nombre vinculado" value={v.nombre} onChange={(val) => actualizar(i, { nombre: val })} />
            <Field label="Relación" value={v.relacion} onChange={(val) => actualizar(i, { relacion: val })} />
            <Field label="N° identidad" value={v.identidad} onChange={(val) => actualizar(i, { identidad: val })} />
            <Field label="Cargo u ocupación" value={v.cargo_ocupacion} onChange={(val) => actualizar(i, { cargo_ocupacion: val })} />
            <Field label="Fecha desvinculación" type="date" value={v.fecha_desvinculacion ?? ''} onChange={(val) => actualizar(i, { fecha_desvinculacion: val })} />
          </div>
          <button
            onClick={() => eliminar(i)}
            className="text-[11px] text-danger-700 hover:text-danger-800 hover:underline font-medium"
          >
            Eliminar
          </button>
        </div>
      ))}
      <button
        onClick={agregar}
        className="text-[13px] text-brand-700 hover:text-brand-800 hover:underline font-semibold"
      >
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
    if (
      !dd.acepta_clausulas_anticorrupcion ||
      !dd.acepta_declaracion_origenes_ingreso ||
      !dd.acepta_politicas_laft
    ) {
      onError(
        'El integrante debe aceptar las 3 cláusulas (sección 6-8) antes de firmar.',
      );
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
    <div className="rounded-md border border-brand-200 bg-gradient-to-br from-brand-50/40 to-white px-5 py-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
          Workflow
        </p>
        <p className="text-[13px] text-text-body mt-1">
          Estado actual:{' '}
          <span className="font-semibold text-text-strong">
            {ESTADO_LABEL[dd.estado]}
          </span>
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {dd.estado === 'borrador' && (
          <Button onClick={firmarIntegrante} variant="brand-primary" size="medium">
            Marcar como firmado por integrante
          </Button>
        )}
        {dd.estado === 'firmado_integrante' && esCumplimiento && (
          <>
            <Button onClick={rechazar} variant="destructive-secondary" size="medium">
              Rechazar
            </Button>
            <Button
              onClick={aprobarCumplimiento}
              variant="brand-primary"
              size="medium"
              icon={<CheckCircle2 size={13} strokeWidth={1.75} />}
            >
              Aprobar VoBo Cumplimiento
            </Button>
          </>
        )}
        {dd.estado === 'completado' && dd.verificado_por_nombre && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-success-700 font-medium">
            <CheckCircle2 size={13} strokeWidth={1.75} />
            Aprobado por {dd.verificado_por_nombre}
          </span>
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

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">{label}</span>
      <input
        type={type ?? 'text'}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">{label}</span>
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300/40"
      />
      <span className="text-[13px] text-text-body group-hover:text-text-strong transition-colors">
        {label}
      </span>
    </label>
  );
}

function PreguntaSiNo({
  pregunta,
  valor,
  detalle,
  onValor,
  onDetalle,
  etiquetaDetalle,
}: {
  pregunta: string;
  valor: boolean;
  detalle: string;
  onValor: (v: boolean) => void;
  onDetalle: (v: string) => void;
  etiquetaDetalle?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-4 space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[13px] text-text-strong font-medium flex-1 min-w-[200px]">
          {pregunta}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onValor(true)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors duration-150',
              valor === true
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-slate-300 text-text-body hover:bg-slate-50',
            )}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => onValor(false)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors duration-150',
              valor === false
                ? 'bg-text-strong text-white'
                : 'bg-white border border-slate-300 text-text-body hover:bg-slate-50',
            )}
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
