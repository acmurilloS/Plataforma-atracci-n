import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  Inbox,
  PauseCircle,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { useColeccion, type FiltroTupla } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import {
  TIPO_LABEL,
  type AreaApoyo,
  type EstadoTicketConexion,
  type TicketConexionDoc,
} from '../../schemas';
import { Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * TicketsPage · sistema brand.
 *
 * Cola por área (paso 20). Apoyo solo ve los tickets de su área. Stats con
 * hero numbers + filtros sunken + tabla brand. Soporta pre-avisos (paso 3)
 * con badge dedicado.
 */

const AREAS: AreaApoyo[] = [
  'it',
  'compras',
  'bodega',
  'contabilidad',
  'administrativo',
  'talentos',
];

const AREA_LABEL: Record<AreaApoyo, string> = {
  it: 'IT',
  compras: 'Compras',
  bodega: 'Bodega',
  contabilidad: 'Contabilidad',
  administrativo: 'Administrativo CJ',
  talentos: 'Talentos',
};

const ESTADOS: { valor: EstadoTicketConexion; label: string }[] = [
  { valor: 'abierto', label: 'Abierto' },
  { valor: 'en_progreso', label: 'En progreso' },
  { valor: 'bloqueado', label: 'Bloqueado' },
  { valor: 'resuelto', label: 'Resuelto' },
  { valor: 'no_aplica', label: 'No aplica' },
  { valor: 'cancelado', label: 'Cancelado' },
];

const ESTADO_TONO: Record<EstadoTicketConexion, PillTono> = {
  abierto: 'neutral',
  en_progreso: 'info',
  bloqueado: 'danger',
  resuelto: 'success',
  no_aplica: 'neutral',
  cancelado: 'neutral',
};

const CRITICIDAD_TONO: Record<'Alta' | 'Media' | 'Baja', PillTono> = {
  Alta: 'danger',
  Media: 'warning',
  Baja: 'success',
};

const inputClass =
  'rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 disabled:bg-slate-100 disabled:text-text-subtle disabled:cursor-not-allowed';

function semaforoANS(t: TicketConexionDoc): { cls: string; texto: string } {
  if (t.estado === 'resuelto' || t.estado === 'no_aplica' || t.estado === 'cancelado') {
    return {
      cls: 'text-text-muted',
      texto: formatearFecha(t.ans_expira_en?.toDate?.()),
    };
  }
  const expiraMs = t.ans_expira_en?.toMillis?.() ?? 0;
  const ahora = Date.now();
  const diffMs = expiraMs - ahora;
  if (diffMs < 0) {
    return {
      cls: 'text-danger-700 font-semibold',
      texto: `Vencido · ${formatearFecha(t.ans_expira_en?.toDate?.())}`,
    };
  }
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  if (diffDias < 1) {
    return {
      cls: 'text-warning-700 font-medium',
      texto: `Hoy · ${formatearFecha(t.ans_expira_en?.toDate?.())}`,
    };
  }
  return { cls: 'text-text-body', texto: formatearFecha(t.ans_expira_en?.toDate?.()) };
}

export default function TicketsPage() {
  const { user, perfil, rol } = useAuth();
  const { actualizar } = useMutacion();

  const esApoyo = rol === 'apoyo';
  const areaForzada = esApoyo ? (perfil?.area_apoyo ?? null) : null;

  const [filtroArea, setFiltroArea] = useState<string>(areaForzada ?? '');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filtros: FiltroTupla[] = [];
  const areaEfectiva = areaForzada ?? filtroArea;
  if (areaEfectiva) filtros.push(['area', '==', areaEfectiva]);
  if (filtroEstado) filtros.push(['estado', '==', filtroEstado]);

  const { docs: tickets, cargando } = useColeccion<TicketConexionDoc>('tickets_conexion', {
    filtros,
    limit: 200,
  });

  const stats = useMemo(() => {
    const ahora = Date.now();
    const total = tickets.length;
    const abiertos = tickets.filter((t) => t.estado === 'abierto').length;
    const enProgreso = tickets.filter((t) => t.estado === 'en_progreso').length;
    const bloqueados = tickets.filter((t) => t.estado === 'bloqueado').length;
    const resueltos = tickets.filter((t) => t.estado === 'resuelto').length;
    const vencidos = tickets.filter(
      (t) =>
        t.estado !== 'resuelto' &&
        t.estado !== 'no_aplica' &&
        t.estado !== 'cancelado' &&
        (t.ans_expira_en?.toMillis?.() ?? Infinity) < ahora,
    ).length;
    const preavisos = tickets.filter(
      (t) =>
        t.disparado_por === 'automatico_perfilamiento' &&
        !t.candidato_id &&
        t.estado !== 'resuelto' &&
        t.estado !== 'cancelado' &&
        t.estado !== 'no_aplica',
    ).length;
    return { total, abiertos, enProgreso, bloqueados, resueltos, vencidos, preavisos };
  }, [tickets]);

  async function acusarRecibo(t: TicketConexionDoc) {
    if (!user || !perfil) return;
    setProcesando(t.id);
    setErr(null);
    try {
      await actualizar('tickets_conexion', t.id, {
        estado: 'en_progreso',
        acuse_recibo_en: Timestamp.now(),
        acuse_recibo_por_uid: user.uid,
        acuse_recibo_por_nombre: `${perfil.nombre} ${perfil.apellido}`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos acusar recibo.');
    } finally {
      setProcesando(null);
    }
  }

  async function resolver(t: TicketConexionDoc) {
    if (!user || !perfil) return;
    const notas = window.prompt('Notas de resolución (opcional):') ?? '';
    setProcesando(t.id);
    setErr(null);
    try {
      await actualizar('tickets_conexion', t.id, {
        estado: 'resuelto',
        resuelto_en: Timestamp.now(),
        resuelto_por_uid: user.uid,
        resuelto_por_nombre: `${perfil.nombre} ${perfil.apellido}`,
        notas_resolucion: notas,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos resolver.');
    } finally {
      setProcesando(null);
    }
  }

  async function bloquear(t: TicketConexionDoc) {
    const razon = window.prompt('Razón del bloqueo:');
    if (!razon) return;
    setProcesando(t.id);
    setErr(null);
    try {
      await actualizar('tickets_conexion', t.id, {
        estado: 'bloqueado',
        bloqueo_razon: razon,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos bloquear.');
    } finally {
      setProcesando(null);
    }
  }

  async function reanudar(t: TicketConexionDoc) {
    setProcesando(t.id);
    setErr(null);
    try {
      await actualizar('tickets_conexion', t.id, {
        estado: 'en_progreso',
        bloqueo_razon: null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos reanudar.');
    } finally {
      setProcesando(null);
    }
  }

  async function marcarNoAplica(t: TicketConexionDoc) {
    if (!user || !perfil) return;
    if (!window.confirm('¿Marcar este ticket como "no aplica"? Quedará cerrado sin acción.'))
      return;
    setProcesando(t.id);
    setErr(null);
    try {
      await actualizar('tickets_conexion', t.id, {
        estado: 'no_aplica',
        resuelto_en: Timestamp.now(),
        resuelto_por_uid: user.uid,
        resuelto_por_nombre: `${perfil.nombre} ${perfil.apellido}`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos marcar.');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Paso 20 · Módulo 8 · Apoyo
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Tickets de conexión
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          {esApoyo
            ? `Cola de tu área (${AREA_LABEL[areaForzada as AreaApoyo] ?? '—'}): accesos, dotación, puesto físico, usuarios contables, inducción.`
            : 'Cola por área: IT, compras, bodega, contabilidad, talentos y administrativo CJ.'}
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MiniStat label="Total" valor={stats.total} icono={<Inbox size={14} strokeWidth={1.75} />} />
        <MiniStat label="Pre-aviso" valor={stats.preavisos} tono="warning" />
        <MiniStat label="Abiertos" valor={stats.abiertos} />
        <MiniStat label="En progreso" valor={stats.enProgreso} tono="info" />
        <MiniStat label="Bloqueados" valor={stats.bloqueados} tono="danger" />
        <MiniStat label="Resueltos" valor={stats.resueltos} tono="success" />
        <MiniStat label="Vencidos" valor={stats.vencidos} tono={stats.vencidos > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-end">
        <label className="block">
          <span className="block text-[11px] font-medium text-text-strong mb-1.5">Área</span>
          <select
            value={areaForzada ?? filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            disabled={esApoyo}
            className={cn(inputClass, 'md:w-auto')}
          >
            <option value="">Todas</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-text-strong mb-1.5">Estado</span>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className={cn(inputClass, 'md:w-auto')}
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        {esApoyo && (
          <p className="text-[11px] text-text-subtle italic max-w-xs self-center">
            Solo ves los tickets de tu área ({AREA_LABEL[areaForzada as AreaApoyo] ?? '—'}). El
            filtro de área queda bloqueado por seguridad.
          </p>
        )}
      </div>

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {/* Tabla */}
      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Ticket
              </th>
              {!esApoyo && (
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Área
                </th>
              )}
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Candidato / vacante
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Criticidad
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                ANS
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Estado
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!cargando && tickets.length === 0 && (
              <tr>
                <td
                  colSpan={esApoyo ? 6 : 7}
                  className="px-4 py-10 text-center text-text-muted text-[13px]"
                >
                  Sin tickets con esos filtros.
                </td>
              </tr>
            )}
            {tickets.map((t) => {
              const ans = semaforoANS(t);
              const acusado = !!t.acuse_recibo_en;
              const esPreaviso =
                t.disparado_por === 'automatico_perfilamiento' && !t.candidato_id;
              return (
                <tr
                  key={t.id}
                  className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors align-top"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-text-strong">{t.titulo}</p>
                      {esPreaviso && <Pill tono="warning">Pre-aviso</Pill>}
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">{TIPO_LABEL[t.tipo]}</p>
                    {esPreaviso && t.fecha_requerida_ingreso && (
                      <p className="text-[11px] text-warning-700 mt-1 inline-flex items-center gap-1.5">
                        <Clock size={11} strokeWidth={1.75} />
                        Ingreso estimado:{' '}
                        <span className="tabular-nums font-medium">
                          {formatearFecha(t.fecha_requerida_ingreso.toDate())}
                        </span>
                      </p>
                    )}
                    {t.estado === 'bloqueado' && t.bloqueo_razon && (
                      <p className="text-[11px] text-danger-700 mt-1.5 italic inline-flex items-center gap-1">
                        <PauseCircle size={11} strokeWidth={1.75} />
                        {t.bloqueo_razon}
                      </p>
                    )}
                    {t.estado === 'resuelto' && t.notas_resolucion && (
                      <p className="text-[11px] text-success-700 mt-1.5 italic inline-flex items-center gap-1">
                        <CheckCircle2 size={11} strokeWidth={1.75} />
                        {t.notas_resolucion}
                      </p>
                    )}
                  </td>
                  {!esApoyo && (
                    <td className="px-4 py-3 text-[12px] text-text-body">{AREA_LABEL[t.area]}</td>
                  )}
                  <td className="px-4 py-3 text-[12px]">
                    {esPreaviso ? (
                      <span className="italic text-warning-700">Sin candidato aún</span>
                    ) : (
                      <span className="text-text-strong font-medium">
                        {t.candidato_nombre || '—'}
                      </span>
                    )}
                    <br />
                    <Link
                      to={`/vacantes/${t.vacante_id}`}
                      className="text-brand-700 hover:text-brand-800 hover:underline font-medium"
                    >
                      {t.vacante_consecutivo || t.vacante_id.slice(0, 8)}
                    </Link>
                    <br />
                    <span className="text-text-subtle">
                      {t.empresa_codigo}-{t.sede_codigo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tono={CRITICIDAD_TONO[t.criticidad]}>{t.criticidad}</Pill>
                    <p className="text-[10px] text-text-subtle mt-1 tabular-nums">
                      {t.ans_dias_habiles} días hábiles
                    </p>
                  </td>
                  <td className={cn('px-4 py-3 text-[12px] tabular-nums', ans.cls)}>
                    {ans.texto}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tono={ESTADO_TONO[t.estado]} dot>
                      {t.estado.replace('_', ' ')}
                    </Pill>
                    {acusado && (
                      <p className="text-[10px] text-success-700 mt-1.5 inline-flex items-center gap-1">
                        <CheckCircle2 size={10} strokeWidth={1.75} />
                        Acuse: {t.acuse_recibo_por_nombre}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-y-1 whitespace-nowrap">
                    {t.estado === 'abierto' && (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => acusarRecibo(t)}
                          disabled={procesando === t.id}
                          className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium disabled:opacity-50"
                        >
                          Acusar recibo
                        </button>
                        <button
                          onClick={() => marcarNoAplica(t)}
                          disabled={procesando === t.id}
                          className="text-[11px] text-text-muted hover:text-text-strong hover:underline disabled:opacity-50"
                        >
                          No aplica
                        </button>
                      </div>
                    )}
                    {t.estado === 'en_progreso' && (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => resolver(t)}
                          disabled={procesando === t.id}
                          className="inline-flex items-center gap-1 text-[12px] text-success-700 hover:text-success-700 hover:underline font-medium disabled:opacity-50"
                        >
                          <CheckCircle2 size={11} strokeWidth={1.75} />
                          Resolver
                        </button>
                        <button
                          onClick={() => bloquear(t)}
                          disabled={procesando === t.id}
                          className="inline-flex items-center gap-1 text-[12px] text-danger-700 hover:text-danger-800 hover:underline disabled:opacity-50"
                        >
                          <PauseCircle size={11} strokeWidth={1.75} />
                          Bloquear
                        </button>
                      </div>
                    )}
                    {t.estado === 'bloqueado' && (
                      <button
                        onClick={() => reanudar(t)}
                        disabled={procesando === t.id}
                        className="inline-flex items-center gap-1 text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium disabled:opacity-50"
                      >
                        <PlayCircle size={11} strokeWidth={1.75} />
                        Reanudar
                      </button>
                    )}
                    {(t.estado === 'no_aplica' || t.estado === 'cancelado') && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-subtle italic">
                        <XCircle size={10} strokeWidth={1.75} />
                        Cerrado
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  valor,
  tono = 'neutral',
  icono,
}: {
  label: string;
  valor: number;
  tono?: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  icono?: React.ReactNode;
}) {
  const claseValor =
    tono === 'brand'
      ? 'text-brand-700'
      : tono === 'info'
        ? 'text-info-700'
        : tono === 'success'
          ? 'text-success-700'
          : tono === 'warning'
            ? 'text-warning-700'
            : tono === 'danger'
              ? 'text-danger-700'
              : 'text-text-strong';
  return (
    <div className="bg-white rounded-md border border-slate-200 p-3.5 shadow-brand-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icono}
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase">{label}</p>
      </div>
      <p
        className={`mt-2 text-[28px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums ${claseValor}`}
      >
        {valor}
      </p>
    </div>
  );
}
