import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Check } from 'lucide-react';
import { empresaInputSchema, type EmpresaInput } from '../../schemas';
import { useEmpresas } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

export function EmpresasTab() {
  const { empresas } = useEmpresas();
  const { crearEmpresa } = useAdminCatalogos();
  const [err, setErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmpresaInput>({
    resolver: zodResolver(empresaInputSchema),
    defaultValues: { codigo: '', nombre: '', razon_social: '', nit: '', activo: true },
  });

  async function onSubmit(data: EmpresaInput) {
    setErr(null);
    try {
      await crearEmpresa(data);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos crear la empresa.');
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
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
                    NIT
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Activo
                  </th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-strong">
                      <div className="flex items-center gap-1.5">
                        {e.codigo}
                        {e.es_provisional && (
                          <span title="Código provisional · pendiente de validar con GH (ATR-21)">
                            <Pill tono="warning">prov</Pill>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-body">{e.nombre}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">{e.nit}</td>
                    <td className="px-4 py-3">
                      {e.activo ? (
                        <Check size={14} strokeWidth={2} className="text-success-700" />
                      ) : (
                        <span className="text-text-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {empresas.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-[13px] text-text-muted italic"
                    >
                      Sin empresas. Crea la primera o corre el seed.
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
            Nueva empresa
          </h3>
          <p className="text-[12px] text-text-muted mb-4">
            Código de 3-4 letras (ej. EQT, CUM, ING).
          </p>
          <div className="space-y-3">
            <Field label="Código (3-4 letras)" error={errors.codigo?.message}>
              <input {...register('codigo')} className={inputClass} placeholder="EQT" />
            </Field>
            <Field label="Nombre" error={errors.nombre?.message}>
              <input {...register('nombre')} className={inputClass} />
            </Field>
            <Field label="Razón social" error={errors.razon_social?.message}>
              <input {...register('razon_social')} className={inputClass} />
            </Field>
            <Field label="NIT" error={errors.nit?.message}>
              <input {...register('nit')} className={inputClass} />
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
              {isSubmitting ? 'Guardando…' : 'Crear empresa'}
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
