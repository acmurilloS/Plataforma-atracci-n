import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { useUnidadesDeSede } from '../../hooks/useCatalogos';
import { useAdminCatalogos } from '../../hooks/useAdminCatalogos';
import { useMutacion } from '../../hooks/useMutacion';
import { Button, Card } from '../../components/brand';
import { cn } from '../../utils/cn';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
  'disabled:bg-slate-100 disabled:text-text-muted disabled:cursor-not-allowed',
);

/**
 * Unidades · Catálogos (admin, gh y quien tenga la sección 'catalogos').
 *
 * Las unidades son áreas del HOLDING: la misma lista sale en el formulario de
 * solicitud para cualquier empresa y sede (`useUnidadesDeSede` ignora la sede).
 * Antes este formulario pedía empresa y sede —que no se usaban— y los filtros de
 * arriba no filtraban nada; Karen pidió poder agregarlas ella misma (04-nov,
 * ENERGY PACK). Ahora basta el nombre: se guarda en MAYÚSCULAS como la lista
 * oficial, con empresa/sede de referencia EQT/MOS (el esquema las exige), y no se
 * deja crear una que ya existe.
 */
const EMPRESA_REF = 'EQT';
const SEDE_REF = 'MOS';

function normalizar(n: string): string {
  return n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function UnidadesTab() {
  const { unidades } = useUnidadesDeSede(null);
  const { crearUnidad } = useAdminCatalogos();
  const { actualizar } = useMutacion();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [nombre, setNombre] = useState('');
  const [centroCostos, setCentroCostos] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Centro de costos por unidad (reu DOTATRACK 06-oct): se edita en la tabla y
  // se guarda al salir del campo. Lo lee la API de nuevos ingresos.
  const [ccGuardando, setCcGuardando] = useState<string | null>(null);
  async function guardarCentroCostos(id: string, valor: string, actual: string) {
    const v = valor.trim().slice(0, 40);
    if (v === (actual ?? '')) return;
    setCcGuardando(id);
    try {
      await actualizar('unidades', id, { centro_costos: v });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar el centro de costos.');
    } finally {
      setCcGuardando(null);
    }
  }

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda);
    return q ? unidades.filter((u) => normalizar(u.nombre).includes(q)) : unidades;
  }, [unidades, busqueda]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const limpio = nombre.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!limpio) {
      setErr('Escribe el nombre de la unidad.');
      return;
    }
    if (limpio.length > 120) {
      setErr('El nombre es demasiado largo (máximo 120 caracteres).');
      return;
    }
    const existente = unidades.find((u) => normalizar(u.nombre) === normalizar(limpio));
    if (existente) {
      setErr(`Ya existe la unidad «${existente.nombre}».`);
      return;
    }
    setGuardando(true);
    try {
      await crearUnidad({
        empresa_codigo: EMPRESA_REF,
        sede_codigo: SEDE_REF,
        nombre: limpio,
        activo: true,
        centro_costos: centroCostos.trim().slice(0, 40),
      });
      setNombre('');
      setCentroCostos('');
      setOk(`Unidad «${limpio}» creada: ya aparece en el formulario de solicitud.`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No pudimos crear la unidad.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar entre las ${unidades.length} unidades activas…`}
            className={cn(inputClass, 'pl-9')}
          />
        </div>

        <Card padding="none">
          <div className="overflow-hidden rounded-md">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                    Nombre
                  </th>
                  <th
                    className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted"
                    title="Centro de costos contable (lo usa la API de dotación). Se guarda al salir del campo."
                  >
                    Centro de costos
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-text-strong">{u.nombre}</td>
                    <td className="px-4 py-2">
                      <input
                        key={`${u.id}-${u.centro_costos ?? ''}`}
                        defaultValue={u.centro_costos ?? ''}
                        placeholder="—"
                        disabled={ccGuardando === u.id}
                        onBlur={(e) => guardarCentroCostos(u.id, e.target.value, u.centro_costos ?? '')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-[12px] text-text-strong hover:border-slate-200 focus:bg-white focus:outline-none focus:border-brand-400"
                      />
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-[13px] text-text-muted italic">
                      {busqueda ? 'Ninguna unidad coincide con la búsqueda.' : 'Aún no hay unidades.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <form onSubmit={crear}>
        <Card padding="md">
          <h3 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong mb-1">
            Nueva unidad
          </h3>
          <p className="text-[12px] text-text-muted mb-4">
            Las unidades son del holding: la nueva aparece de una vez en el formulario de solicitud,
            para todas las empresas y sedes.
          </p>
          <div className="space-y-3">
            <Field label="Nombre">
              <input
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setErr(null);
                  setOk(null);
                }}
                placeholder="Ej: ENERGY PACK"
                className={inputClass}
              />
            </Field>
            <Field label="Centro de costos (opcional)">
              <input
                value={centroCostos}
                onChange={(e) => setCentroCostos(e.target.value)}
                placeholder="Código contable; lo usa la API de dotación"
                className={inputClass}
              />
            </Field>
            {err && (
              <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
                {err}
              </div>
            )}
            {ok && (
              <div className="rounded-md border border-success-500/25 bg-success-50 px-3 py-2 text-[12px] text-success-700">
                {ok}
              </div>
            )}
            <Button
              type="submit"
              variant="brand-primary"
              size="medium"
              loading={guardando}
              disabled={guardando}
              icon={<Plus size={13} strokeWidth={1.75} />}
              fullWidth
            >
              {guardando ? 'Guardando…' : 'Crear unidad'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
