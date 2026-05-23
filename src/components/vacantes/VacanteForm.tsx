import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import {
  useEmpresas,
  useFestivosAnio,
  useSedesDeEmpresa,
  useUnidadesDeSede,
} from '../../hooks/useCatalogos';
import { useVacantes } from '../../hooks/useVacantes';
import { useAuth } from '../../hooks/useAuth';
import {
  vacanteInputSchema,
  type CargoDoc,
  type VacanteInput,
} from '../../schemas';
import { AvalUploader } from './AvalUploader';
import { SelectorCargo } from './SelectorCargo';
import { ValidadorSalario } from './ValidadorSalario';
import { VacanteCreadaModal } from './VacanteCreadaModal';
import {
  fechaInputValue,
  parsearFechaInput,
  sumarDiasHabiles,
} from '../../utils/fechas';

function Seccion({
  titulo,
  abierta,
  onToggle,
  children,
}: {
  titulo: string;
  abierta: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-base font-semibold text-navy-900">{titulo}</span>
        <ChevronDown
          size={20}
          className={`text-navy-600 transition ${abierta ? 'rotate-180' : ''}`}
        />
      </button>
      {abierta && <div className="border-t border-navy-100 px-5 py-4 space-y-4">{children}</div>}
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
      <span className="block text-sm font-medium text-navy-800 mb-1">
        {label} {requerido && <span className="text-red-500">*</span>}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-navy-500">{ayuda}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

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
      tipo_solicitud: 'reemplazo',
      justificacion: '',
      salario_base: undefined as unknown as number,
      comisiones_texto: '',
      rodamiento: false,
      garantizado_texto: '',
      en_banda: null,
      sin_banda_validada: false,
      requiere_validacion_gh: false,
      aval_url: '',
      lider_uid: '',
      lider_nombre: '',
    },
  });

  const empresaCodigo = watch('empresa_codigo');
  const sedeCodigo = watch('sede_codigo');
  const unidadId = watch('unidad_id');
  const salario = watch('salario_base');
  const avalUrl = watch('aval_url');

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
    try {
      const res = await crearVacante(data);
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Seccion
          titulo="Empresa y cargo"
          abierta={abiertas.empresa}
          onToggle={() => toggle('empresa')}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo label="Empresa" requerido error={errors.empresa_codigo?.message}>
              <select
                {...register('empresa_codigo')}
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
              >
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
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm disabled:bg-navy-50"
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
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm disabled:bg-navy-50"
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
              <select
                {...register('criticidad')}
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
              >
                <option value="Alta">Alta</option>
                <option value="Media">Media</option>
                <option value="Baja">Baja</option>
              </select>
            </Campo>
            <Campo label="Tipo de solicitud" requerido error={errors.tipo_solicitud?.message}>
              <select
                {...register('tipo_solicitud')}
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
              >
                <option value="reemplazo">Reemplazo</option>
                <option value="aumento">Aumento de headcount</option>
              </select>
            </Campo>
          </div>
        </Seccion>

        <Seccion
          titulo="Condiciones"
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
          <Campo label="Comisiones (descripción)">
            <textarea
              {...register('comisiones_texto')}
              rows={2}
              placeholder="Describe el esquema si aplica"
              className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
            />
          </Campo>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('rodamiento')} className="h-4 w-4 rounded" />
            <span className="text-sm text-navy-800">Incluye auxilio de rodamiento</span>
          </label>
          <Campo label="Garantizado (descripción)">
            <textarea
              {...register('garantizado_texto')}
              rows={2}
              placeholder="Monto, duración y condiciones del garantizado"
              className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
            />
          </Campo>
          <Campo label="Justificación" requerido error={errors.justificacion?.message}>
            <textarea
              {...register('justificacion')}
              rows={4}
              placeholder="Explica la necesidad de esta vacante"
              className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
            />
          </Campo>
        </Seccion>

        <Seccion titulo="Aval" abierta={abiertas.aval} onToggle={() => toggle('aval')}>
          <Controller
            control={control}
            name="aval_url"
            render={({ field }) => (
              <AvalUploader
                empresaCodigo={empresaCodigo}
                value={field.value || undefined}
                onChange={(url) => field.onChange(url ?? '')}
              />
            )}
          />
          {errors.aval_url && (
            <p className="text-xs text-red-600">{errors.aval_url.message}</p>
          )}
        </Seccion>

        <Seccion
          titulo="Agendamiento"
          abierta={abiertas.agendamiento}
          onToggle={() => toggle('agendamiento')}
        >
          <Campo
            label="Fecha propuesta para entrevista con líder"
            requerido
            error={errors.fecha_entrevista_propuesta?.message as string | undefined}
            ayuda={`Mínimo ${fechaInputValue(minFecha)} · Máximo ${fechaInputValue(maxFecha)} (hoy + 3 hábiles a hoy + 30 días)`}
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
                  className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
                />
              )}
            />
          </Campo>
        </Seccion>

        {errorSubmit && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorSubmit}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={enviando || !avalUrl}
            className="rounded-md bg-navy-700 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-navy-800 disabled:bg-navy-300"
          >
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </form>

      {creadaId && <VacanteCreadaModal vacanteId={creadaId} onClose={onModalClose} />}
    </>
  );
}
