import { useMemo, useState } from 'react';
import { CalendarRange, Download, FileSpreadsheet, Filter } from 'lucide-react';
import { Button, Card } from '../brand';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import {
  agruparPostulaciones,
  construirBaseVacantes,
  construirResumenMensual,
  esVacanteCerrada,
} from '../../utils/reportesVacantes';
import { exportarBaseVacantes, exportarReporteMensual } from '../../utils/exportarExcel';
import { estadoVacante } from '../../schemas';
import type { EmpresaDoc, PostulacionDoc, SedeDoc, VacanteDoc } from '../../schemas';

/**
 * ReportesDescarga · sección del dashboard (solo staff) para bajar a Excel la
 * base de vacantes (con tiempos en días hábiles + semáforo ANS) y el resumen
 * mensual. Filtros aplicables antes de descargar: rango de fechas (sobre la
 * apertura = creado_en), empresa, sede, estado y criticidad. Nada hardcodeado:
 * las opciones salen de las vacantes cargadas.
 */

interface Props {
  vacantes: VacanteDoc[];
  postulaciones: PostulacionDoc[];
  festivos: Set<string>;
}

function aDate(ts: unknown): Date | null {
  return (ts as { toDate?: () => Date } | null)?.toDate?.() ?? null;
}

const selectClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-text-strong ' +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

