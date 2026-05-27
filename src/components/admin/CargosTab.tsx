import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { cargoInputSchema, type CargoInput } from '../../schemas';
import { useCargos } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';
import { formatearCOP } from '../../utils/moneda';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

const HERRAMIENTAS = [
  'computador',
  'office',
  'celular_plan_datos',
  'labroides',
  'dotacion',
] as const;

const HERRAMIENTA_LABEL: Record<(typeof HERRAMIENTAS)[number], string> = {
  computador: 'Computador',
  office: 'Office / M365',
  celular_plan_datos: 'Celular + plan de datos',
  labroides: 'Labroides',
  dotacion: 'Dotación',
};

const CRITICIDAD_TONO: Record<string, PillTono> = {
  Alta: 'danger',
  Media: 'warning',
  Baja: 'success',
};

export function CargosTab() {
  const { cargos } = useCargos();
  const { crearCargo } = useAdminCatalogos();
  const [err, setErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CargoInput>({
    resolver: zodResolver(cargoInputSchema),
    defaultValues: {
      nombre: '',
      categoria: 'operativo',
      criticidad_sugerida: 'Media',
      banda_min: null,
      banda_max: null,
      requiere_licencia: false,
      requiere_moto: false,
      requiere_tarjeta_profesional: false,
      requiere_titulo_profesional: false,
      pruebas_sugeridas: [],
      herramientas_sugeridas: {
        computador: false,
        office: false,
        celular_plan_datos: false,
        labroides: false,
        dotacion: false,
      },
      activo: true,
    },
  });

  async function onSubmit(data: CargoInput) {
    setErr(null);
    try {
      await crearCargo(data);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos crear el cargo.');
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card padding="none">
          <div className="overflow-hidden rounded-md">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Nombre
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Categoría
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Criticidad
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Banda
                  </th>
                </tr>
              </thead>
              <tbody>
                {cargos.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-text-strong font-medium">{c.nombre}</td>
                    <td className="px-4 py-3 text-text-muted capitalize">{c.categoria}</td>
                    <td className="px-4 py-3">
                      <Pill tono={CRITICIDAD_TONO[c.criticidad_sugerida] ?? 'neutral'}>
                        {c.criticidad_sugerida}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text-body">
                      {c.banda_min != null && c.banda_max != null ? (
                        <span>
                          {formatearCOP(c.banda_min)}{' '}
                          <span className="text-text-subtle">–</span>{' '}
                          {formatearCOP(c.banda_max)}
                        </span>
                      ) : (
                        <span className="text-text-subtle italic">Sin banda</span>
                      )}
                    </td>
                  </tr>
                ))}
                {cargos.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-[13px] text-text-muted italic"
                    >
                      Sin cargos. Crea uno o corre el seed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card padding="md">
          <h3 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong mb-1">
            Nuevo cargo
          </h3>
          <p className="text-[12px] text-text-muted mb-4">
            Cargo del catálogo con banda salarial y herramientas sugeridas.
          </p>
          <div className="space-y-3">
            <Field label="Nombre" error={errors.nombre?.message}>
              <input {...register('nombre')} className={inputClass} />
            </Field>
            <Field label="Categoría">
              <select {...register('categoria')} className={inputClass}>
                <option value="comercial">Comercial</option>
                <option value="tecnico">Técnico</option>
                <option value="administrativo">Administrativo</option>
                <option value="operativo">Operativo</option>
                <option value="liderazgo">Liderazgo</option>
              </select>
            </Field>
            <Field label="Criticidad sugerida">
              <select {...register('criticidad_sugerida')} className={inputClass}>
                <option value="Alta">Alta</option>
                <option value="Media">Media</option>
                <option value="Baja">Baja</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Banda min">
                <input
                  type="number"
                  {...register('banda_min', {
                    setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                  })}
                  className={cn(inputClass, 'tabular-nums')}
                />
              </Field>
              <Field label="Banda max">
                <input
                  type="number"
                  {...register('banda_max', {
                    setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                  })}
                  className={cn(inputClass, 'tabular-nums')}
                />
              </Field>
            </div>
            {(errors.banda_min || errors.banda_max) && (
              <p className="text-[11px] text-danger-700">
                {errors.banda_min?.message ?? errors.banda_max?.message}
              </p>
            )}

            <fieldset>
              <legend className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-2">
                Herramientas sugeridas
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {HERRAMIENTAS.map((k) => (
                  <label
                    key={k}
                    className={cn(
                      'flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60',
                      'px-2.5 py-2 text-[12px] cursor-pointer hover:bg-slate-100/60 transition-colors',
                    )}
                  >
                    <input
                      type="checkbox"
                      {...register(`herramientas_sugeridas.${k}` as const)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-300/40"
                    />
                    <span className="text-text-body">{HERRAMIENTA_LABEL[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {err && (
              <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
                {err}
              </div>
            )}
            <Button
              type="submit"
              variant="brand-primary"
              size="medium"
              loading={isSubmitting}
              disabled={isSubmitting}
              icon={<Plus size={13} strokeWidth={1.75} />}
              fullWidth
            >
              {isSubmitting ? 'Guardando…' : 'Crear cargo'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">
        {label}
      </span>
      {children}
      {error && <p className="mt-1 text-[11px] text-danger-700">{error}</p>}
    </label>
  );
}
