import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
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

const AREAS: AreaApoyo[] = ['it', 'compras', 'bodega', 'contabilidad', 'administrativo', 'talentos'];

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

function badgeEstado(estado: EstadoTicketConexion): string {
  switch (estado) {
    case 'resuelto':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'bloqueado':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'en_progreso':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'no_aplica':
      return 'bg-navy-50 text-navy-500 border-navy-200';
    case 'cancelado':
      return 'bg-navy-50 text-navy-400 border-navy-200';
    default:
      return 'bg-cream-100 text-navy-700 border-navy-200';
  }
}

function semaforoANS(t: TicketConexionDoc): {
  cls: string;
  texto: string;
} {
  if (t.estado === 'resuelto' || t.estado === 'no_aplica' || t.estado === 'cancelado') {
    return { cls: 'text-navy-500', texto: formatearFecha(t.ans_expira_en?.toDate?.()) };
  }
  const expiraMs = t.ans_expira_en?.toMillis?.() ?? 0;
  const ahora = Date.now();
  const diffMs = expiraMs - ahora;
  if (diffMs < 0) {
    return { cls: 'text-red-700 font-semibold', texto: `Vencido · ${formatearFecha(t.ans_expira_en?.toDate?.())}` };
  }
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  if (diffDias < 1) {
    return { cls: 'text-amber-700 font-medium', texto: `Hoy · ${formatearFecha(t.ans_expira_en?.toDate?.())}` };
  }
  return { cls: 'text-navy-600', texto: formatearFecha(t.ans_expira_en?.toDate?.()) };
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
    return { total, abiertos, enProgreso, bloqueados, resueltos, vencidos };
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
    if (!window.confirm('¿Marcar este ticket como "no aplica"? Quedará cerrado sin acción.')) return;
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
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold-700">Paso 20 · Módulo 8</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">Tickets de conexión</h1>
        <p className="text-sm text-navy-600 mt-1">
          {esApoyo
            ? `Cola de tu área (${AREA_LABEL[areaForzada as AreaApoyo] ?? '—'}): accesos, dotación, puesto físico, usuarios contables, inducción.`
            : 'Cola por área: IT, compras, bodega, contabilidad, talentos, administrativo CJ.'}
        </p>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Total" valor={stats.total} />
        <Stat label="Abiertos" valor={stats.abiertos} tono="navy" />
        <Stat label="En progreso" valor={stats.enProgreso} tono="amber" />
        <Stat label="Bloqueados" valor={stats.bloqueados} tono="red" />
        <Stat label="Resueltos" valor={stats.resueltos} tono="emerald" />
        <Stat label="Vencidos" valor={stats.vencidos} tono={stats.vencidos > 0 ? 'red' : 'navy'} />
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Área</span>
          <select
            value={areaForzada ?? filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            disabled={esApoyo}
            className="mt-1 rounded-md border border-navy-200 bg-white px-3 py-2 text-sm disabled:bg-navy-50 disabled:cursor-not-allowed"
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
          <span className="text-xs font-medium text-navy-700">Estado</span>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="mt-1 rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
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
          <p className="text-xs text-navy-500 max-w-xs">
            Solo ves los tickets de tu área ({AREA_LABEL[areaForzada as AreaApoyo] ?? '—'}). El filtro
            de área está bloqueado por seguridad.
          </p>
        )}
      </div>

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}

      <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Ticket</th>
              {!esApoyo && <th className="px-4 py-2 font-medium">Área</th>}
              <th className="px-4 py-2 font-medium">Candidato / vacante</th>
              <th className="px-4 py-2 font-medium">Criticidad</th>
              <th className="px-4 py-2 font-medium">ANS</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {!cargando && tickets.length === 0 && (
              <tr>
                <td colSpan={esApoyo ? 6 : 7} className="px-4 py-8 text-center text-navy-500">
                  Sin tickets con esos filtros.
                </td>
              </tr>
            )}
            {tickets.map((t) => {
              const ans = semaforoANS(t);
              const acusado = !!t.acuse_recibo_en;
              return (
                <tr key={t.id} className="border-t border-navy-50 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy-900">{t.titulo}</p>
                    <p className="text-xs text-navy-500">{TIPO_LABEL[t.tipo]}</p>
                    {t.estado === 'bloqueado' && t.bloqueo_razon && (
                      <p className="text-xs text-red-700 mt-1 italic">⛔ {t.bloqueo_razon}</p>
                    )}
                    {t.estado === 'resuelto' && t.notas_resolucion && (
                      <p className="text-xs text-emerald-700 mt-1 italic">✓ {t.notas_resolucion}</p>
                    )}
                  </td>
                  {!esApoyo && (
                    <td className="px-4 py-3 text-xs text-navy-600">{AREA_LABEL[t.area]}</td>
                  )}
                  <td className="px-4 py-3 text-xs text-navy-600">
                    {t.candidato_nombre || '—'}
                    <br />
                    <Link
                      to={`/vacantes/${t.vacante_id}`}
                      className="text-gold-700 hover:underline"
                    >
                      {t.vacante_consecutivo || t.vacante_id.slice(0, 8)}
                    </Link>
                    <br />
                    <span className="text-navy-500">{t.empresa_codigo}-{t.sede_codigo}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        t.criticidad === 'Alta'
                          ? 'bg-red-50 text-red-700'
                          : t.criticidad === 'Media'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-navy-50 text-navy-600'
                      }`}
                    >
                      {t.criticidad}
                    </span>
                    <p className="text-[10px] text-navy-500 mt-1">{t.ans_dias_habiles} días hábiles</p>
                  </td>
                  <td className={`px-4 py-3 text-xs ${ans.cls}`}>{ans.texto}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${badgeEstado(t.estado)}`}
                    >
                      {t.estado.replace('_', ' ')}
                    </span>
                    {acusado && (
                      <p className="text-[10px] text-emerald-700 mt-1">
                        Acuse: {t.acuse_recibo_por_nombre}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {t.estado === 'abierto' && (
                      <>
                        <button
                          onClick={() => acusarRecibo(t)}
                          disabled={procesando === t.id}
                          className="text-xs text-gold-700 hover:underline disabled:opacity-50"
                        >
                          Acusar recibo
                        </button>
                        <button
                          onClick={() => marcarNoAplica(t)}
                          disabled={procesando === t.id}
                          className="text-xs text-navy-500 hover:underline disabled:opacity-50"
                        >
                          No aplica
                        </button>
                      </>
                    )}
                    {t.estado === 'en_progreso' && (
                      <>
                        <button
                          onClick={() => resolver(t)}
                          disabled={procesando === t.id}
                          className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          Resolver
                        </button>
                        <button
                          onClick={() => bloquear(t)}
                          disabled={procesando === t.id}
                          className="text-xs text-red-700 hover:underline disabled:opacity-50"
                        >
                          Bloquear
                        </button>
                      </>
                    )}
                    {t.estado === 'bloqueado' && (
                      <button
                        onClick={() => reanudar(t)}
                        disabled={procesando === t.id}
                        className="text-xs text-gold-700 hover:underline disabled:opacity-50"
                      >
                        Reanudar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  valor,
  tono = 'navy',
}: {
  label: string;
  valor: number;
  tono?: 'navy' | 'amber' | 'red' | 'emerald';
}) {
  const claseValor =
    tono === 'amber'
      ? 'text-amber-700'
      : tono === 'red'
        ? 'text-red-700'
        : tono === 'emerald'
          ? 'text-emerald-700'
          : 'text-navy-900';
  return (
    <div className="rounded-lg border border-navy-100 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-navy-500">{label}</p>
      <p className={`text-2xl font-semibold ${claseValor}`}>{valor}</p>
    </div>
  );
}
