import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { empresaInputSchema, type EmpresaInput } from '../../schemas';
import { useEmpresas } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';

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
        <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">NIT</th>
                <th className="px-4 py-2 font-medium">Activo</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-t border-navy-50">
                  <td className="px-4 py-2 font-mono text-navy-900">
                    <div className="flex items-center gap-1.5">
                      {e.codigo}
                      {e.es_provisional && (
                        <span
                          title="Código provisional · pendiente de validar con GH (ATR-21)"
                          className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        >
                          prov
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">{e.nombre}</td>
                  <td className="px-4 py-2 text-navy-600">{e.nit}</td>
                  <td className="px-4 py-2">{e.activo ? '✓' : '—'}</td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-navy-500">
                    Sin empresas. Crea la primera o corre el seed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-xl border border-navy-100 bg-white p-4 space-y-3"
      >
        <h3 className="font-display text-lg font-semibold text-navy-900">Nueva empresa</h3>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Código (3-4 letras)</span>
          <input
            {...register('codigo')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            placeholder="EQT"
          />
          {errors.codigo && (
            <span className="text-xs text-red-600">{errors.codigo.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Nombre</span>
          <input
            {...register('nombre')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          {errors.nombre && (
            <span className="text-xs text-red-600">{errors.nombre.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Razón social</span>
          <input
            {...register('razon_social')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          {errors.razon_social && (
            <span className="text-xs text-red-600">{errors.razon_social.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">NIT</span>
          <input
            {...register('nit')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          {errors.nit && <span className="text-xs text-red-600">{errors.nit.message}</span>}
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-navy-700 text-white py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
        >
          {isSubmitting ? 'Guardando…' : 'Crear empresa'}
        </button>
      </form>
    </div>
  );
}
