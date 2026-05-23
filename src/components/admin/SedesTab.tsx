import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sedeInputSchema, type SedeInput } from '../../schemas';
import { useEmpresas, useSedesDeEmpresa } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';

export function SedesTab() {
  const { empresas } = useEmpresas();
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('');
  const { sedes } = useSedesDeEmpresa(empresaFiltro || null);
  const { crearSede } = useAdminCatalogos();
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Filtrar por empresa</span>
          <select
            value={empresaFiltro}
            onChange={(e) => setEmpresaFiltro(e.target.value)}
            className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-sm"
          >
            <option value="">Selecciona una empresa</option>
            {empresas.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Ciudad</th>
              </tr>
            </thead>
            <tbody>
              {sedes.map((s) => (
                <tr key={s.id} className="border-t border-navy-50">
                  <td className="px-4 py-2 font-mono text-navy-900">{s.codigo}</td>
                  <td className="px-4 py-2">{s.nombre}</td>
                  <td className="px-4 py-2 text-navy-600">{s.empresa_codigo}</td>
                  <td className="px-4 py-2 text-navy-600">{s.ciudad}</td>
                </tr>
              ))}
              {sedes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-navy-500">
                    {empresaFiltro ? 'Sin sedes para esta empresa.' : 'Selecciona una empresa.'}
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
        <h3 className="font-display text-lg font-semibold text-navy-900">Nueva sede</h3>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Código (3-4 letras)</span>
          <input
            {...register('codigo')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            placeholder="BOG"
          />
          {errors.codigo && (
            <span className="text-xs text-red-600">{errors.codigo.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Empresa</span>
          <select
            {...register('empresa_codigo')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          >
            <option value="">Selecciona</option>
            {empresas.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </select>
          {errors.empresa_codigo && (
            <span className="text-xs text-red-600">{errors.empresa_codigo.message}</span>
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
          <span className="text-xs font-medium text-navy-700">Ciudad</span>
          <input
            {...register('ciudad')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          {errors.ciudad && (
            <span className="text-xs text-red-600">{errors.ciudad.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Dirección</span>
          <input
            {...register('direccion')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-navy-700 text-white py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
        >
          {isSubmitting ? 'Guardando…' : 'Crear sede'}
        </button>
      </form>
    </div>
  );
}
