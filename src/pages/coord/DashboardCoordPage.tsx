import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Layers,
  UserCheck,
} from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useFestivosTodos } from '../../hooks/useCatalogos';
import { Card, KpiCard, Pill, type PillTono } from '../../components/brand';
import { ReportesDescarga } from '../../components/dashboard/ReportesDescarga';
import { SemaforoANS } from '../../components/ui/SemaforoANS';
import { cn } from '../../utils/cn';
import { diasTranscurridos, esVacanteCerrada } from '../../utils/reportesVacantes';
import type { PostulacionDoc, VacanteDoc } from '../../schemas';
import { SaludoInicio } from '../../components/SaludoInicio';
import { DrillDownVacantes, type DrillItem } from '../../components/dashboard/DrillDownVacantes';
import { CargandoPagina } from '../../components/ui/CargandoPagina';

/**
 * DashboardCoordPage · vista ejecutiva (coordinación / admin).
 *
 * Layout tipo "Atrium" adaptado a la atracción: card oscura del pipeline activo
 * (número gigante + sub-celdas por fase), 3 KPIs premium (ANS de terna vencidas /
 * en riesgo / contratadas del mes), donut de distribución por fase + criticidad/
 * empresa, y la lista de vacantes con ANS crítico. Solo la paleta de marca.
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

// Fases del pipeline activo (agrupan los estados en curso del flujograma).
const FASE_RECLUTAMIENTO = ['borrador', 'aprobada', 'lista_para_publicar', 'publicada', 'en_proceso', 'pausada'];
const FASE_TERNA = ['terna_enviada', 'seleccionado'];
const FASE_CONTRATACION = ['en_contratacion'];

type DrillMode =
  | 'vencidas'
  | 'en_riesgo'
  | 'reclutamiento'
  | 'terna'
  | 'contratacion'
  | 'contratadas'
  | `crit:${string}`
  | `emp:${string}`;

function fechaDe(ts: unknown): Date | null {
  return (ts as { toDate?: () => Date } | null | undefined)?.toDate?.() ?? null;
}

export default function DashboardCoordPage() {
  const { docs: vacantes, cargando } = useColeccion<VacanteDoc>('vacantes', {
    orden: ['creado_en', 'desc'],
    limit: 500,
  });
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones', {
    orden: ['fecha_postulacion', 'desc'],
    limit: 5000,
  });

  const festivos = useFestivosTodos();

  // Todas las activas con días hábiles transcurridos (mayor riesgo primero).
  const activasFull = useMemo(() => {
    const hoy = new Date();
    return vacantes
      .filter((v) => !esVacanteCerrada(v.estado))
      .map((v) => ({ v, dias: diasTranscurridos(v, festivos, hoy) ?? 0 }))
      .sort((a, b) => b.dias - a.dias);
  }, [vacantes, festivos]);

  // Semáforo de ANS de terna: verde ≤10 · amarillo ≤15 · rojo >15 (días hábiles).
  const ansCounts = useMemo(() => {
    let vencidas = 0;
    let enRiesgo = 0;
    for (const { dias } of activasFull) {
      if (dias > 15) vencidas += 1;
      else if (dias > 10) enRiesgo += 1;
    }
    return { vencidas, enRiesgo };
  }, [activasFull]);

  const criticas = useMemo(() => activasFull.filter((a) => a.dias > 10).slice(0, 10), [activasFull]);

  const stats = useMemo(() => {
    const porCriticidad: Record<string, number> = {};
    const porEmpresa: Record<string, number> = {};
    const porEstado: Record<string, number> = {};
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

  const buckets = useMemo(() => {
    const e = stats.porEstado;
    const g = (keys: string[]) => keys.reduce((s, k) => s + (e[k] ?? 0), 0);
    return {
      reclutamiento: g(FASE_RECLUTAMIENTO),
      terna: g(FASE_TERNA),
      contratacion: g(FASE_CONTRATACION),
    };
  }, [stats.porEstado]);

  const contratadasMes = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let n = 0;
    for (const p of postulaciones) {
      if (p.estado !== 'contratado') continue;
      const d =
        fechaDe((p as { marcas?: { contratado_en?: unknown } }).marcas?.contratado_en) ??
        fechaDe((p as { ultima_transicion_estado?: unknown }).ultima_transicion_estado);
      if (d && d.getFullYear() === y && d.getMonth() === m) n += 1;
    }
    return n;
  }, [postulaciones]);

  // Drill-down: al hundir una card, se abre el modal con esos ítems.
  const [drill, setDrill] = useState<DrillMode | null>(null);

  const drillView = useMemo(() => {
    if (!drill) return null;
    const semaf = (dias: number) => (
      <SemaforoANS dias={dias} umbralAmbar={10} umbralCritico={15} etiqueta="Días hábiles desde la apertura" />
    );
    const base = (v: VacanteDoc): DrillItem => ({
      id: v.id,
      to: `/vacantes/${v.id}`,
      titulo: v.cargo_nombre,
      sub: `${v.consecutivo} · ${v.empresa_codigo}/${v.sede_codigo}`,
    });

    if (drill === 'vencidas' || drill === 'en_riesgo') {
      const venc = drill === 'vencidas';
      const arr = activasFull.filter(({ dias }) => (venc ? dias > 15 : dias > 10 && dias <= 15));
      return {
        titulo: venc ? 'ANS vencidas' : 'ANS en riesgo',
        descripcion: venc ? 'más de 15 días hábiles a terna' : 'entre 10 y 15 días hábiles',
        tono: venc ? ('danger' as const) : ('warning' as const),
        icono: venc ? <AlertCircle size={20} strokeWidth={1.75} /> : <AlertTriangle size={20} strokeWidth={1.75} />,
        items: arr.map(({ v, dias }) => ({ ...base(v), right: semaf(dias) })),
      };
    }

    if (drill === 'reclutamiento' || drill === 'terna' || drill === 'contratacion') {
      const grupo =
        drill === 'reclutamiento' ? FASE_RECLUTAMIENTO : drill === 'terna' ? FASE_TERNA : FASE_CONTRATACION;
      const label =
        drill === 'reclutamiento' ? 'Reclutamiento' : drill === 'terna' ? 'Terna / decisión' : 'Contratación';
      const arr = vacantes.filter((v) => grupo.includes(v.estado));
      return {
        titulo: `Fase · ${label}`,
        descripcion: 'vacantes activas en esta fase',
        tono: 'info' as const,
        icono: <Layers size={20} strokeWidth={1.75} />,
        items: arr.map((v) => ({
          ...base(v),
          right: (
            <Pill tono={ESTADO_TONO[v.estado] ?? 'neutral'} dot>
              {v.estado.replace(/_/g, ' ')}
            </Pill>
          ),
        })),
      };
    }

    if (drill.startsWith('crit:') || drill.startsWith('emp:')) {
      const esCrit = drill.startsWith('crit:');
      const valor = drill.slice(esCrit ? 5 : 4);
      const arr = vacantes.filter((v) =>
        esCrit ? String(v.criticidad ?? '') === valor : v.empresa_codigo === valor,
      );
      return {
        titulo: esCrit ? `Criticidad · ${valor}` : `Empresa · ${valor}`,
        descripcion: 'todas las vacantes de este grupo',
        tono: esCrit ? ('danger' as const) : ('brand' as const),
        icono: esCrit ? (
          <BarChart3 size={20} strokeWidth={1.75} />
        ) : (
          <Building2 size={20} strokeWidth={1.75} />
        ),
        items: arr.map((v) => ({
          ...base(v),
          right: (
            <Pill tono={ESTADO_TONO[v.estado] ?? 'neutral'} dot>
              {v.estado.replace(/_/g, ' ')}
            </Pill>
          ),
        })),
      };
    }

    // contratadas del mes
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const arr = postulaciones.filter((p) => {
      if (p.estado !== 'contratado') return false;
      const d =
        fechaDe((p as { marcas?: { contratado_en?: unknown } }).marcas?.contratado_en) ??
        fechaDe((p as { ultima_transicion_estado?: unknown }).ultima_transicion_estado);
      return !!d && d.getFullYear() === y && d.getMonth() === m;
    });
    return {
      titulo: 'Contratadas este mes',
      descripcion: 'cerradas con contratación',
      tono: 'success' as const,
      icono: <UserCheck size={20} strokeWidth={1.75} />,
      items: arr.map((p) => ({
        id: p.id,
        to: `/postulaciones/${p.id}`,
        titulo: String((p as { candidato_nombre?: string }).candidato_nombre ?? 'Candidato'),
        sub: String((p as { cargo_nombre?: string }).cargo_nombre ?? ''),
      })),
    };
  }, [drill, activasFull, vacantes, postulaciones]);

  // Primera carga (caché fría): esqueleto en vez de números en 0.
  if (cargando && vacantes.length === 0) return <CargandoPagina />;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      <SaludoInicio />

      {/* ── ROW 1 · Pipeline (oscuro) + 3 KPIs ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
        <PipelineHeroCard activas={stats.activas} total={stats.total} buckets={buckets} onFase={setDrill} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <KpiCard
            eyebrow="ANS vencidas"
            valor={ansCounts.vencidas}
            caption={ansCounts.vencidas ? 'Toca para ver el detalle' : 'Todo en tiempo'}
            icono={<AlertCircle size={18} strokeWidth={1.75} />}
            tono="danger"
            progreso={{ valor: ansCounts.vencidas, total: Math.max(1, stats.activas) }}
            onClick={ansCounts.vencidas ? () => setDrill('vencidas') : undefined}
          />
          <KpiCard
            eyebrow="En riesgo"
            valor={ansCounts.enRiesgo}
            caption={ansCounts.enRiesgo ? 'Toca para ver el detalle' : 'Sin riesgo cercano'}
            icono={<AlertTriangle size={18} strokeWidth={1.75} />}
            tono="warning"
            progreso={{ valor: ansCounts.enRiesgo, total: Math.max(1, stats.activas) }}
            onClick={ansCounts.enRiesgo ? () => setDrill('en_riesgo') : undefined}
          />
          <KpiCard
            eyebrow="Contratadas · mes"
            valor={contratadasMes}
            caption={contratadasMes ? 'Toca para ver quiénes' : 'Sin contrataciones este mes'}
            icono={<UserCheck size={18} strokeWidth={1.75} />}
            tono="success"
            onClick={contratadasMes ? () => setDrill('contratadas') : undefined}
          />
        </div>
      </div>

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {/* ── ROW 2 · Distribución (donut por fase) + criticidad/empresa ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
        <Card padding="lg">
          <SectionHeader
            dotClass="bg-info-500"
            eyebrow="Distribución"
            titulo="Pipeline por fase"
            sub="Vacantes activas por fase del flujograma"
          />
          <div className="flex items-center justify-center gap-6 mt-6">
            <DonutFase buckets={buckets} />
            <div className="space-y-3.5 flex-1 min-w-0">
              <DonutLegend colorClass="bg-info-500" label="Reclutamiento" value={buckets.reclutamiento} total={stats.activas} />
              <DonutLegend colorClass="bg-warning-500" label="Terna / decisión" value={buckets.terna} total={stats.activas} />
              <DonutLegend colorClass="bg-brand-600" label="Contratación" value={buckets.contratacion} total={stats.activas} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <DistribCard
            titulo="Por criticidad"
            icono={<BarChart3 size={14} strokeWidth={1.75} />}
            datos={stats.porCriticidad}
            getTono={(k) => CRITICIDAD_TONO[k] ?? 'neutral'}
            onRowClick={(k) => setDrill(`crit:${k}`)}
          />
          <DistribCard
            titulo="Por empresa"
            icono={<Building2 size={14} strokeWidth={1.75} />}
            datos={stats.porEmpresa}
            getTono={() => 'brand'}
            monoLabel
            onRowClick={(k) => setDrill(`emp:${k}`)}
          />
        </div>
      </div>

      {/* ── ROW 3 · Vacantes con ANS crítico ──────────────────────── */}
      <Card padding="lg">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-danger-500" />
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-danger-700">
                Acción requerida
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <h3 className="text-[18px] font-semibold text-text-strong tracking-[-0.01em]">
                Vacantes con ANS crítico
              </h3>
              {ansCounts.vencidas > 0 && <Pill tono="danger" dot>{ansCounts.vencidas} vencidas</Pill>}
              {ansCounts.enRiesgo > 0 && <Pill tono="warning" dot>{ansCounts.enRiesgo} en riesgo</Pill>}
            </div>
            <p className="text-[12.5px] text-text-muted mt-1">
              Días hábiles desde la apertura · ordenadas por urgencia (semáforo terna 15/10).
            </p>
          </div>
          <Link
            to="/seguimiento"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline shrink-0"
          >
            Ver todas
            <ArrowRight size={13} strokeWidth={1.75} />
          </Link>
        </div>

        {criticas.length === 0 ? (
          <div className="flex flex-col items-center text-center py-10">
            <div className="w-11 h-11 rounded-full bg-success-50 text-success-600 flex items-center justify-center mb-3">
              <CheckCircle2 size={22} strokeWidth={1.75} />
            </div>
            <p className="text-[14px] font-medium text-text-strong">Todo en tiempo</p>
            <p className="text-[12.5px] text-text-muted mt-1">
              Ninguna vacante activa supera los 10 días hábiles a terna.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {criticas.map(({ v, dias }) => (
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
                    <span className="font-mono">{v.consecutivo}</span> · {v.empresa_codigo}/{v.sede_codigo}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SemaforoANS
                    dias={dias}
                    umbralAmbar={10}
                    umbralCritico={15}
                    etiqueta="Días hábiles desde la apertura"
                  />
                  <Pill tono={ESTADO_TONO[v.estado] ?? 'neutral'} dot>
                    {v.estado.replace(/_/g, ' ')}
                  </Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Reportes (colapsable) ──────────────────────────────────── */}
      <ReportesDescarga vacantes={vacantes} postulaciones={postulaciones} festivos={festivos} />

      {drillView && <DrillDownVacantes {...drillView} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────

function SectionHeader({
  dotClass,
  eyebrow,
  titulo,
  sub,
}: {
  dotClass: string;
  eyebrow: string;
  titulo: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">{eyebrow}</p>
      </div>
      <h3 className="text-[18px] font-semibold text-text-strong tracking-[-0.01em]">{titulo}</h3>
      {sub && <p className="text-[12.5px] text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

/** Card oscura del pipeline activo — número gigante + sub-celdas por fase. */
function PipelineHeroCard({
  activas,
  total,
  buckets,
  onFase,
}: {
  activas: number;
  total: number;
  buckets: { reclutamiento: number; terna: number; contratacion: number };
  onFase?: (m: 'reclutamiento' | 'terna' | 'contratacion') => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-md bg-slate-900 p-8 text-white shadow-brand-card">
      <div
        className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full"
        style={{ background: 'rgba(190,30,13,0.28)', filter: 'blur(90px)' }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-white/60">
              Pipeline activo
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
            Tiempo real
          </span>
        </div>

        <div className="mb-8 flex items-baseline gap-4">
          <span className="text-[88px] font-extralight leading-[0.85] tracking-[-0.06em] tabular-nums">
            {activas}
          </span>
          <div className="pb-2 leading-none">
            <span className="block text-[11px] font-bold uppercase tracking-[0.10em] text-white/60">
              Vacantes activas
            </span>
            <span className="mt-1 block text-[11px] font-medium text-white/40">de {total} históricas</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <PipeCell
            label="Reclutamiento"
            value={buckets.reclutamiento}
            dotClass="bg-info-500"
            onClick={onFase ? () => onFase('reclutamiento') : undefined}
          />
          <PipeCell
            label="Terna"
            value={buckets.terna}
            dotClass="bg-warning-500"
            onClick={onFase ? () => onFase('terna') : undefined}
          />
          <PipeCell
            label="Contratación"
            value={buckets.contratacion}
            dotClass="bg-brand-500"
            onClick={onFase ? () => onFase('contratacion') : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function PipeCell({
  label,
  value,
  dotClass,
  onClick,
}: {
  label: string;
  value: number;
  dotClass: string;
  onClick?: () => void;
}) {
  const clicable = !!onClick && value > 0;
  return (
    <div
      onClick={clicable ? onClick : undefined}
      role={clicable ? 'button' : undefined}
      tabIndex={clicable ? 0 : undefined}
      onKeyDown={
        clicable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'rounded-lg px-4 py-3.5 transition-all duration-200',
        clicable &&
          'cursor-pointer hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
      )}
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn('h-1 w-1 rounded-full', dotClass)} />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.10em] text-white/50 leading-none">
          {label}
        </p>
      </div>
      <p className="text-[30px] font-light leading-none tabular-nums tracking-[-0.03em] text-white">
        {value}
      </p>
    </div>
  );
}

const DONUT_C = 238.76; // 2π·38

function DonutFase({
  buckets,
}: {
  buckets: { reclutamiento: number; terna: number; contratacion: number };
}) {
  const totalPipe = buckets.reclutamiento + buckets.terna + buckets.contratacion;
  const total = Math.max(1, totalPipe);
  const segs = [
    { val: buckets.reclutamiento, cls: 'text-info-500' },
    { val: buckets.terna, cls: 'text-warning-500' },
    { val: buckets.contratacion, cls: 'text-brand-600' },
  ];
  let offset = 0;
  return (
    <div className="relative shrink-0">
      <svg width="164" height="164" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100" />
        {segs.map((s, i) => {
          const len = (s.val / total) * DONUT_C;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={`${len} ${DONUT_C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
              strokeLinecap={len > 0.5 ? 'round' : 'butt'}
              className={cn('transition-all duration-700 ease-cult', s.cls)}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[27px] font-light text-text-strong tabular-nums leading-none">{totalPipe}</span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-text-subtle">
          en curso
        </span>
      </div>
    </div>
  );
}

function DonutLegend({
  colorClass,
  label,
  value,
  total,
}: {
  colorClass: string;
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between -mx-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn('h-2.5 w-2.5 rounded-[3px] inline-block shrink-0', colorClass)} />
        <span className="text-[13px] text-text-body font-medium truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="text-[11px] font-medium text-text-subtle tabular-nums">{pct}%</span>
        <span className="text-[15px] font-semibold text-text-strong tabular-nums w-6 text-right">{value}</span>
      </div>
    </div>
  );
}

function DistribCard({
  titulo,
  icono,
  datos,
  getTono,
  monoLabel = false,
  onRowClick,
}: {
  titulo: string;
  icono: React.ReactNode;
  datos: Record<string, number>;
  getTono: (k: string) => PillTono;
  monoLabel?: boolean;
  onRowClick?: (k: string) => void;
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
      {entries.length === 0 && <p className="text-[12px] text-text-subtle italic">Sin datos.</p>}
      <ul className="space-y-3">
        {entries.map(([k, v]) => {
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          const tono = getTono(k);
          return (
            <li key={k}>
              <button
                type="button"
                onClick={onRowClick ? () => onRowClick(k) : undefined}
                disabled={!onRowClick}
                className={cn(
                  'block w-full text-left',
                  onRowClick && 'cursor-pointer hover:opacity-80 transition-opacity',
                )}
              >
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
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
