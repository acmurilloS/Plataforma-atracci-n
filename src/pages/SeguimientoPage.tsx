import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  CheckCircle2,
  Flame,
  Layers,
  Leaf,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { VacanteCard } from '../components/VacanteCard';
import { useAuth } from '../hooks/useAuth';
import { useColeccion, type FiltroTupla } from '../hooks/useColeccion';
import { useFestivosTodos } from '../hooks/useCatalogos';
import { cn } from '../utils/cn';
import type { VacanteDoc } from '../schemas';
import { Button, KpiCard } from '../components/brand';
import { SaludoInicio } from '../components/SaludoInicio';
import { CargandoPagina } from '../components/ui/CargandoPagina';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';

/**
 * SeguimientoPage · sistema brand.
 *
 * Hero header con eyebrow + h1 hairline (light, tracking negativo).
 * KpiCards con hero numbers font-extralight 64px (firma del estilo).
 * Segmentación crítico vs no crítico — eje pedido por Cristina —
 * con KpiCards tono danger/success y barra de proporción.
 * VacanteCards mantienen su componente (sistema viejo) hasta migración.
 */

interface FaseDef {
  clave: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  label: string;
  estados: string[];
  tono: 'brand' | 'warning' | 'info' | 'danger' | 'success' | 'neutral';
}

const FASES: FaseDef[] = [
  { clave: 'A', label: 'Inicio', estados: ['borrador', 'aprobada'], tono: 'brand' },
  { clave: 'B', label: 'Reclutamiento', estados: ['lista_para_publicar', 'publicada'], tono: 'warning' },
  { clave: 'C', label: 'Selección', estados: ['en_proceso'], tono: 'info' },
  { clave: 'D', label: 'Decisión', estados: ['terna_enviada', 'seleccionado'], tono: 'danger' },
  { clave: 'E', label: 'Ingreso', estados: ['en_contratacion'], tono: 'success' },
  { clave: 'F', label: 'Vinculación', estados: ['cerrada'], tono: 'neutral' },
];

const TERMINADAS = ['cerrada', 'desierta', 'cancelada'];

type Filtro = 'activas' | 'mias' | 'cerradas' | 'todas';

