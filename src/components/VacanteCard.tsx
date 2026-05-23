import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../utils/cn';
import { Avatar, Badge, Card, SemaforoANS } from './ui';
import type { VacanteDoc } from '../schemas';
import type { BadgeVariant } from './ui';

interface FaseDef {
  clave: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  label: string;
  estados: string[];
  badge: BadgeVariant;
  barraClase: string;
  bloqueClase: string;
  textoEstadoClase: string;
}

// Escala monocromática rojo → negro alineada al brand book.
const FASES: FaseDef[] = [
  {
    clave: 'A',
    label: 'Inicio',
    estados: ['borrador', 'aprobada'],
    badge: 'fase-a',
    barraClase: 'bg-gold-100',
    bloqueClase: 'bg-gold-50',
    textoEstadoClase: 'text-gold-700',
  },
  {
    clave: 'B',
    label: 'Reclutamiento',
    estados: ['lista_para_publicar', 'publicada'],
    badge: 'fase-b',
    barraClase: 'bg-gold-200',
    bloqueClase: 'bg-gold-100',
    textoEstadoClase: 'text-gold-700',
  },
  {
    clave: 'C',
    label: 'Selección',
    estados: ['en_proceso'],
    badge: 'fase-c',
    barraClase: 'bg-gold-300',
    bloqueClase: 'bg-gold-200',
    textoEstadoClase: 'text-gold-800',
  },
  {
    clave: 'D',
    label: 'Decisión',
    estados: ['terna_enviada', 'seleccionado'],
    badge: 'fase-d',
    barraClase: 'bg-gold-400',
    bloqueClase: 'bg-gold-400 text-white',
    textoEstadoClase: 'text-white',
  },
  {
    clave: 'E',
    label: 'Ingreso',
    estados: ['en_contratacion'],
    badge: 'fase-e',
    barraClase: 'bg-gold-600',
    bloqueClase: 'bg-gold-600 text-white',
    textoEstadoClase: 'text-white',
  },
  {
    clave: 'F',
    label: 'Vinculación',
    estados: ['cerrada'],
    badge: 'fase-f',
    barraClase: 'bg-navy-900',
    bloqueClase: 'bg-navy-900 text-white',
    textoEstadoClase: 'text-white',
  },
];

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Esperando validación de GH',
  aprobada: 'Aval aprobado · lista para perfilar',
  lista_para_publicar: 'Perfilamiento listo · lista para publicar',
  publicada: 'Publicada · recibiendo HV',
  en_proceso: 'Evaluando candidatos',
  terna_enviada: 'Terna enviada · esperando decisión del líder',
  seleccionado: 'Candidato elegido · solicitando exámenes',
  en_contratacion: 'Exámenes y documentación en curso',
  cerrada: 'Cerrada · ingreso en curso',
  desierta: 'Desierta',
  cancelada: 'Cancelada',
  pausada: 'Pausada',
};

interface Responsable {
  rol: string;
  nombre: string;
}

function faseDeEstado(estado: string): number {
  return FASES.findIndex((f) => f.estados.includes(estado));
}

function responsableDeEstado(v: VacanteDoc): Responsable {
  switch (v.estado) {
    case 'borrador':
      return { rol: 'gh', nombre: 'Equipo GH · Maribel' };
    case 'aprobada':
    case 'lista_para_publicar':
    case 'publicada':
    case 'en_proceso':
      return { rol: 'analista', nombre: v.analista_nombre ?? 'pendiente de asignar' };
    case 'terna_enviada':
      return { rol: 'líder', nombre: v.lider_nombre ?? '—' };
    case 'seleccionado':
    case 'en_contratacion':
      return { rol: 'gh', nombre: 'Equipo GH · Maribel' };
    case 'cerrada':
      return { rol: 'apoyo', nombre: 'IT · compras · bodega · contabilidad' };
    case 'desierta':
    case 'cancelada':
    case 'pausada':
      return { rol: 'coordinación', nombre: 'Karen Bonilla' };
    default:
      return { rol: 'coordinación', nombre: 'Karen Bonilla' };
  }
}