export function ReportesDescarga({ vacantes, postulaciones, festivos }: Props) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [sede, setSede] = useState('');
  const [estado, setEstado] = useState('');
  const [criticidad, setCriticidad] = useState('');

  // Catálogos completos para poblar los filtros (no solo lo presente en las
  // vacantes cargadas) → los dropdowns muestran TODAS las opciones reales.
  const { docs: empresasCat } = useColeccion<EmpresaDoc>('empresas', { limit: 200 });
  const { docs: sedesCat } = useColeccion<SedeDoc>('sedes', { limit: 500 });

  const opciones = useMemo(() => {
    // Empresas: del catálogo (activas) + las presentes en vacantes (datos huérfanos).
    const empresas = new Map<string, string>();
    for (const e of empresasCat) {
      if (e.activo !== false && e.codigo) empresas.set(e.codigo, e.nombre ?? e.codigo);
    }
    for (const v of vacantes) {
      if (v.empresa_codigo && !empresas.has(v.empresa_codigo)) {
        empresas.set(v.empresa_codigo, v.empresa_nombre ?? v.empresa_codigo);
      }
    }
    // Sedes: NOMBRES únicos (varias empresas comparten ciudad, p.ej. "Bogotá") del
    // catálogo activo + vacantes, acotados a la empresa seleccionada. Se deduplica y
    // filtra por nombre para que el dropdown no muestre la misma ciudad repetida.
    const sedes = new Set<string>();
    for (const s of sedesCat) {
      if (s.activo === false || !s.nombre) continue;
      if (empresa && s.empresa_codigo !== empresa) continue;
      sedes.add(s.nombre);
    }
    for (const v of vacantes) {
      if (!v.sede_nombre) continue;
      if (empresa && v.empresa_codigo !== empresa) continue;
      sedes.add(v.sede_nombre);
    }
    return {
      empresas: [...empresas.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      sedes: [...sedes].sort((a, b) => a.localeCompare(b)),
      estados: [...estadoVacante.options],
      criticidades: ['Alta', 'Media', 'Baja'],
    };
  }, [empresasCat, sedesCat, vacantes, empresa]);

  const filtradas = useMemo(() => {
    return vacantes.filter((v) => {
      if (empresa && v.empresa_codigo !== empresa) return false;
      if (sede && v.sede_nombre !== sede) return false;
      if (estado && v.estado !== estado) return false;
      if (criticidad && v.criticidad !== criticidad) return false;
      if (desde || hasta) {
        const ap = aDate(v.creado_en);
        if (!ap) return false;
        const iso = formatearFecha(ap, 'yyyy-MM-dd'); // yyyy-MM-dd en zona Bogotá
        if (desde && iso < desde) return false;
        if (hasta && iso > hasta) return false;
      }
      return true;
    });
  }, [vacantes, empresa, sede, estado, criticidad, desde, hasta]);

  const idsFiltrados = useMemo(() => new Set(filtradas.map((v) => v.id)), [filtradas]);
  const postulacionesFiltradas = useMemo(
    () => postulaciones.filter((p) => idsFiltrados.has(p.vacante_id)),
    [postulaciones, idsFiltrados],
  );

  const cerradas = filtradas.filter((v) => esVacanteCerrada(v.estado)).length;
  const activas = filtradas.length - cerradas;

  const [generando, setGenerando] = useState<'base' | 'mensual' | null>(null);
  const [error, setError] = useState('');

  const descargarBase = async () => {
    setError('');
    setGenerando('base');
    try {
      const conteos = agruparPostulaciones(postulacionesFiltradas);
      await exportarBaseVacantes(construirBaseVacantes(filtradas, conteos, festivos, new Date()));
    } catch {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setGenerando(null);
    }
  };
  const descargarMensual = async () => {
    setError('');
    setGenerando('mensual');
    try {
      await exportarReporteMensual(
        construirResumenMensual(filtradas, postulacionesFiltradas, festivos, new Date()),
      );
    } catch {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setGenerando(null);
    }
  };

  const limpiar = () => {
    setDesde('');
    setHasta('');
    setEmpresa('');
    setSede('');
    setEstado('');
    setCriticidad('');
  };

  const sinDatos = filtradas.length === 0;

  return (
    <Card padding="lg">
      <div className="flex items-center gap-2 mb-1 text-text-muted">
        <FileSpreadsheet size={14} strokeWidth={1.75} />
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase">
          Reportes · descarga a Excel
        </p>
      </div>
      <p className="text-[13px] text-text-muted leading-[1.55] mb-5 max-w-2xl">
        Base de toda la atracción con tiempos en días hábiles (ANS de terna: 15 hábiles, meta 10) y
        resumen mensual. Filtra antes de descargar.
      </p>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <label className="block">
          <span className="text-[11px] font-medium text-text-muted">Desde (apertura)</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={selectClass + ' mt-1'}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-text-muted">Hasta (apertura)</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={selectClass + ' mt-1'}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-text-muted">Empresa</span>
          <select
            value={empresa}
            onChange={(e) => {
              setEmpresa(e.target.value);
              setSede('');
            }}
            className={selectClass + ' mt-1'}
          >
            <option value="">Todas</option>
            {opciones.empresas.map(([cod, nom]) => (
              <option key={cod} value={cod}>
                {nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-text-muted">Sede</span>
          <select value={sede} onChange={(e) => setSede(e.target.value)} className={selectClass + ' mt-1'}>
            <option value="">Todas</option>
            {opciones.sedes.map((nom) => (
              <option key={nom} value={nom}>
                {nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-text-muted">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClass + ' mt-1'}>
            <option value="">Todos</option>
            {opciones.estados.map((e) => (
              <option key={e} value={e}>
                {e.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-text-muted">Criticidad</span>
          <select
            value={criticidad}
            onChange={(e) => setCriticidad(e.target.value)}
            className={selectClass + ' mt-1'}
          >
            <option value="">Todas</option>
            {opciones.criticidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[12px] text-text-subtle inline-flex items-center gap-1.5">
          <Filter size={12} strokeWidth={1.75} />
          <span className="tabular-nums">
            <span className="font-semibold text-text-strong">{filtradas.length}</span> vacantes ·{' '}
            {activas} activas · {cerradas} cerradas
          </span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {(desde || hasta || empresa || sede || estado || criticidad) && (
            <Button variant="neutral-tertiary" size="medium" onClick={limpiar}>
              Limpiar filtros
            </Button>
          )}
          <Button
            variant="neutral-secondary"
            size="medium"
            icon={<CalendarRange size={14} strokeWidth={1.75} />}
            onClick={descargarMensual}
            disabled={sinDatos || generando !== null}
            loading={generando === 'mensual'}
          >
            Reporte mensual
          </Button>
          <Button
            variant="brand-primary"
            size="medium"
            icon={<Download size={14} strokeWidth={1.75} />}
            onClick={descargarBase}
            disabled={sinDatos || generando !== null}
            loading={generando === 'base'}
          >
            Descargar base de vacantes
          </Button>
        </div>
      </div>
      {error && <p className="mt-3 text-[12px] text-danger-700">{error}</p>}
    </Card>
  );
}
