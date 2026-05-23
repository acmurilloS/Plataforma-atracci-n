import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { unidadInputSchema, type UnidadInput } from '../../schemas';
import { useEmpresas, useSedesDeEmpresa, useUnidadesDeSede } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';

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
      <div className="lg:col-span-2 space-y-3">
        <div className="flex gap-3">
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Empresa</span>
            <select
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
              className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-sm"
            >
              <option value="">Selecciona</option>
              {empresas.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Sede</span>
            <select
              value={sedeFiltro}
              onChange={(e) => setSedeFiltro(e.target.value)}
              disabled={!empresaFiltro}
              className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-sm disabled:bg-navy-50"
            >
              <option value="">Selecciona</option>
              {sedes.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Sede</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <tr key={u.id} className="border-t border-navy-50">
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2 text-navy-600">{u.sede_codigo}</td>
                  <td className="px-4 py-2 text-navy-600">{u.empresa_codigo}</td>
                </tr>
              ))}
              {unidades.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-navy-500">
                    Selecciona empresa y sede para ver unidades.
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
        <h3 className="font-display text-lg font-semibold text-navy-900">Nueva unidad</h3>
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
          <span className="text-xs font-medium text-navy-700">Sede</span>
          <select
            {...register('sede_codigo')}
            disabled={!empresaForm}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm disabled:bg-navy-50"
          >
            <option value="">Selecciona</option>
            {sedesForm.map((s) => (
              <option key={s.codigo} value={s.codigo}>
                {s.nombre}
              </option>
            ))}
          </select>
          {errors.sede_codigo && (
            <span className="text-xs text-red-600">{errors.sede_codigo.message}</span>
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
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-navy-700 text-white py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
        >
          {isSubmitting ? 'Guardando…' : 'Crear unidad'}
        </button>
      </form>
    </div>
  );
}
