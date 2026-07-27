import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building2,
  Calendar,
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
} from 'lucide-react';
import {
  useEmpresas,
  useFestivosAnio,
  useSedesDeEmpresa,
  useUnidadesDeSede,
} from '../../hooks/useCatalogos';
import { useVacantes } from '../../hooks/useVacantes';
import { useAuth } from '../../hooks/useAuth';
import { RODAMIENTO_OPCIONES, RODAMIENTO_FIJOS } from '../../utils/rodamiento';
import {
  vacanteInputSchema,
  type CargoDoc,
  type VacanteInput,
} from '../../schemas';
import { AvalUploader } from './AvalUploader';
import { SelectorCargo } from './SelectorCargo';
import { ValidadorSalario } from './ValidadorSalario';
import { VacanteCreadaModal } from './VacanteCreadaModal';
import { Button } from '../brand';
import {
  fechaInputValue,
  parsearFechaInput,
  sumarDiasHabiles,
} from '../../utils/fechas';
import { cn } from '../../utils/cn';

/**
 * VacanteForm · sistema brand.
 *
 * 4 secciones expandibles (Card brand con header click) con eyebrow uppercase
 * y contenido en grid. Selects e inputs nativos estilizados con sunken
 * brand (bg-slate-50, focus brand-400). Submit en brand-primary.
 */

function Seccion({
  titulo,
  eyebrow,
  icono,
  abierta,
  onToggle,
  children,
}: {
  titulo: string;
  eyebrow: string;
  icono: ReactNode;
  abierta: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-md border border-slate-200 shadow-brand-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-5 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-slate-100 text-text-muted flex items-center justify-center">
            {icono}
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-subtle">
              {eyebrow}
            </p>
            <p className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong mt-0.5">
              {titulo}
            </p>
          </div>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={1.5}
          className={cn(
            'text-text-muted transition-transform duration-200 ease-cult',
            abierta && 'rotate-180',
          )}
        />
      </button>
      {abierta && (
        <div className="border-t border-slate-100 px-6 py-6 space-y-5 animate-fade-in-up">
          {children}
        </div>
      )}
    </div>
  );
}

function Campo({
  label,
  requerido,
  error,
  ayuda,
  children,
}: {
  label: string;
  requerido?: boolean;
  error?: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">
        {label} {requerido && <span className="text-brand-600">*</span>}
      </span>
      {children}
      {ayuda && <span className="mt-1.5 block text-[11px] text-text-subtle">{ayuda}</span>}
      {error && <span className="mt-1.5 block text-[11px] text-danger-700">{error}</span>}
    </label>
  );
}

const selectClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 disabled:bg-slate-100 disabled:text-text-subtle disabled:cursor-not-allowed';

const inputClass = selectClass; // mismas clases base que select
const textareaClass = selectClass + ' resize-none leading-relaxed';

