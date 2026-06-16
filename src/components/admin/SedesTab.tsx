import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, MapPin, Ban } from 'lucide-react';
import { sedeInputSchema, type SedeInput } from '../../schemas';
import { useEmpresas, useSedesDeEmpresa } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

export function SedesTab() {
  const { empresas } = useEmpresas();
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('');
  const { sedes } = useSedesDeEmpresa(empresaFiltro || null);
  const { crearSede, actualizarSede } = useAdminCatalogos();
  const [err, setErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SedeInput>({
    resolver: zodResolver(sedeInputSchema),
    defaultValues: {
      codigo: '',
      empresa_codigo: '',
      nombre: '',
      ciudad: '',
      direccion: '',
      activo: true,
    },
  });

  async function onSubmit(data: SedeInput) {
    setErr(null);
    try {
      await crearSede(data);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos crear la sede.');
    }
  }

  async function desactivar(s: { id: string; nombre: string }) {
    if (
      !window.confirm(
        `¿Desactivar la sede "${s.nombre}"? Dejará de aparecer en los formularios. Se puede reactivar después.`,
      )
    )
      return;
    setErr(null);
    try {
      await actualizarSede(s.id, { activo: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos desactivar la sede.');
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <Field label="Filtrar por empresa">
          <select
            value={empresaFiltro}
            onChange={(e) => setEmpresaFiltro(e.target.value)}
            className={inputClass}
          >
            <option value="">Selecciona una empresa</option>
            {empresas.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Card padding="none">
          <div className="overflow-hidden rounded-md">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Código
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Nombre
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Empresa
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Ciudad
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {sedes.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-strong">
                      <div className="flex items-center gap-1.5">
                        {s.codigo}
                        {s.es_provisional && (
                          <span title="Código provisional · pendiente de validar con GH (ATR-21)">
                            <Pill tono="warning">prov</Pill>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-body">{s.nombre}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">
                      {s.empresa_codigo}
                    </td>
                    <td className="px-4 py-3 text-text-body inline-flex items-center gap-1.5">
                      <MapPin
                        size={11}
                        strokeWidth={1.5}
                        className="text-text-subtle shrink-0"
                      />
                      {s.ciudad}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => desactivar(s)}
                        className="inline-flex items-center gap-1 text-[12px] text-danger-700 hover:text-danger-800 hover:underline font-medium"
                        title="Desactivar · la quita de los formularios"
                      >
                        <Ban size={11} strokeWidth={1.75} />
                        Desactivar
                      </button>
                    </td>
                  </tr>
                ))}
                {sedes.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-[13px] text-text-muted italic"
                    >
                      {empresaFiltro ? 'Sin sedes para esta empresa.' : 'Selecciona una empresa.'}
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
            Nueva sede
          </h3>
          <p className="text-[12px] text-text-muted mb-4">
            Código tipo ciudad/abreviatura (ej. BOG, MED).
          </p>
          <div className="space-y-3">
            <Field label="Código (3-4 letras)" error={errors.codigo?.message}>
              <input {...register('codigo')} className={inputClass} placeholder="BOG" />
            </Field>
            <Field label="Empresa" error={errors.empresa_codigo?.message}>
              <select {...register('empresa_codigo')} className={inputClass}>
                <option value="">Selecciona</option>
                {empresas.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nombre" error={errors.nombre?.message}>
              <input {...register('nombre')} className={inputClass} />
            </Field>
            <Field label="Ciudad" error={errors.ciudad?.message}>
              <input {...register('ciudad')} className={inputClass} />
            </Field>
            <Field label="Dirección">
              <input {...register('direccion')} className={inputClass} />
            </Field>
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
              {isSubmitting ? 'Guardando…' : 'Crear sede'}
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
