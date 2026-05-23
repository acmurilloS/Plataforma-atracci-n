import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatearFecha } from '../utils/fechas';
import { formatearCOP } from '../utils/moneda';
import type { VacanteDoc } from '../schemas';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  type BadgeVariant,
} from '../components/ui';

const ESTADOS: string[] = [
  'borrador',
  'aprobada',
  'lista_para_publicar',
  'publicada',
  'en_proceso',
  'terna_enviada',
  'seleccionado',
  'en_contratacion',
  'cerrada',
  'desierta',
  'cancelada',
  'pausada',
];

const ESTADO_BADGE: Record<string, BadgeVariant> = {
  borrador: 'fase-a',
  aprobada: 'fase-a',
  lista_para_publicar: 'fase-b',
  publicada: 'fase-b',
  en_proceso: 'fase-c',
  terna_enviada: 'fase-d',
  seleccionado: 'fase-d',
  en_contratacion: 'fase-e',
  cerrada: 'fase-f',
  desierta: 'neutral',
  cancelada: 'neutral',
  pausada: 'neutral',
};

export default function VacantesListaPage() {
  const [vacantes, setVacantes] = useState<VacanteDoc[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'vacantes'), orderBy('creado_en', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        setVacantes(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VacanteDoc, 'id'>) })),
        );
        setCargando(false);
      },
      () => setCargando(false),
    );
  }, []);

  const empresasUnicas = useMemo(() => {
    const s = new Set(vacantes.map((v) => v.empresa_codigo).filter(Boolean));
    return Array.from(s).sort();
  }, [vacantes]);

  const filtradas = useMemo(() => {
    return vacantes.filter((v) => {
      if (filtroEstado && v.estado !== filtroEstado) return false;
      if (filtroEmpresa && v.empresa_codigo !== filtroEmpresa) return false;
      if (busqueda) {
        const q = busqueda.trim().toLowerCase();
        return (
          v.cargo_nombre.toLowerCase().includes(q) ||
          v.consecutivo.toLowerCase().includes(q) ||
          v.lider_nombre.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vacantes, filtroEstado, filtroEmpresa, busqueda]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <PageHeader
        eyebrow="Operación"
        titulo="Todas las vacantes"
        descripcion="Vista de coordinación, GH y admin. Muestra las 100 más recientes."
        accion={
          <Link to="/vacantes/nueva">
            <Button variant="primary" icon={<Plus size={14} />}>
              Nueva vacante
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cargo, consecutivo, líder…"
          className="flex-1 min-w-[200px] rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={filtroEmpresa}
          onChange={(e) => setFiltroEmpresa(e.target.value)}
          className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todas las empresas</option>
          {empresasUnicas.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Consecutivo</th>
              <th className="px-4 py-2 font-semibold">Cargo</th>
              <th className="px-4 py-2 font-semibold">Empresa / Sede</th>
              <th className="px-4 py-2 font-semibold">Crit.</th>
              <th className="px-4 py-2 font-semibold">Salario</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Líder</th>
              <th className="px-4 py-2 font-semibold">Creada</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-navy-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
                  <EmptyState
                    variant="plain"
                    titulo="Sin vacantes con estos filtros"
                    descripcion="Cambia los filtros o crea una nueva desde el botón superior."
                  />
                </td>
              </tr>
            )}
            {filtradas.map((v) => (
              <tr key={v.id} className="border-t border-navy-50 hover:bg-cream-50">
                <td className="px-4 py-2 font-mono text-navy-900">
                  {v.consecutivo || <span className="text-navy-400">pendiente</span>}
                </td>
                <td className="px-4 py-2">{v.cargo_nombre}</td>
                <td className="px-4 py-2 text-navy-600">
                  {v.empresa_codigo} / {v.sede_codigo}
                </td>
                <td className="px-4 py-2">{v.criticidad}</td>
                <td className="px-4 py-2 text-navy-600">{formatearCOP(v.salario_base)}</td>
                <td className="px-4 py-2">
                  <Badge variant={ESTADO_BADGE[v.estado] ?? 'neutral'} uppercase={false}>
                    {v.estado}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-navy-600">{v.lider_nombre}</td>
                <td className="px-4 py-2 text-navy-600">
                  {v.creado_en ? formatearFecha(v.creado_en.toDate()) : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/vacantes/${v.id}`}
                    className="text-equitel-rojo-700 hover:underline text-sm font-semibold"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
