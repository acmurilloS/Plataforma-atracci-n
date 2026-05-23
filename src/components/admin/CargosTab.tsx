import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cargoInputSchema, type CargoInput } from '../../schemas';
import { useCargos } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';
import { formatearCOP } from '../../utils/moneda';

const HERRAMIENTAS = ['computador', 'office', 'labroides', 'dotacion'] as const;

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
        <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Categoría</th>
                <th className="px-4 py-2 font-medium">Criticidad</th>
                <th className="px-4 py-2 font-medium">Banda</th>
              </tr>
            </thead>
            <tbody>
              {cargos.map((c) => (
                <tr key={c.id} className="border-t border-navy-50">
                  <td className="px-4 py-2">{c.nombre}</td>
                  <td className="px-4 py-2 text-navy-600 capitalize">{c.categoria}</td>
                  <td className="px-4 py-2">{c.criticidad_sugerida}</td>
                  <td className="px-4 py-2 text-navy-600">
                    {c.banda_min != null && c.banda_max != null
                      ? `${formatearCOP(c.banda_min)} – ${formatearCOP(c.banda_max)}`
                      : 'Sin banda'}
                  </td>
                </tr>
              ))}
              {cargos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-navy-500">
                    Sin cargos. Crea uno o corre el seed.
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
        <h3 className="font-display text-lg font-semibold text-navy-900">Nuevo cargo</h3>
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
          <span className="text-xs font-medium text-navy-700">Categoría</span>
          <select
            {...register('categoria')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          >
            <option value="comercial">Comercial</option>
            <option value="tecnico">Técnico</option>
            <option value="administrativo">Administrativo</option>
            <option value="operativo">Operativo</option>
            <option value="liderazgo">Liderazgo</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Criticidad sugerida</span>
          <select
            {...register('criticidad_sugerida')}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          >
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Banda min</span>
            <input
              type="number"
              {...register('banda_min', {
                setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
              })}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Banda max</span>
            <input
              type="number"
              {...register('banda_max', {
                setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
              })}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        {(errors.banda_min || errors.banda_max) && (
          <span className="text-xs text-red-600">
            {errors.banda_min?.message ?? errors.banda_max?.message}
          </span>
        )}
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-navy-700">Herramientas sugeridas</legend>
          {HERRAMIENTAS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register(`herramientas_sugeridas.${k}` as const)} />
              <span className="capitalize">{k}</span>
            </label>
          ))}
        </fieldset>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-navy-700 text-white py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
        >
          {isSubmitting ? 'Guardando…' : 'Crear cargo'}
        </button>
      </form>
    </div>
  );
}
