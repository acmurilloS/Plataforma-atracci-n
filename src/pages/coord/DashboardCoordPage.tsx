import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, Building2 } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import type { VacanteDoc } from '../../schemas';

/**
 * DashboardCoordPage · sistema brand.
 *
 * Vista de Karen / coordinación. Hero numbers (total + activas), 3 paneles
 * de distribución (estado / criticidad / empresa) con barras brand, y
 * listado de las últimas activas.
 */

const ESTADO_TONO: Record<string, PillTono> = {
  borrador: 'neutral',
  aprobada: 'brand',
  lista_para_publicar: 'brand',
  publicada: 'warning',
  en_proceso: 'info',
  terna_enviada: 'danger',
  seleccionado: 'success',
  en_contratacion: 'brand',
  cerrada: 'success',
  desierta: 'neutral',
  cancelada: 'neutral',
  pausada: 'warning',
};

const CRITICIDAD_TONO: Record<string, PillTono> = {
  Alta: 'danger',
  Media: 'warning',
  Baja: 'success',
};

export default function DashboardCoordPage() {
  const { docs: vacantes, cargando } = useColeccion<VacanteDoc>('vacantes', {
    orden: ['creado_en', 'desc'],
    limit: 500,
  });

  const stats = useMemo(() => {
    const porEstado: Record<string, number> = {};
    const porCriticidad: Record<string, number> = {};
    const porEmpresa: Record<string, number> = {};
    for (const v of vacantes) {
      porEstado[v.estado] = (porEstado[v.estado] ?? 0) + 1;
      porCriticidad[v.criticidad] = (porCriticidad[v.criticidad] ?? 0) + 1;
      porEmpresa[v.empresa_codigo] = (porEmpresa[v.empresa_codigo] ?? 0) + 1;
    }
    const activas = vacantes.filter(
      (v) => !['cerrada', 'desierta', 'cancelada'].includes(v.estado),
    ).length;
    return { porEstado, porCriticidad, porEmpresa, total: vacantes.length, activas };
  }, [vacantes]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Coordinación
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Dashboard
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Supervisión global del holding. Distribución por estado, criticidad y empresa para
          identificar dónde está el cuello de botella en tiempo real.
        </p>
      </div>

      {/* Hero numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <HeroStat
          label="Total histórico"
          valor={stats.total}
          caption="Vacantes abiertas desde el inicio del periodo."
          icono={<BarChart3 size={18} strokeWidth={1.75} />}
          tono="neutral"
        />
        <HeroStat
          label="Activas"
          valor={stats.activas}
          caption="En cualquier etapa del flujograma. Si baja repentino, algo se cerró desierto."
          icono={<Activity size={18} strokeWidth={1.75} />}
          tono="brand"
        />
      </div>

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {/* Distribuciones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DistribCard
          titulo="Por estado"
          icono={<Activity size={14} strokeWidth={1.75} />}
          datos={stats.porEstado}
          getTono={(k) => ESTADO_TONO[k] ?? 'neutral'}
        />
        <DistribCard
          titulo="Por criticidad"
          icono={<BarChart3 size={14} strokeWidth={1.75} />}
          datos={stats.porCriticidad}
          getTono={(k) => CRITICIDAD_TONO[k] ?? 'neutral'}
        />
        <DistribCard
          titulo="Por empresa"
          icono={<Building2 size={14} strokeWidth={1.75} />}
          datos={stats.porEmpresa}
          getTono={() => 'brand'}
          monoLabel
        />
      </div>

      {/* Últimas activas */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Vacantes activas · últimas 10
            </p>
          </div>
          <Link
            to="/seguimiento"
            className="text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            Ver todas →
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {vacantes
            .filter((v) => !['cerrada', 'desierta', 'cancelada'].includes(v.estado))
            .slice(0, 10)
            .map((v) => (
              <li
                key={v.id}
                className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/40 -mx-2 px-2 rounded-md transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/vacantes/${v.id}`}
                    className="text-[14px] font-medium text-text-strong hover:text-brand-700 transition-colors"
                  >
                    {v.cargo_nombre}
                  </Link>
                  <p className="text-[11px] text-text-subtle mt-0.5">
                    <span className="font-mono">{v.consecutivo}</span> · {v.empresa_codigo}/
                    {v.sede_codigo}
                  </p>
                </div>
                <Pill tono={ESTADO_TONO[v.estado] ?? 'neutral'} dot>
                  {v.estado.replace(/_/g, ' ')}
                </Pill>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function HeroStat({
  label,
  valor,
  caption,
  icono,
  tono = 'neutral',
}: {
  label: string;
  valor: number;
  caption: string;
  icono?: React.ReactNode;
  tono?: 'brand' | 'neutral';
}) {
  return (
    <div className="bg-white rounded-md border border-slate-200 p-6 shadow-brand-card">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              tono === 'brand' ? 'bg-brand-500' : 'bg-slate-400',
            )}
          />
          <p
            className={cn(
              'text-[10px] font-bold tracking-[0.10em] uppercase',
              tono === 'brand' ? 'text-brand-700' : 'text-text-muted',
            )}
          >
            {label}
          </p>
        </div>
        <div
          className={cn(
            'w-10 h-10 rounded-md flex items-center justify-center',
            tono === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-text-muted',
          )}
        >
          {icono}
        </div>
      </div>
      <span
        className={cn(
          'text-[64px] font-extralight leading-[0.9] tracking-[-0.05em] tabular-nums',
          tono === 'brand' ? 'text-brand-700' : 'text-text-strong',
        )}
      >
        {valor}
      </span>
      <p className="text-[12px] text-text-subtle font-medium mt-2">{caption}</p>
    </div>
  );
}

function DistribCard({
  titulo,
  icono,
  datos,
  getTono,
  monoLabel = false,
}: {
  titulo: string;
  icono: React.ReactNode;
  datos: Record<string, number>;
  getTono: (k: string) => PillTono;
  monoLabel?: boolean;
}) {
  const entries = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  const barClass = (tono: PillTono) => {
    switch (tono) {
      case 'brand':
        return 'bg-brand-600';
      case 'success':
        return 'bg-success-500';
      case 'warning':
        return 'bg-warning-500';
      case 'danger':
        return 'bg-danger-500';
      case 'info':
        return 'bg-info-500';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-4 text-text-muted">
        {icono}
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase">{titulo}</p>
      </div>
      {entries.length === 0 && (
        <p className="text-[12px] text-text-subtle italic">Sin datos.</p>
      )}
      <ul className="space-y-3">
        {entries.map(([k, v]) => {
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          const tono = getTono(k);
          return (
            <li key={k}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span
                  className={cn(
                    'text-text-body',
                    monoLabel ? 'font-mono uppercase tracking-wide' : 'capitalize',
                  )}
                >
                  {k.replace(/_/g, ' ')}
                </span>
                <span className="text-text-subtle tabular-nums">
                  <span className="font-semibold text-text-strong">{v}</span> · {pct}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all duration-300 ease-cult', barClass(tono))}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
