import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, Users } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import {
  dominioCandidato,
  resultadoUltimaPostulacion,
  type CandidatoDoc,
  type DominioCandidato,
  type ResultadoUltimaPostulacion,
  type VacanteDoc,
} from '../../schemas';
import { Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import { CandidatoPoolDetalle } from './CandidatoPoolDetalle';

/**
 * PoolPage · sistema brand.
 *
 * Módulo 11 · base cross-vacante. Empty state honesto cuando hay <10
 * candidatos. Filtros sunken brand + tabla brand con tono semántico por
 * resultado y panel lateral para el detalle del candidato.
 */

const DOMINIO_LABEL: Record<DominioCandidato, string> = {
  ti_desarrollo: 'TI · Desarrollo',
  ti_infraestructura: 'TI · Infraestructura',
  ti_datos: 'TI · Datos',
  comercial: 'Comercial',
  comercial_b2b: 'Comercial B2B',
  comercial_b2c: 'Comercial B2C',
  contable_financiero: 'Contable / Financiero',
  administrativo: 'Administrativo',
  operativo: 'Operativo',
  logistica: 'Logística',
  liderazgo: 'Liderazgo',
  rrhh_talento: 'RRHH / Talento',
  mercadeo: 'Mercadeo',
  sin_clasificar: 'Sin clasificar',
};

const RESULTADO_LABEL: Record<ResultadoUltimaPostulacion, string> = {
  sin_resultado_aun: 'En proceso',
  apto_no_contratado: 'Apto · no contratado',
  descartado_lider: 'Descartado · líder',
  filtrado_no_cumple: 'No cumple filtro',
  no_apto_medico: 'No apto · médico',
  desistio: 'Desistió',
  contratado: 'Contratado',
};

const RESULTADO_TONO: Record<ResultadoUltimaPostulacion, PillTono> = {
  sin_resultado_aun: 'neutral',
  apto_no_contratado: 'success',
  descartado_lider: 'warning',
  filtrado_no_cumple: 'warning',
  no_apto_medico: 'danger',
  desistio: 'danger',
  contratado: 'info',
};

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

export default function PoolPage() {
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroDominio, setFiltroDominio] = useState<string>('');
  const [filtroCiudad, setFiltroCiudad] = useState('');
  const [filtroResultado, setFiltroResultado] = useState<string>('');
  const [soloAptos, setSoloAptos] = useState(true);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const { docs: candidatos, cargando } = useColeccion<CandidatoDoc>('candidatos', {
    limit: 500,
  });

  // Mapa vacante_id → cargo para mostrar el CARGO (no solo el consecutivo) en la
  // columna "Última vacante". Vacantes es una colección chica, así que cargarla
  // y mapear sirve para candidatos viejos y nuevos sin migrar datos.
  const { docs: vacantes } = useColeccion<VacanteDoc>('vacantes', { limit: 1000 });
  const cargoPorVacante = useMemo(() => {
    const m = new Map<string, string>();
    vacantes.forEach((v) => m.set(v.id, v.cargo_nombre));
    return m;
  }, [vacantes]);

  const filtrados = useMemo(() => {
    const b = filtroBusqueda.toLowerCase().trim();
    return candidatos.filter((c) => {
      if (c.duplicado_de) return false;
      if (soloAptos && c.apto_para_pool_futuro === false) return false;
      if (filtroDominio && c.dominio_principal !== filtroDominio) return false;
      if (
        filtroCiudad &&
        !(c.ciudad_residencia ?? '').toLowerCase().includes(filtroCiudad.toLowerCase())
      ) {
        return false;
      }
      if (filtroResultado && c.resultado_ultima_postulacion !== filtroResultado) return false;
      if (b) {
        const cargo = c.ultima_vacante_id ? (cargoPorVacante.get(c.ultima_vacante_id) ?? '') : '';
        const haystack = `${c.nombres} ${c.apellidos} ${c.email ?? ''} ${c.documento_numero ?? ''} ${c.especialidad_tecnica ?? ''} ${cargo} ${c.ultima_vacante_consecutivo ?? ''}`.toLowerCase();
        if (!haystack.includes(b)) return false;
      }
      return true;
    });
  }, [candidatos, filtroBusqueda, filtroDominio, filtroCiudad, filtroResultado, soloAptos, cargoPorVacante]);

  const stats = useMemo(() => {
    const sinDuplicados = candidatos.filter((c) => !c.duplicado_de);
    const aptos = sinDuplicados.filter((c) => c.apto_para_pool_futuro !== false);
    const reciclables = sinDuplicados.filter(
      (c) => c.resultado_ultima_postulacion === 'apto_no_contratado',
    );
    const contratados = sinDuplicados.filter(
      (c) => c.resultado_ultima_postulacion === 'contratado',
    );
    return {
      total: sinDuplicados.length,
      aptos: aptos.length,
      reciclables: reciclables.length,
      contratados: contratados.length,
    };
  }, [candidatos]);

  const candidatoSeleccionado = detalleId
    ? (candidatos.find((c) => c.id === detalleId) ?? null)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Módulo 11 · Base cross-vacante
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Pool propio de candidatos
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-3xl">
          Búsqueda cross-vacante de candidatos que ya pasaron por procesos. Cuando se abre una
          vacante similar a una anterior, en vez de empezar desde cero, sugiere candidatos
          reciclables del pool.
        </p>
      </div>

      {/* Empty state honesto · el pool madura con uso */}
      {!cargando && stats.total < 10 && (
        <Card padding="lg" className="border-warning-500/30 bg-warning-50/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-warning-100 text-warning-700 flex items-center justify-center shrink-0">
              <Sparkles size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-warning-700">
                El pool arranca en ceros y madura con uso
              </p>
              <p className="text-[12px] text-warning-700/80 mt-1.5 max-w-2xl leading-relaxed">
                Hoy hay{' '}
                <span className="tabular-nums font-bold">{stats.total}</span> candidato(s). En 2-3
                meses de operación, esta vista será útil para reciclar candidatos descartados
                blando, aptos no contratados, o aceptados que desistieron. Por ahora la prioridad
                es que cada candidato quede bien etiquetado (ciudad, dominio, motivo de descarte) —
                eso ya pasa automático.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat
          label="Candidatos totales"
          valor={stats.total}
          icono={<Users size={14} strokeWidth={1.75} />}
        />
        <MiniStat label="Aptos para pool" valor={stats.aptos} tono="success" />
        <MiniStat label="Reciclables · apto no contratado" valor={stats.reciclables} tono="success" />
        <MiniStat label="Ya contratados" valor={stats.contratados} tono="info" />
      </div>

      {/* Filtros */}
      <Card padding="md">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <label className="md:col-span-2 block">
            <span className="block text-[11px] font-medium text-text-strong mb-1.5">Buscar</span>
            <div className="relative">
              <Search
                size={14}
                strokeWidth={1.75}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
              />
              <input
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                placeholder="Nombre, email, cédula, especialidad…"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-text-strong mb-1.5">Dominio</span>
            <select
              value={filtroDominio}
              onChange={(e) => setFiltroDominio(e.target.value)}
              className={inputClass}
            >
              <option value="">Todos</option>
              {dominioCandidato.options.map((d) => (
                <option key={d} value={d}>
                  {DOMINIO_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-text-strong mb-1.5">Ciudad</span>
            <input
              value={filtroCiudad}
              onChange={(e) => setFiltroCiudad(e.target.value)}
              placeholder="Bogotá, Medellín…"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-text-strong mb-1.5">Resultado</span>
            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className={inputClass}
            >
              <option value="">Todos</option>
              {resultadoUltimaPostulacion.options.map((r) => (
                <option key={r} value={r}>
                  {RESULTADO_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-[12px] text-text-body cursor-pointer">
          <input
            type="checkbox"
            checked={soloAptos}
            onChange={(e) => setSoloAptos(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300/40"
          />
          <span>
            Solo aptos para pool{' '}
            <span className="text-text-subtle italic">
              (excluye no apto médico, pase judicial rojo, desistió 2+ veces)
            </span>
          </span>
        </label>
      </Card>

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {!cargando && filtrados.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[13px] text-text-muted">
            {stats.total === 0
              ? 'Aún no hay candidatos en la base. Crea o recibe la primera postulación para empezar a llenar el pool.'
              : 'Ningún candidato cumple los filtros actuales.'}
          </p>
        </div>
      )}

      {filtrados.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Candidato
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Ciudad
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Dominio · Especialidad
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Exp.
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Postul.
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Última vacante
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Resultado
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 200).map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-slate-100 hover:bg-slate-50/30 cursor-pointer transition-colors"
                  onClick={() => setDetalleId(c.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-strong">
                      {c.nombres} {c.apellidos}
                    </p>
                    <p className="text-[11px] text-text-subtle">{c.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-text-body">
                    {c.ciudad_residencia || <span className="text-text-subtle">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[12px]">
                    <p className="text-text-strong font-medium">
                      {DOMINIO_LABEL[c.dominio_principal ?? 'sin_clasificar']}
                    </p>
                    {c.especialidad_tecnica && (
                      <p className="text-[11px] text-text-subtle italic mt-0.5">
                        {c.especialidad_tecnica}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-text-body tabular-nums">
                    {c.anios_experiencia_aproximados != null
                      ? `${c.anios_experiencia_aproximados}a`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-text-body tabular-nums">
                    {c.total_postulaciones ?? 1}
                  </td>
                  <td className="px-4 py-3 text-[12px]">
                    {c.ultima_vacante_id ? (
                      <Link
                        to={`/vacantes/${c.ultima_vacante_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-brand-700 hover:text-brand-800 hover:underline font-medium"
                      >
                        {cargoPorVacante.get(c.ultima_vacante_id) ||
                          c.ultima_vacante_consecutivo ||
                          'Ver vacante'}
                      </Link>
                    ) : (
                      <span className="text-text-subtle">—</span>
                    )}
                    {c.ultima_vacante_id && c.ultima_vacante_consecutivo && (
                      <p className="text-[10px] text-text-subtle font-mono">
                        {c.ultima_vacante_consecutivo}
                      </p>
                    )}
                    <p className="text-[10px] text-text-subtle tabular-nums">
                      {c.fecha_ultima_postulacion
                        ? formatearFecha(c.fecha_ultima_postulacion.toDate())
                        : '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Pill
                      tono={RESULTADO_TONO[c.resultado_ultima_postulacion ?? 'sin_resultado_aun']}
                      dot
                    >
                      {RESULTADO_LABEL[c.resultado_ultima_postulacion ?? 'sin_resultado_aun']}
                    </Pill>
                    {c.apto_para_pool_futuro === false && (
                      <p className="text-[10px] text-danger-700 mt-1 font-medium">⛔ No apto</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetalleId(c.id);
                      }}
                      className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                    >
                      Ver historial →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > 200 && (
            <p className="px-4 py-2.5 text-[11px] text-text-subtle border-t border-slate-100 bg-slate-50/50">
              Mostrando 200 de {filtrados.length}. Refina los filtros para ver el resto.
            </p>
          )}
        </Card>
      )}

      {candidatoSeleccionado && (
        <CandidatoPoolDetalle
          candidato={candidatoSeleccionado}
          onClose={() => setDetalleId(null)}
        />
      )}
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
    <div className="bg-white rounded-md border border-slate-200 p-4 shadow-brand-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icono}
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase">{label}</p>
      </div>
      <p
        className={`mt-2 text-[36px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums ${claseValor}`}
      >
        {valor}
      </p>
    </div>
  );
}
