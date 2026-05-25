import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Plus, Search, Sparkles } from 'lucide-react';
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
import { Button, Card, Pill, type PillTono } from '../components/brand';
import { cn } from '../utils/cn';

/**
 * VacantesListaPage · sistema brand.
 *
 * Tablero principal de coord/GH/admin. Filtros sunken arriba, tabla brand con
 * eyebrow uppercase, pills semánticas por estado y criticidad.
 */

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

const inputClass = cn(
  'block bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

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
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
      {/* Hero */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <Pill tono="brand" dot>
            Operación
          </Pill>
          <h1
            className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            Todas las vacantes
          </h1>
          <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
            Vista de coordinación, GH y admin.{' '}
            <span className="tabular-nums font-semibold text-text-body">
              {vacantes.length} mostradas
            </span>{' '}
            · 100 más recientes. Filtra por estado, empresa o buscador libre.
          </p>
        </div>
        <Link to="/vacantes/nueva">
          <Button variant="brand-primary" icon={<Plus size={13} strokeWidth={1.75} />}>
            Nueva vacante
          </Button>
        </Link>
      </div>

      {/* Filtros sunken */}
      <Card padding="md">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              size={13}
              strokeWidth={1.75}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cargo, consecutivo, líder…"
              className={cn(inputClass, 'w-full pl-9')}
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className={inputClass}
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={filtroEmpresa}
            onChange={(e) => setFiltroEmpresa(e.target.value)}
            className={inputClass}
          >
            <option value="">Todas las empresas</option>
            {empresasUnicas.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Tabla */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Consecutivo
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Cargo
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Empresa / Sede
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Criticidad
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Salario
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Estado
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Líder
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Creada
                </th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-text-muted text-[13px]">
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && filtradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <div className="mx-auto max-w-md">
                      <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
                        <Sparkles size={20} strokeWidth={1.5} />
                      </div>
                      <p className="text-[15px] font-medium text-text-strong">
                        Sin vacantes con estos filtros
                      </p>
                      <p className="text-[12px] text-text-muted mt-1">
                        Cambia los filtros o crea una nueva desde el botón superior.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {filtradas.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-text-strong">
                    {v.consecutivo || (
                      <span className="text-text-subtle italic">pendiente</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-strong font-medium">{v.cargo_nombre}</td>
                  <td className="px-4 py-3 text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2
                        size={11}
                        strokeWidth={1.5}
                        className="text-text-subtle shrink-0"
                      />
                      <span className="font-mono text-[12px]">
                        {v.empresa_codigo} / {v.sede_codigo}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tono={CRITICIDAD_TONO[v.criticidad] ?? 'neutral'}>
                      {v.criticidad}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-text-body">
                    {formatearCOP(v.salario_base)}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tono={ESTADO_TONO[v.estado] ?? 'neutral'} dot>
                      {v.estado.replace(/_/g, ' ')}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{v.lider_nombre}</td>
                  <td className="px-4 py-3 text-text-muted tabular-nums">
                    {v.creado_en ? formatearFecha(v.creado_en.toDate()) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={`/vacantes/${v.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                    >
                      Ver
                      <ArrowRight size={12} strokeWidth={1.75} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