interface Props {
  vacante: VacanteDoc;
}

export function VacanteCard({ vacante }: Props) {
  const faseIdx = faseDeEstado(vacante.estado);
  const resp = responsableDeEstado(vacante);
  const creadoEn = vacante.creado_en?.toDate?.() ?? new Date();
  const dias = Math.floor((Date.now() - creadoEn.getTime()) / (1000 * 60 * 60 * 24));
  const relativo = formatDistanceToNow(creadoEn, { locale: es, addSuffix: true });
  const terminada = ['cerrada', 'desierta', 'cancelada'].includes(vacante.estado);
  const progresoPct = faseIdx >= 0 ? Math.round(((faseIdx + 1) / FASES.length) * 100) : 0;
  const faseActiva = faseIdx >= 0 ? FASES[faseIdx] : FASES[0];

  const criticidadBadge: BadgeVariant =
    vacante.criticidad === 'Alta'
      ? 'criticidad-alta'
      : vacante.criticidad === 'Media'
        ? 'criticidad-media'
        : 'criticidad-baja';

  return (
    <Link to={`/vacantes/${vacante.id}`} className="block group">
      <Card interactive elevation="sm" className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-navy-500">
              {vacante.consecutivo || <span className="italic">pendiente</span>}
            </p>
            <h3 className="font-display text-lg font-semibold text-navy-900 truncate group-hover:text-equitel-rojo-700 transition-colors">
              {vacante.cargo_nombre}
            </h3>
          </div>
          <Badge variant={criticidadBadge} size="sm">
            {vacante.criticidad}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-navy-600">
          <Building2 size={12} className="text-navy-400 flex-shrink-0" />
          <span className="truncate">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-1">
            {FASES.map((f, i) => {
              const done = !terminada && faseIdx > i;
              const active = faseIdx === i;
              return (
                <div
                  key={f.clave}
                  className={cn(
                    'h-2 flex-1 rounded-full transition-all',
                    done || active ? f.barraClase : 'bg-navy-100',
                    active && 'animate-pulse-ring',
                  )}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] font-semibold uppercase tracking-wider">
            {FASES.map((f, i) => {
              const active = faseIdx === i;
              const done = !terminada && faseIdx > i;
              return (
                <span
                  key={f.clave}
                  className={cn(
                    'flex-1 text-center',
                    active
                      ? 'text-equitel-rojo-700'
                      : done
                        ? 'text-navy-700'
                        : 'text-navy-300',
                  )}
                >
                  {f.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className={cn('mt-4 rounded-xl p-4', faseActiva.bloqueClase)}>
          <p
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider',
              faseActiva.textoEstadoClase,
            )}
          >
            {faseIdx >= 0 ? `Fase ${faseActiva.clave} · ${faseActiva.label}` : vacante.estado}
          </p>
          <p
            className={cn(
              'text-sm mt-1 font-medium leading-snug',
              faseActiva.textoEstadoClase === 'text-white'
                ? 'text-white'
                : 'text-navy-900',
            )}
          >
            {ESTADO_LABEL[vacante.estado] ?? vacante.estado}
          </p>
          {!terminada && (
            <div className="mt-2 h-1 rounded-full bg-white/40 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all',
                  faseActiva.textoEstadoClase === 'text-white' ? 'bg-white' : faseActiva.barraClase,
                )}
                style={{ width: `${progresoPct}%` }}
              />
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Avatar nombre={resp.nombre} size="sm" color="negro" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-navy-500 font-semibold">
                {resp.rol}
              </p>
              <p className="text-navy-900 font-medium truncate">{resp.nombre}</p>
            </div>
          </div>
          <SemaforoANS dias={dias} etiqueta={`Abierta ${relativo}`} />
        </div>
      </Card>
    </Link>
  );
}
