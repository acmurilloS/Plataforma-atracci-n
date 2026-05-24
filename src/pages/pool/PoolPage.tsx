import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, Sparkles } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import {
  dominioCandidato,
  resultadoUltimaPostulacion,
  type CandidatoDoc,
  type DominioCandidato,
  type ResultadoUltimaPostulacion,
} from '../../schemas';
import { CandidatoPoolDetalle } from './CandidatoPoolDetalle';

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

function badgeResultado(r: ResultadoUltimaPostulacion): string {
  switch (r) {
    case 'apto_no_contratado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'contratado':
      return 'bg-navy-100 text-navy-700 border-navy-200';
    case 'descartado_lider':
    case 'filtrado_no_cumple':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'no_apto_medico':
    case 'desistio':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-cream-100 text-navy-600 border-navy-200';
  }
}

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

  const filtrados = useMemo(() => {
    const b = filtroBusqueda.toLowerCase().trim();
    return candidatos.filter((c) => {
      if (c.duplicado_de) return false;
      if (soloAptos && c.apto_para_pool_futuro === false) return false;
      if (filtroDominio && c.dominio_principal !== filtroDominio) return false;
      if (filtroCiudad && !(c.ciudad_residencia ?? '').toLowerCase().includes(filtroCiudad.toLowerCase())) {
        return false;
      }
      if (filtroResultado && c.resultado_ultima_postulacion !== filtroResultado) return false;
      if (b) {
        const haystack = `${c.nombres} ${c.apellidos} ${c.email ?? ''} ${c.documento_numero ?? ''} ${c.especialidad_tecnica ?? ''}`.toLowerCase();
        if (!haystack.includes(b)) return false;
      }
      return true;
    });
  }, [candidatos, filtroBusqueda, filtroDominio, filtroCiudad, filtroResultado, soloAptos]);

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

  const candidatoSeleccionado = detalleId ? candidatos.find((c) => c.id === detalleId) ?? null : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold-700">
          Módulo 11 · Base cross-vacante
        </p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Pool propio de candidatos
        </h1>
        <p className="text-sm text-navy-600 mt-1 max-w-3xl">
          Búsqueda cross-vacante de candidatos que ya pasaron por procesos. Útil cuando se abre
          una vacante nueva similar a una anterior — en vez de empezar desde cero, sugiere
          candidatos reciclables del pool.
        </p>
      </div>

      {/* Empty state honesto — el pool madura con uso, no es mágico el día 1 */}
      {!cargando && stats.total < 10 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-amber-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              El pool arranca en ceros y madura con uso
            </p>
            <p className="text-xs text-amber-800 mt-1 max-w-2xl">
              Hoy hay {stats.total} candidato(s). En 2-3 meses de operación, esta vista será útil
              para reciclar candidatos descartados blando, aptos no contratados, o aceptados que
              desistieron. Por ahora la prioridad es que cada candidato quede bien etiquetado
              (ciudad, dominio, motivo de descarte) — eso ya pasa automático.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Candidatos totales" valor={stats.total} icono={<Users size={16} />} />
        <Stat label="Aptos para pool" valor={stats.aptos} tono="emerald" />
        <Stat label="Reciclables (apto · no contratado)" valor={stats.reciclables} tono="emerald" />
        <Stat label="Ya contratados" valor={stats.contratados} tono="navy" />
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-navy-100 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="md:col-span-2 block">
            <span className="text-xs font-medium text-navy-700">Buscar</span>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-navy-200 px-3 py-2">
              <Search size={14} className="text-navy-400" />
              <input
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                placeholder="Nombre, email, cédula, especialidad…"
                className="w-full text-sm outline-none"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Dominio</span>
            <select
              value={filtroDominio}
              onChange={(e) => setFiltroDominio(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
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
            <span className="text-xs font-medium text-navy-700">Ciudad</span>
            <input
              value={filtroCiudad}
              onChange={(e) => setFiltroCiudad(e.target.value)}
              placeholder="Bogotá, Medellín…"
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Resultado</span>
            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
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
        <label className="flex items-center gap-2 text-xs text-navy-700">
          <input
            type="checkbox"
            checked={soloAptos}
            onChange={(e) => setSoloAptos(e.target.checked)}
          />
          Solo aptos para pool (excluye no apto médico, pase judicial rojo, desistió 2+ veces)
        </label>
      </div>

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}

      {!cargando && filtrados.length === 0 && (
        <div className="rounded-xl border border-navy-100 bg-white p-8 text-center text-sm text-navy-500">
          {stats.total === 0
            ? 'Aún no hay candidatos en la base. Crea o recibe la primera postulación para empezar a llenar el pool.'
            : 'Ningún candidato cumple los filtros actuales.'}
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Candidato</th>
                <th className="px-4 py-2 font-medium">Ciudad</th>
                <th className="px-4 py-2 font-medium">Dominio · Especialidad</th>
                <th className="px-4 py-2 font-medium">Exp.</th>
                <th className="px-4 py-2 font-medium">Postulaciones</th>
                <th className="px-4 py-2 font-medium">Última vacante</th>
                <th className="px-4 py-2 font-medium">Resultado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 200).map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-navy-50 hover:bg-cream-50/40 cursor-pointer"
                  onClick={() => setDetalleId(c.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy-900">
                      {c.nombres} {c.apellidos}
                    </p>
                    <p className="text-[11px] text-navy-500">{c.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-navy-600">{c.ciudad_residencia || '—'}</td>
                  <td className="px-4 py-3 text-xs text-navy-700">
                    <p>{DOMINIO_LABEL[c.dominio_principal ?? 'sin_clasificar']}</p>
                    {c.especialidad_tecnica && (
                      <p className="text-[11px] text-navy-500 italic">{c.especialidad_tecnica}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-navy-600">
                    {c.anios_experiencia_aproximados != null
                      ? `${c.anios_experiencia_aproximados} años`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-navy-700">{c.total_postulaciones ?? 1}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.ultima_vacante_id ? (
                      <Link
                        to={`/vacantes/${c.ultima_vacante_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-gold-700 hover:underline"
                      >
                        {c.ultima_vacante_consecutivo || c.ultima_vacante_id.slice(0, 6)}
                      </Link>
                    ) : (
                      '—'
                    )}
                    <p className="text-[10px] text-navy-400">
                      {c.fecha_ultima_postulacion
                        ? formatearFecha(c.fecha_ultima_postulacion.toDate())
                        : '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${badgeResultado(
                        c.resultado_ultima_postulacion ?? 'sin_resultado_aun',
                      )}`}
                    >
                      {RESULTADO_LABEL[c.resultado_ultima_postulacion ?? 'sin_resultado_aun']}
                    </span>
                    {c.apto_para_pool_futuro === false && (
                      <p className="text-[10px] text-red-700 mt-1">⛔ No apto</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetalleId(c.id);
                      }}
                      className="text-xs text-gold-700 hover:underline"
                    >
                      Ver historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > 200 && (
            <p className="px-4 py-2 text-[11px] text-navy-500 border-t border-navy-50">
              Mostrando 200 de {filtrados.length}. Refina los filtros para ver el resto.
            </p>
          )}
        </div>
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

function Stat({
  label,
  valor,
  tono = 'navy',
  icono,
}: {
  label: string;
  valor: number;
  tono?: 'navy' | 'emerald' | 'red';
  icono?: React.ReactNode;
}) {
  const claseValor =
    tono === 'emerald' ? 'text-emerald-700' : tono === 'red' ? 'text-red-700' : 'text-navy-900';
  return (
    <div className="rounded-lg border border-navy-100 bg-white px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-navy-500 flex items-center gap-1">
        {icono}
        {label}
      </p>
      <p className={`text-2xl font-semibold mt-1 ${claseValor}`}>{valor}</p>
    </div>
  );
}
