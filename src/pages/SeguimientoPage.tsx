import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { VacanteCard } from '../components/VacanteCard';
import { useAuth } from '../hooks/useAuth';
import { useColeccion, type FiltroTupla } from '../hooks/useColeccion';
import { cn } from '../utils/cn';
import type { VacanteDoc } from '../schemas';
import { Button, EmptyState, PageHeader, Stat, type StatVariant } from '../components/ui';

const FASES = [
  { clave: 'A' as const, label: 'Inicio', estados: ['borrador', 'aprobada'], variant: 'fase-a' as StatVariant },
  { clave: 'B' as const, label: 'Reclutamiento', estados: ['lista_para_publicar', 'publicada'], variant: 'fase-b' as StatVariant },
  { clave: 'C' as const, label: 'Selección', estados: ['en_proceso'], variant: 'fase-c' as StatVariant },
  { clave: 'D' as const, label: 'Decisión', estados: ['terna_enviada', 'seleccionado'], variant: 'fase-d' as StatVariant },
  { clave: 'E' as const, label: 'Ingreso', estados: ['en_contratacion'], variant: 'fase-e' as StatVariant },
  { clave: 'F' as const, label: 'Vinculación', estados: ['cerrada'], variant: 'fase-f' as StatVariant },
];

const TERMINADAS = ['cerrada', 'desierta', 'cancelada'];

type Filtro = 'activas' | 'mias' | 'cerradas' | 'todas';

export default function SeguimientoPage() {
  const { rol, user } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>('activas');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const filtrosRol: FiltroTupla[] = useMemo(() => {
    if (rol === 'lider' && user) return [['lider_uid', '==', user.uid]];
    return [];
  }, [rol, user]);

  const { docs: vacantes, cargando, error } = useColeccion<VacanteDoc>('vacantes', {
    filtros: filtrosRol,
    orden: ['creado_en', 'desc'],
    limit: 200,
  });

  const puedeVerMias = rol === 'lider' || rol === 'analista';
  const puedeCrear = rol === 'lider' || rol === 'coordinador' || rol === 'admin';

  const filtradas = useMemo(() => {
    return vacantes.filter((v) => {
      if (filtro === 'activas' && TERMINADAS.includes(v.estado)) return false;
      if (filtro === 'cerradas' && !TERMINADAS.includes(v.estado)) return false;
      if (filtro === 'mias' && user) {
        if (v.lider_uid !== user.uid && v.analista_uid !== user.uid) return false;
      }
      if (empresaFiltro && v.empresa_codigo !== empresaFiltro) return false;
      if (busqueda) {
        const q = busqueda.trim().toLowerCase();
        const ok =
          v.cargo_nombre.toLowerCase().includes(q) ||
          (v.consecutivo ?? '').toLowerCase().includes(q) ||
          (v.lider_nombre ?? '').toLowerCase().includes(q) ||
          (v.analista_nombre ?? '').toLowerCase().includes(q);
        if (!ok) return false;
      }
      return true;
    });
  }, [vacantes, filtro, empresaFiltro, busqueda, user]);

  const empresasUnicas = useMemo(
    () => Array.from(new Set(vacantes.map((v) => v.empresa_codigo).filter(Boolean))).sort(),
    [vacantes],
  );

  const stats = useMemo(() => {
    const activas = vacantes.filter((v) => !TERMINADAS.includes(v.estado));
    const porFase: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    activas.forEach((v) => {
      const f = FASES.find((fase) => fase.estados.includes(v.estado));
      if (f) porFase[f.clave] += 1;
    });
    // Segmentación crítico vs no crítico (pedido por Cristina).
    // Alta = críticos (técnicos/comerciales). Baja + Media = no críticos.
    const criticasActivas = activas.filter((v) => v.criticidad === 'Alta').length;
    const noCriticasActivas = activas.filter((v) => v.criticidad !== 'Alta').length;
    return {
      total: vacantes.length,
      activas: activas.length,
      cerradas: vacantes.filter((v) => TERMINADAS.includes(v.estado)).length,
      criticasActivas,
      noCriticasActivas,
      porFase,
    };
  }, [vacantes]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      <PageHeader
        eyebrow="Seguimiento"
        titulo="¿Cómo va cada vacante?"
        descripcion="Todas las solicitudes del proceso de atracción con su etapa actual, responsable y tiempo desde apertura. Click en cualquier card para abrir el detalle."
        accion={
          puedeCrear && (
            <Link to="/vacantes/nueva">
              <Button variant="primary" icon={<Plus size={14} />}>
                Nueva vacante
              </Button>
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Stat label="Total" valor={stats.total} variant="neutral" />
        <Stat label="Activas" valor={stats.activas} variant="destacado" />
        <Stat label="Cerradas" valor={stats.cerradas} variant="neutral" />
        {FASES.map((f) => (
          <Stat
            key={f.clave}
            label={f.label}
            valor={stats.porFase[f.clave] ?? 0}
            variant={f.variant}
          />
        ))}
      </div>

      {/* Segmentación crítico vs no crítico — eje pedido por Cristina */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-red-700 font-semibold">
              🔥 Críticas (Alta) · flujo completo
            </p>
            <p className="text-xs text-red-800 mt-1">
              Técnico / comercial / director. Foco humano del equipo.
            </p>
          </div>
          <p className="font-display text-3xl font-bold text-red-700">
            {stats.criticasActivas}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-700 font-semibold">
              🌿 No críticas (Media + Baja) · flujo automatizable
            </p>
            <p className="text-xs text-emerald-800 mt-1">
              Admin / operativo / roles intermedios. Pasos opcionales.
            </p>
          </div>
          <p className="font-display text-3xl font-bold text-emerald-700">
            {stats.noCriticasActivas}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-navy-200 bg-white overflow-hidden shadow-sm">
          <FiltroBtn activo={filtro === 'activas'} onClick={() => setFiltro('activas')}>
            Activas
          </FiltroBtn>
          {puedeVerMias && (
            <FiltroBtn activo={filtro === 'mias'} onClick={() => setFiltro('mias')}>
              Mías
            </FiltroBtn>
          )}
          <FiltroBtn activo={filtro === 'cerradas'} onClick={() => setFiltro('cerradas')}>
            Cerradas
          </FiltroBtn>
          <FiltroBtn activo={filtro === 'todas'} onClick={() => setFiltro('todas')}>
            Todas
          </FiltroBtn>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cargo, consecutivo, líder…"
          className="flex-1 min-w-[200px] rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={empresaFiltro}
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todas las empresas</option>
          {empresasUnicas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!cargando && filtradas.length === 0 && (
        <EmptyState
          titulo="Sin vacantes con estos filtros"
          descripcion="Cambia los filtros o crea una nueva desde el botón superior."
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtradas.map((v) => (
          <VacanteCard key={v.id} vacante={v} />
        ))}
      </div>

      {!cargando && filtradas.length > 0 && (
        <p className="text-xs text-navy-500 text-center pt-4">
          Mostrando {filtradas.length} de {vacantes.length} vacantes totales.
        </p>
      )}
    </div>
  );
}

function FiltroBtn({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-semibold transition',
        activo ? 'bg-navy-900 text-white' : 'bg-white text-navy-700 hover:bg-cream-100',
      )}
    >
      {children}
    </button>
  );
}