export default function SeguimientoPage() {
  const { rol, user } = useAuth();
  const festivos = useFestivosTodos();
  const [filtro, setFiltro] = useState<Filtro>('activas');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [unidadFiltro, setUnidadFiltro] = useState('');
  const [cargoFiltro, setCargoFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // Drill-down: al hundir una card se abre un pop-up con las vacantes de ese grupo.
  const [drill, setDrill] = useState<{ titulo: string; lista: VacanteDoc[] } | null>(null);

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
      if (unidadFiltro && v.unidad_id !== unidadFiltro) return false;
      if (cargoFiltro && v.cargo_nombre !== cargoFiltro) return false;
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
  }, [vacantes, filtro, empresaFiltro, unidadFiltro, cargoFiltro, busqueda, user]);

  const empresasUnicas = useMemo(
    () => Array.from(new Set(vacantes.map((v) => v.empresa_codigo).filter(Boolean))).sort(),
    [vacantes],
  );
  // Unidades (id → nombre) y cargos únicos de las vacantes cargadas, para filtrar.
  const unidadesUnicas = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vacantes) {
      if (v.unidad_id) m.set(v.unidad_id, v.unidad_nombre ?? v.unidad_id);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [vacantes]);
  const cargosUnicos = useMemo(
    () =>
      Array.from(new Set(vacantes.map((v) => v.cargo_nombre).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
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

  // Listas por grupo (para el pop-up de cada card).
  const activasList = useMemo(() => vacantes.filter((v) => !TERMINADAS.includes(v.estado)), [vacantes]);
  const cerradasList = useMemo(() => vacantes.filter((v) => TERMINADAS.includes(v.estado)), [vacantes]);

  if (cargando && vacantes.length === 0) return <CargandoPagina />;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      <SaludoInicio />

      {/* ─── Hero header ──────────────────────────────────────────── */}
      <EncabezadoPagina
        icono={<Activity size={26} strokeWidth={1.6} />}
        tono="brand"
        eyebrow="Seguimiento global"
        titulo="¿Cómo va cada vacante?"
        descripcion="Todas las solicitudes del proceso de atracción con su etapa actual, responsable y tiempo desde apertura. Click en cualquier card para abrir el detalle."
        accion={
          puedeCrear ? (
            <Link to="/vacantes/nueva">
              <Button variant="brand-primary" icon={<Plus size={13} strokeWidth={1.75} />}>
                Nueva vacante
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* ─── KPIs principales (hero numbers) ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          eyebrow="Total histórico"
          valor={stats.total}
          caption="Vacantes abiertas desde el inicio del periodo."
          icono={<Layers size={18} strokeWidth={1.75} />}
          tono="neutral"
          onClick={() => setDrill({ titulo: 'Total histórico', lista: vacantes })}
        />
        <KpiCard
          eyebrow="Activas"
          valor={stats.activas}
          caption="En cualquier etapa del flujograma."
          icono={<Activity size={18} strokeWidth={1.75} />}
          tono="brand"
          onClick={() => setDrill({ titulo: 'Activas', lista: activasList })}
        />
        <KpiCard
          eyebrow="Cerradas"
          valor={stats.cerradas}
          caption="Contratadas, desiertas o canceladas."
          icono={<CheckCircle2 size={18} strokeWidth={1.75} />}
          tono="success"
          onClick={() => setDrill({ titulo: 'Cerradas', lista: cerradasList })}
        />
      </div>

      {/* ─── Segmentación crítico vs no crítico (eje Cristina) ──── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KpiCard
          eyebrow="Críticas · flujo completo"
          valor={stats.criticasActivas}
          caption="Técnico / comercial / director. Foco humano del equipo."
          icono={<Flame size={18} strokeWidth={1.75} />}
          tono="danger"
          progreso={
            stats.activas > 0
              ? { valor: stats.criticasActivas, total: stats.activas }
              : undefined
          }
          onClick={() =>
            setDrill({
              titulo: 'Críticas · flujo completo',
              lista: activasList.filter((v) => v.criticidad === 'Alta'),
            })
          }
        />
        <KpiCard
          eyebrow="No críticas · flujo simplificado"
          valor={stats.noCriticasActivas}
          caption="Admin / operativo / roles intermedios. Pasos opcionales."
          icono={<Leaf size={18} strokeWidth={1.75} />}
          tono="success"
          progreso={
            stats.activas > 0
              ? { valor: stats.noCriticasActivas, total: stats.activas }
              : undefined
          }
          onClick={() =>
            setDrill({
              titulo: 'No críticas · flujo simplificado',
              lista: activasList.filter((v) => v.criticidad !== 'Alta'),
            })
          }
        />
      </div>

      {/* ─── KPIs por fase (más chicos) ────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Distribución por fase · activas
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {FASES.map((f) => (
            <KpiCardCompact
              key={f.clave}
              eyebrow={`${f.clave} · ${f.label}`}
              valor={stats.porFase[f.clave] ?? 0}
              tono={f.tono}
              onClick={() =>
                setDrill({
                  titulo: `Fase ${f.clave} · ${f.label}`,
                  lista: activasList.filter((v) => f.estados.includes(v.estado)),
                })
              }
            />
          ))}
        </div>
      </div>

      {/* ─── Filtros ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap pt-2">
        <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden shadow-brand-card">
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
        <div className="flex-1 min-w-[220px] relative">
          <Search
            size={15}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cargo, consecutivo, líder o analista…"
            className="w-full pl-9 pr-3 py-2.5 rounded-brand-input bg-slate-50 border border-slate-200 text-[13px] text-text-strong placeholder:text-text-subtle focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 transition-colors"
          />
        </div>
        <select
          value={empresaFiltro}
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="rounded-brand-input bg-white border border-slate-200 px-3 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
        >
          <option value="">Todas las empresas</option>
          {empresasUnicas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={unidadFiltro}
          onChange={(e) => setUnidadFiltro(e.target.value)}
          className="rounded-brand-input bg-white border border-slate-200 px-3 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
        >
          <option value="">Todas las unidades</option>
          {unidadesUnicas.map(([uid, nombre]) => (
            <option key={uid} value={uid}>
              {nombre}
            </option>
          ))}
        </select>
        <select
          value={cargoFiltro}
          onChange={(e) => setCargoFiltro(e.target.value)}
          className="rounded-brand-input bg-white border border-slate-200 px-3 py-2.5 text-[13px] text-text-strong focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
        >
          <option value="">Todos los cargos</option>
          {cargosUnicos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {cargando && <p className="text-sm text-text-muted">Cargando…</p>}
      {error && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      )}
      {!cargando && filtradas.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
            <Briefcase size={20} strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-text-strong">
            Sin vacantes con estos filtros
          </p>
          <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
            Cambia los filtros o crea una nueva desde el botón superior.
          </p>
        </div>
      )}

      {/* ─── Listado de vacantes ─────────────────────────────────── */}
      {filtradas.length > 0 && (
        <div className="flex items-center gap-2 pt-2">
          <Briefcase size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[12px] text-text-muted tabular-nums">
            <span className="font-semibold text-text-strong">{filtradas.length}</span> de{' '}
            {vacantes.length} vacantes
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtradas.map((v) => (
          <VacanteCard key={v.id} vacante={v} festivos={festivos} />
        ))}
      </div>

      {drill && (
        <DrillModal titulo={drill.titulo} lista={drill.lista} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

/** Pop-up que lista las vacantes de un grupo al hundir su card (reu 18-ago). */
function DrillModal({
  titulo,
  lista,
  onClose,
}: {
  titulo: string;
  lista: VacanteDoc[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-[14px] font-semibold text-text-strong">
            {titulo} · <span className="tabular-nums">{lista.length}</span>
          </p>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-strong"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-100">
          {lista.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-text-muted">
              Ninguna vacante en este grupo.
            </p>
          )}
          {lista.map((v) => (
            <Link
              key={v.id}
              to={`/vacantes/${v.id}`}
              onClick={onClose}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-subtle">
                  {v.consecutivo || 'pendiente'}
                </p>
                <p className="text-[13px] font-medium text-text-strong truncate">{v.cargo_nombre}</p>
                <p className="text-[11px] text-text-muted truncate">
                  {v.empresa_nombre} · {v.sede_nombre}
                </p>
              </div>
              <span className="text-[11px] text-text-muted whitespace-nowrap capitalize">
                {(v.estado ?? '').replace(/_/g, ' ')}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * KPI compacto para grids de muchas columnas (las 6 fases).
 * Misma firma visual que KpiCard pero con menos padding y hero number 36px.
 */
function KpiCardCompact({
  eyebrow,
  valor,
  tono,
  onClick,
}: {
  eyebrow: string;
  valor: number;
  tono: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  onClick?: () => void;
}) {
  const TONO: Record<typeof tono, { dot: string; label: string; valor: string }> = {
    brand: { dot: 'bg-brand-500', label: 'text-brand-700', valor: 'text-brand-700' },
    success: { dot: 'bg-success-500', label: 'text-success-700', valor: 'text-success-700' },
    warning: { dot: 'bg-warning-500', label: 'text-warning-700', valor: 'text-warning-700' },
    danger: { dot: 'bg-danger-500', label: 'text-danger-700', valor: 'text-danger-700' },
    info: { dot: 'bg-info-500', label: 'text-info-700', valor: 'text-info-700' },
    neutral: { dot: 'bg-slate-400', label: 'text-text-muted', valor: 'text-text-strong' },
  };
  const t = TONO[tono];
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full bg-white rounded-md border border-slate-200 p-4 shadow-brand-card transition-shadow duration-200 hover:shadow-brand-card-hover cursor-pointer"
    >
      <div className="flex items-center gap-1.5 mb-3">
        <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />
        <p className={cn('text-[10px] font-bold tracking-[0.10em] uppercase', t.label)}>
          {eyebrow}
        </p>
      </div>
      <span
        className={cn(
          'text-[36px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums',
          t.valor,
        )}
      >
        {valor}
      </span>
    </button>
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
        'px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 ease-out',
        activo
          ? 'bg-text-strong text-white'
          : 'bg-white text-text-body hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}
