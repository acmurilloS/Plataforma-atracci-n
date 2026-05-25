import { Link } from 'react-router-dom';
import { Building2, Clock3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../utils/cn';
import { Card, Pill, type PillTono } from './brand';
import type { VacanteDoc } from '../schemas';

/**
 * VacanteCard · sistema brand.
 *
 * Card clickable con lift+scale hover (firma del estilo). La progresión
 * por fase (A→F) se mantiene como barra de 6 segmentos por consistencia
 * con el flujograma — recoloreada con tonos brand.
 *
 * El estado actual se comunica con:
 *   1. Pill de criticidad arriba a la derecha.
 *   2. Eyebrow con consecutivo + h3 cargo.
 *   3. Barra 6-fase con etiqueta hairline.
 *   4. Status label legible al final + responsable + tiempo abierta.
 */

interface FaseDef {
  clave: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  label: string;
  estados: string[];
  tono: PillTono;
  barra: string; // bg-* para segmento activo / completado
}

const FASES: FaseDef[] = [
  { clave: 'A', label: 'Inicio', estados: ['borrador', 'aprobada'], tono: 'brand', barra: 'bg-brand-200' },
  { clave: 'B', label: 'Reclutamiento', estados: ['lista_para_publicar', 'publicada'], tono: 'warning', barra: 'bg-warning-500' },
  { clave: 'C', label: 'Selección', estados: ['en_proceso'], tono: 'info', barra: 'bg-info-500' },
  { clave: 'D', label: 'Decisión', estados: ['terna_enviada', 'seleccionado'], tono: 'danger', barra: 'bg-danger-500' },
  { clave: 'E', label: 'Ingreso', estados: ['en_contratacion'], tono: 'success', barra: 'bg-success-500' },
  { clave: 'F', label: 'Vinculación', estados: ['cerrada'], tono: 'neutral', barra: 'bg-slate-700' },
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
  iniciales: string;
}

function faseDeEstado(estado: string): number {
  return FASES.findIndex((f) => f.estados.includes(estado));
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function responsableDeEstado(v: VacanteDoc): Responsable {
  const make = (rol: string, nombre: string): Responsable => ({
    rol,
    nombre,
    iniciales: iniciales(nombre) || '?',
  });
  switch (v.estado) {
    case 'borrador':
      return make('GH', 'Maribel González');
    case 'aprobada':
    case 'lista_para_publicar':
    case 'publicada':
    case 'en_proceso':
      return make('Analista', v.analista_nombre ?? 'Sin asignar');
    case 'terna_enviada':
      return make('Líder', v.lider_nombre ?? '—');
    case 'seleccionado':
    case 'en_contratacion':
      return make('GH', 'Maribel González');
    case 'cerrada':
      return make('Apoyo', 'IT · compras · talentos');
    case 'desierta':
    case 'cancelada':
    case 'pausada':
      return make('Coordinación', 'Karen Bonilla');
    default:
      return make('Coordinación', 'Karen Bonilla');
  }
}

// Semáforo de días abierta con tonos brand semánticos.
function semaforoDias(dias: number): { tono: PillTono; etiqueta: string } {
  if (dias <= 10) return { tono: 'success', etiqueta: 'En meta' };
  if (dias <= 15) return { tono: 'warning', etiqueta: 'Atención' };
  return { tono: 'danger', etiqueta: 'Vencida' };
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
  const faseActiva = faseIdx >= 0 ? FASES[faseIdx] : FASES[0];
  const sem = semaforoDias(dias);

  const criticidadTono: PillTono =
    vacante.criticidad === 'Alta'
      ? 'danger'
      : vacante.criticidad === 'Media'
        ? 'warning'
        : 'success';

  return (
    <Link to={`/vacantes/${vacante.id}`} className="block group">
      <Card clickable padding="md" className="h-full flex flex-col">
        {/* Header: eyebrow + cargo + pill criticidad */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-subtle">
              {vacante.consecutivo || <span className="italic normal-case">pendiente</span>}
            </p>
            <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.012em] text-text-strong truncate group-hover:text-brand-700 transition-colors">
              {vacante.cargo_nombre}
            </h3>
          </div>
          <Pill tono={criticidadTono}>{vacante.criticidad}</Pill>
        </div>

        {/* Empresa / sede / unidad */}
        <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
          <Building2 size={12} strokeWidth={1.5} className="text-text-subtle flex-shrink-0" />
          <span className="truncate">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </span>
        </div>

        {/* Progress 6-fase */}
        <div className="mt-5">
          <div className="flex items-center gap-1">
            {FASES.map((f, i) => {
              const done = !terminada && faseIdx > i;
              const active = faseIdx === i;
              return (
                <div
                  key={f.clave}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-all',
                    done || active ? f.barra : 'bg-slate-100',
                  )}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[9px] font-bold uppercase tracking-[0.08em]">
            {FASES.map((f, i) => {
              const active = faseIdx === i;
              const done = !terminada && faseIdx > i;
              return (
                <span
                  key={f.clave}
                  className={cn(
                    'flex-1 text-center',
                    active
                      ? 'text-brand-700'
                      : done
                        ? 'text-text-strong'
                        : 'text-slate-300',
                  )}
                >
                  {f.clave}
                </span>
              );
            })}
          </div>
        </div>

        {/* Estado actual (texto legible) */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                faseActiva.tono === 'brand' && 'bg-brand-500',
                faseActiva.tono === 'warning' && 'bg-warning-500',
                faseActiva.tono === 'info' && 'bg-info-500',
                faseActiva.tono === 'danger' && 'bg-danger-500',
                faseActiva.tono === 'success' && 'bg-success-500',
                faseActiva.tono === 'neutral' && 'bg-slate-500',
              )}
            />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Fase {faseActiva.clave} · {faseActiva.label}
            </p>
          </div>
          <p className="text-[13px] font-medium text-text-strong leading-snug">
            {ESTADO_LABEL[vacante.estado] ?? vacante.estado}
          </p>
        </div>

        {/* Footer: responsable + semáforo días */}
        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-[11px] font-semibold text-text-strong">
              {resp.iniciales}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.10em] text-text-subtle font-bold">
                {resp.rol}
              </p>
              <p className="text-[12px] text-text-body font-medium truncate">{resp.nombre}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-[10px] text-text-subtle">
              <Clock3 size={10} strokeWidth={1.5} />
              <span className="tabular-nums">{relativo}</span>
            </div>
            {!terminada && (
              <Pill tono={sem.tono} className="mt-1 !text-[9px] !py-0 !px-1.5">
                {sem.etiqueta} · {dias}d
              </Pill>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
