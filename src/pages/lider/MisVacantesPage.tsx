import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import { formatearCOP } from '../../utils/moneda';
import type { VacanteDoc } from '../../schemas';
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui';

export default function MisVacantesPage() {
  const { user } = useAuth();
  const { docs: vacantes, cargando } = useColeccion<VacanteDoc>('vacantes', {
    filtros: user ? [['lider_uid', '==', user.uid]] : [],
    orden: ['creado_en', 'desc'],
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <PageHeader
        eyebrow="Líder"
        titulo="Mis vacantes"
        descripcion="Todas las solicitudes que has abierto y su estado actual."
        accion={
          <Link to="/vacantes/nueva">
            <Button variant="primary" icon={<Plus size={14} />}>
              Nueva vacante
            </Button>
          </Link>
        }
      />

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}
      {!cargando && vacantes.length === 0 && (
        <EmptyState
          titulo="Aún no has abierto vacantes"
          descripcion="Crea tu primera solicitud desde el botón superior."
          accion={
            <Link to="/vacantes/nueva">
              <Button variant="primary" icon={<Plus size={14} />}>
                Nueva vacante
              </Button>
            </Link>
          }
        />
      )}

      {vacantes.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Consecutivo</th>
                <th className="px-4 py-2 font-semibold">Cargo</th>
                <th className="px-4 py-2 font-semibold">Salario</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
                <th className="px-4 py-2 font-semibold">Creada</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {vacantes.map((v) => (
                <tr key={v.id} className="border-t border-navy-50">
                  <td className="px-4 py-2 font-mono text-navy-900">{v.consecutivo || '—'}</td>
                  <td className="px-4 py-2">{v.cargo_nombre}</td>
                  <td className="px-4 py-2 text-navy-600">{formatearCOP(v.salario_base)}</td>
                  <td className="px-4 py-2">
                    <Badge variant="neutral" uppercase={false}>
                      {v.estado}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-navy-600 text-xs">
                    {v.creado_en ? formatearFecha(v.creado_en.toDate()) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/vacantes/${v.id}`}
                      className="text-equitel-rojo-700 hover:underline text-xs font-semibold"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
