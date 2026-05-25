import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { unidadInputSchema, type UnidadInput } from '../../schemas';
import { useEmpresas, useSedesDeEmpresa, useUnidadesDeSede } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';
import { Button, Card } from '../../components/brand';
import { cn } from '../../utils/cn';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
  'disabled:bg-slate-100 disabled:text-text-muted disabled:cursor-not-allowed',
);

export function UnidadesTab() {
  const { empresas } = useEmpresas();
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const { sedes } = useSedesDeEmpresa(empresaFiltro || null);
  const [sedeFiltro, setSedeFiltro] = useState('');
  const { unidades } = useUnidadesDeSede(sedeFiltro || null);
  const { crearUnidad } = useAdminCatalogos();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setSedeFiltro(''), [empresaFiltro]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UnidadInput>({
    resolver: zodResolver(unidadInputSchema),
    defaultValues: { empresa_codigo: '', sede_codigo: '', nombre: '', activo: true },
  });

  const empresaForm = watch('empresa_codigo');
  const { sedes: sedesForm } = useSedesDeEmpresa(empresaForm || null);

  useEffect(() => {
    setValue('sede_codigo', '');
  }, [empresaForm, setValue]);

  async function onSubmit(data: UnidadInput) {
    setErr(null);
    try {
      await crearUnidad(data);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos crear la unidad.');
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empresa">
            <select
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona</option>
              {empresas.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sede">
            <select
              value={sedeFiltro}
              onChange={(e) => setSedeFiltro(e.target.value)}
              disabled={!empresaFiltro}
              className={inputClass}
            >
              <option value="">Selecciona</option>
              {sedes.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Card padding="none">
          <div className="overflow-hidden rounded-md">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Nombre
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Sede
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Empresa
                  </th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-text-strong">{u.nombre}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">
                      {u.sede_codigo}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">
                      {u.empresa_codigo}
                    </td>
                  </tr>
                ))}
                {unidades.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-[13px] text-text-muted italic"
                    >
                      Selecciona empresa y sede para ver unidades.
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
            Nueva unidad
          </h3>
          <p className="text-[12px] text-text-muted mb-4">
            Departamento o área dentro de una sede.
          </p>
          <div className="space-y-3">
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
            <Field label="Sede" error={errors.sede_codigo?.message}>
              <select
                {...register('sede_codigo')}
                disabled={!empresaForm}
                className={inputClass}
              >
                <option value="">Selecciona</option>
                {sedesForm.map((s) => (
                  <option key={s.codigo} value={s.codigo}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nombre" error={errors.nombre?.message}>
              <input {...register('nombre')} className={inputClass} />
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
              {isSubmitting ? 'Guardando…' : 'Crear unidad'}
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