export function VacanteForm() {
  const { user, perfil } = useAuth();
  const { empresas } = useEmpresas();
  const { crearVacante } = useVacantes();

  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({
    empresa: true,
    condiciones: false,
    aval: false,
    agendamiento: false,
  });
  const [cargoSel, setCargoSel] = useState<CargoDoc | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorSubmit, setErrorSubmit] = useState<string | null>(null);
  // Rodamiento: true cuando el valor elegido no es de la lista (modo "Otro valor").
  const [rodOtro, setRodOtro] = useState(false);
  const [creadaId, setCreadaId] = useState<string | null>(null);

  const anioActual = useMemo(() => new Date().getFullYear(), []);
  const festivos = useFestivosAnio(anioActual);

  const minFecha = useMemo(() => sumarDiasHabiles(new Date(), 3, festivos), [festivos]);
  const maxFecha = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  }, []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<VacanteInput>({
    resolver: zodResolver(vacanteInputSchema),
    defaultValues: {
      empresa_codigo: '',
      empresa_nombre: '',
      sede_codigo: '',
      sede_nombre: '',
      unidad_id: '',
      unidad_nombre: '',
      cargo_id: '',
      cargo_nombre: '',
      cargo_criticidad_al_crear: 'Media',
      criticidad: 'Media',
      tipo_solicitud: 'reemplazo_indefinido',
      reemplaza_a_nombre: '',
      temporalidad_meses: null,
      temporalidad_descripcion: '',
      justificacion: '',
      salario_base: undefined as unknown as number,
      comisiones_texto: '',
      rodamiento: false,
      rodamiento_valor: '',
      garantizado_texto: '',
      en_banda: null,
      sin_banda_validada: false,
      requiere_validacion_gh: false,
      aval_url: '',
      aval_drive_file_id: '',
      aval_pendiente: false,
      aval_no_requiere: false,
      lider_uid: '',
      lider_nombre: '',
    },
  });

  const empresaCodigo = watch('empresa_codigo');
  const rodamientoValor = watch('rodamiento_valor');
  const sedeCodigo = watch('sede_codigo');
  const unidadId = watch('unidad_id');
  const salario = watch('salario_base');
  const avalUrl = watch('aval_url');
  const noRequiereAval = watch('aval_no_requiere');
  const tipoSolicitudActual = watch('tipo_solicitud');

  const { sedes } = useSedesDeEmpresa(empresaCodigo || null);
  const { unidades } = useUnidadesDeSede(sedeCodigo || null);

  useEffect(() => {
    if (user && perfil) {
      setValue('lider_uid', user.uid);
      setValue('lider_nombre', `${perfil.nombre} ${perfil.apellido}`);
    }
  }, [user, perfil, setValue]);

  useEffect(() => {
    const emp = empresas.find((e) => e.codigo === empresaCodigo);
    setValue('empresa_nombre', emp?.nombre ?? '');
    setValue('sede_codigo', '');
    setValue('sede_nombre', '');
    setValue('unidad_id', '');
    setValue('unidad_nombre', '');
  }, [empresaCodigo, empresas, setValue]);

  useEffect(() => {
    const s = sedes.find((x) => x.codigo === sedeCodigo);
    setValue('sede_nombre', s?.nombre ?? '');
    setValue('unidad_id', '');
    setValue('unidad_nombre', '');
  }, [sedeCodigo, sedes, setValue]);

  useEffect(() => {
    const u = unidades.find((x) => x.id === unidadId);
    setValue('unidad_nombre', u?.nombre ?? '');
  }, [unidadId, unidades, setValue]);

  useEffect(() => {
    const bandaMin = cargoSel?.banda_min;
    const bandaMax = cargoSel?.banda_max;
    const tieneBanda = bandaMin != null && bandaMax != null;
    let enBanda: boolean | null = null;
    let requiereGH = false;
    if (typeof salario === 'number' && tieneBanda) {
      enBanda = salario >= (bandaMin as number) && salario <= (bandaMax as number);
      requiereGH = !enBanda;
    }
    setValue('en_banda', enBanda);
    setValue('sin_banda_validada', !tieneBanda);
    setValue('requiere_validacion_gh', requiereGH);
  }, [salario, cargoSel, setValue]);

  function toggle(key: string) {
    setAbiertas((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onPickCargo(c: CargoDoc | null) {
    setCargoSel(c);
    setValue('cargo_id', c?.id ?? '', { shouldValidate: true });
    setValue('cargo_nombre', c?.nombre ?? '');
    if (c) {
      setValue('cargo_criticidad_al_crear', c.criticidad_sugerida);
      setValue('criticidad', c.criticidad_sugerida);
    }
  }

  async function onSubmit(data: VacanteInput) {
    setEnviando(true);
    setErrorSubmit(null);

    // Validación cruzada según tipo de solicitud.
    if (
      data.tipo_solicitud === 'reemplazo_indefinido' &&
      !data.reemplaza_a_nombre.trim()
    ) {
      setEnviando(false);
      setErrorSubmit('Indica el nombre de la persona que se reemplaza.');
      return;
    }
    if (
      data.tipo_solicitud === 'necesidad_temporal' &&
      (data.temporalidad_meses == null || data.temporalidad_meses < 1)
    ) {
      setEnviando(false);
      setErrorSubmit('Indica la duración estimada en meses (1–36).');
      return;
    }

    try {
      const payload: VacanteInput = {
        ...data,
        // El boolean `rodamiento` se deriva del valor elegido en el desplegable:
        // vacío o "No aplica" = sin rodamiento; cualquier otro valor = sí.
        rodamiento: data.rodamiento_valor.trim() !== '' && data.rodamiento_valor.trim() !== 'No aplica',
        // Aval pendiente solo si NO se adjuntó PDF y NO se marcó "no requiere".
        aval_pendiente: (!data.aval_url || data.aval_url.length === 0) && !data.aval_no_requiere,
        // Si no requiere aval, no arrastramos URL/archivo.
        aval_url: data.aval_no_requiere ? '' : data.aval_url,
        aval_drive_file_id: data.aval_no_requiere ? '' : data.aval_drive_file_id,
        // Limpia campos que no aplican al tipo elegido (evita "basura" en Firestore).
        reemplaza_a_nombre:
          data.tipo_solicitud === 'reemplazo_indefinido' ? data.reemplaza_a_nombre.trim() : '',
        temporalidad_meses:
          data.tipo_solicitud === 'necesidad_temporal' ? data.temporalidad_meses : null,
        temporalidad_descripcion:
          data.tipo_solicitud === 'necesidad_temporal'
            ? data.temporalidad_descripcion.trim()
            : '',
      };
      const res = await crearVacante(payload);
      setCreadaId(res.id);
    } catch (e) {
      setErrorSubmit(e instanceof Error ? e.message : 'No pudimos enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  function onModalClose() {
    setCreadaId(null);
    setCargoSel(null);
    reset();
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ─── Empresa y cargo ──────────────────────────────────── */}
        <Seccion
          eyebrow="Identificación"
          titulo="Empresa y cargo"
          icono={<Building2 size={18} strokeWidth={1.75} />}
          abierta={abiertas.empresa}
          onToggle={() => toggle('empresa')}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Campo label="Empresa" requerido error={errors.empresa_codigo?.message}>
              <select {...register('empresa_codigo')} className={selectClass}>
                <option value="">Selecciona…</option>
                {empresas.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Sede" requerido error={errors.sede_codigo?.message}>
              <select
                {...register('sede_codigo')}
                disabled={!empresaCodigo}
                className={selectClass}
              >
                <option value="">
                  {empresaCodigo ? 'Selecciona…' : 'Selecciona una empresa primero'}
                </option>
                {sedes.map((s) => (
                  <option key={s.codigo} value={s.codigo}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Unidad" requerido error={errors.unidad_id?.message}>
              <select
                {...register('unidad_id')}
                disabled={!sedeCodigo}
                className={selectClass}
              >
                <option value="">
                  {sedeCodigo ? 'Selecciona…' : 'Selecciona una sede primero'}
                </option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cargo" requerido error={errors.cargo_id?.message}>
              <Controller
                control={control}
                name="cargo_id"
                render={({ field }) => (
                  <SelectorCargo
                    value={field.value}
                    onChange={onPickCargo}
                    error={errors.cargo_id?.message}
                  />
                )}
              />
            </Campo>
            <Campo label="Criticidad" requerido error={errors.criticidad?.message}>
              <select {...register('criticidad')} className={selectClass}>
                <option value="Alta">Alta · crítico</option>
                <option value="Media">Media · intermedio</option>
                <option value="Baja">Baja · simplificado</option>
              </select>
            </Campo>
            <Campo label="Tipo de solicitud" requerido error={errors.tipo_solicitud?.message}>
              <select {...register('tipo_solicitud')} className={selectClass}>
                <option value="reemplazo_indefinido">Reemplazo indefinido</option>
                <option value="aumento_planta">Aumento de planta</option>
                <option value="necesidad_temporal">Necesidad temporal</option>
              </select>
            </Campo>
          </div>

          {/* ─── Campos condicionales por tipo de solicitud ──────── */}
          {tipoSolicitudActual === 'reemplazo_indefinido' && (
            <div className="mt-4 rounded-md border border-info-500/30 bg-info-50/40 p-4">
              <Campo
                label="¿A quién reemplaza?"
                requerido
                error={errors.reemplaza_a_nombre?.message}
              >
                <input
                  {...register('reemplaza_a_nombre')}
                  className={inputClass}
                  placeholder="Nombre completo de la persona que sale"
                />
              </Campo>
              <p className="mt-2 text-[11px] text-text-muted leading-[1.5]">
                Este dato permite a GH cruzar contra el control de planta y validar la baja.
              </p>
            </div>
          )}

          {tipoSolicitudActual === 'necesidad_temporal' && (
            <div className="mt-4 rounded-md border border-warning-500/30 bg-warning-50/40 p-4 space-y-3">
              <Campo
                label="Duración estimada (meses)"
                requerido
                error={errors.temporalidad_meses?.message}
              >
                <input
                  type="number"
                  min={1}
                  max={36}
                  {...register('temporalidad_meses', {
                    setValueAs: (v) =>
                      v === '' || v == null ? null : Number(v),
                  })}
                  className={cn(inputClass, 'tabular-nums max-w-[180px]')}
                  placeholder="Ej. 6"
                />
              </Campo>
              <Campo
                label="Contexto de la temporalidad (opcional)"
                error={errors.temporalidad_descripcion?.message}
              >
                <textarea
                  {...register('temporalidad_descripcion')}
                  rows={2}
                  className={textareaClass}
                  placeholder="Ej. cobertura por proyecto X, pico de fin de año, reemplazo por licencia de maternidad…"
                />
              </Campo>
              <p className="text-[11px] text-text-muted leading-[1.5]">
                Después de la fecha estimada GH/coordinación revisa si la posición se vuelve
                permanente o se cierra.
              </p>
            </div>
          )}
        </Seccion>

        {/* ─── Condiciones ──────────────────────────────────────── */}
        <Seccion
          eyebrow="Compensación"
          titulo="Condiciones"
          icono={<CircleDollarSign size={18} strokeWidth={1.75} />}
          abierta={abiertas.condiciones}
          onToggle={() => toggle('condiciones')}
        >
          <Campo
            label="Salario base mensual (COP)"
            requerido
            error={errors.salario_base?.message}
          >
            <Controller
              control={control}
              name="salario_base"
              render={({ field }) => (
                <ValidadorSalario
                  value={(field.value as number | undefined) ?? ''}
                  onChange={(v) => field.onChange(v === '' ? undefined : v)}
                  bandaMin={cargoSel?.banda_min ?? null}
                  bandaMax={cargoSel?.banda_max ?? null}
                  error={errors.salario_base?.message}
                />
              )}
            />
          </Campo>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Campo label="Comisiones (descripción)">
              <textarea
                {...register('comisiones_texto')}
                rows={3}
                placeholder="Describe el esquema si aplica"
                className={textareaClass}
              />
            </Campo>
            <Campo label="Garantizado (descripción)">
              <textarea
                {...register('garantizado_texto')}
                rows={3}
                placeholder="Monto, duración y condiciones"
                className={textareaClass}
              />
            </Campo>
          </div>
          <Campo label="Auxilio de rodamiento">
            <select
              value={rodOtro ? '__otro__' : RODAMIENTO_FIJOS.has(rodamientoValor ?? '') ? rodamientoValor : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__otro__') {
                  setRodOtro(true);
                  setValue('rodamiento_valor', '');
                } else {
                  setRodOtro(false);
                  setValue('rodamiento_valor', v);
                }
              }}
              className={selectClass}
            >
              <option value="">Selecciona…</option>
              {RODAMIENTO_OPCIONES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
              <option value="__otro__">Otro valor…</option>
            </select>
            {rodOtro && (
              <input
                {...register('rodamiento_valor')}
                placeholder="Escribe el valor del rodamiento"
                className={inputClass + ' mt-2'}
              />
            )}
          </Campo>
          <Campo label="Justificación" requerido error={errors.justificacion?.message}>
            <textarea
              {...register('justificacion')}
              rows={4}
              placeholder="Explica la necesidad de esta vacante: contexto, urgencia, impacto."
              className={textareaClass}
            />
          </Campo>
        </Seccion>

        {/* ─── Aval ─────────────────────────────────────────────── */}
        <Seccion
          eyebrow="Aprobación"
          titulo="Aval firmado"
          icono={<FileCheck2 size={18} strokeWidth={1.75} />}
          abierta={abiertas.aval}
          onToggle={() => toggle('aval')}
        >
          {/* "No requiere aval" (ej. reemplazo): no quedará pendiente en Aprobaciones. */}
          <label className="flex items-start gap-2.5 cursor-pointer mb-3">
            <Controller
              control={control}
              name="aval_no_requiere"
              render={({ field }) => (
                <input
                  type="checkbox"
                  checked={!!field.value}
                  onChange={(e) => {
                    field.onChange(e.target.checked);
                    if (e.target.checked) {
                      setValue('aval_url', '');
                      setValue('aval_drive_file_id', '');
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
              )}
            />
            <span className="text-[13px] text-text-body leading-[1.5]">
              <strong>Este cargo no requiere aval</strong> (p. ej. un reemplazo). No quedará marcado
              como pendiente de aval.
            </span>
          </label>

          {!noRequiereAval && (
            <>
              <Controller
                control={control}
                name="aval_url"
                render={({ field }) => (
                  <AvalUploader
                    empresaCodigo={empresaCodigo}
                    value={field.value || undefined}
                    driveFileId={watch('aval_drive_file_id') || undefined}
                    onChange={(info) => {
                      field.onChange(info?.url ?? '');
                      setValue('aval_drive_file_id', info?.driveFileId ?? '');
                    }}
                  />
                )}
              />
              {errors.aval_url && (
                <p className="text-[11px] text-danger-700">{errors.aval_url.message}</p>
              )}
              {/* Aval opcional al crear: si no lo tiene, igual puede enviar (aval_pendiente). */}
              {!avalUrl && (
                <div className="mt-3 rounded-md border border-warning-500/30 bg-warning-50/40 px-3.5 py-2.5">
                  <p className="text-[12px] text-warning-700 leading-[1.55]">
                    <span className="font-semibold">Aval pendiente.</span> Si aún no tienes el aval
                    firmado, puedes enviar la solicitud igual — quedará marcada como{' '}
                    <span className="font-medium">pendiente de aval</span> y GH/coordinación lo
                    gestiona en el paso 2. Tu vacante no se bloquea por esto.
                  </p>
                </div>
              )}
            </>
          )}
        </Seccion>

        {/* ─── Agendamiento ─────────────────────────────────────── */}
        <Seccion
          eyebrow="Entrevista con líder"
          titulo="Agendamiento"
          icono={<Calendar size={18} strokeWidth={1.75} />}
          abierta={abiertas.agendamiento}
          onToggle={() => toggle('agendamiento')}
        >
          <Campo
            label="Fecha propuesta para entrevista con el líder"
            requerido
            error={errors.fecha_entrevista_propuesta?.message as string | undefined}
            ayuda={`Mínimo ${fechaInputValue(minFecha)} · Máximo ${fechaInputValue(maxFecha)} (hoy + 3 hábiles hasta hoy + 30 días)`}
          >
            <Controller
              control={control}
              name="fecha_entrevista_propuesta"
              render={({ field }) => (
                <input
                  type="date"
                  min={fechaInputValue(minFecha)}
                  max={fechaInputValue(maxFecha)}
                  value={field.value instanceof Date ? fechaInputValue(field.value) : ''}
                  onChange={(e) => field.onChange(parsearFechaInput(e.target.value))}
                  className={selectClass}
                />
              )}
            />
          </Campo>
        </Seccion>

        {errorSubmit && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-4 py-3 text-[13px] text-danger-700">
            {errorSubmit}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="brand-primary"
            size="large"
            disabled={enviando}
            loading={enviando}
          >
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </div>
      </form>

      {creadaId && <VacanteCreadaModal vacanteId={creadaId} onClose={onModalClose} />}
    </>
  );
}
