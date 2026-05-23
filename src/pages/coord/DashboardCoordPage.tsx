import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useColeccion } from '../../hooks/useColeccion';
import { Badge, Card, PageHeader } from '../../components/ui';
import type { VacanteDoc } from '../../schemas';

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
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <PageHeader
        eyebrow="Coordinación"
        titulo="Dashboard"
        descripcion={`Supervisión global del holding · total ${stats.total} vacantes · ${stats.activas} activas.`}
      />

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard titulo="Por estado" datos={stats.porEstado} />
        <StatCard titulo="Por criticidad" datos={stats.porCriticidad} />
        <StatCard titulo="Por empresa" datos={stats.porEmpresa} />
      </section>

      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold text-navy-900">
            Vacantes activas (últimas)
          </h2>
          <Link
            to="/vacantes"
            className="text-sm text-equitel-rojo-700 hover:underline font-semibold"
          >
            Ver todas →
          </Link>
        </div>
        <ul className="divide-y divide-navy-50 text-sm">
          {vacantes
            .filter((v) => !['cerrada', 'desierta', 'cancelada'].includes(v.estado))
            .slice(0, 10)
            .map((v) => (
              <li key={v.id} className="py-2 flex items-center justify-between">
                <div>
                  <Link to={`/vacantes/${v.id}`} className="font-medium hover:underline">
                    {v.cargo_nombre}
                  </Link>
                  <span className="text-navy-500 text-xs ml-2">
                    {v.consecutivo} · {v.empresa_codigo}/{v.sede_codigo}
                  </span>
                </div>
                <Badge variant="neutral" uppercase={false}>
                  {v.estado}
                </Badge>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function StatCard({ titulo, datos }: { titulo: string; datos: Record<string, number> }) {
  const entries = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <Card padding="md">
      <h3 className="font-display text-lg font-bold text-navy-900 mb-3">{titulo}</h3>
      {entries.length === 0 && <p className="text-xs text-navy-500">Sin datos.</p>}
      <ul className="space-y-2 text-sm">
        {entries.map(([k, v]) => {
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return (
            <li key={k}>
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize">{k}</span>
                <span className="text-navy-500">
                  {v} · {pct}%
                </span>
              </div>
              <div className="h-1.5 bg-navy-100 rounded mt-1 overflow-hidden">
                <div
                  className="h-full bg-equitel-rojo-600"
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
