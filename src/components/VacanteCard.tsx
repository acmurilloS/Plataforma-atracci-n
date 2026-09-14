import { Link } from 'react-router-dom';
import { Building2, Clock3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../utils/cn';
import { Card, Pill, type PillTono } from './brand';
import { EliminarVacanteAdmin } from './vacantes/EliminarVacanteAdmin';
import {
  aperturaVacante,
  diasTranscurridos,
  FASES_TARJETA,
  faseTarjeta,
  type LetraFase,
} from '../utils/reportesVacantes';
import { diasHabilesEntre } from '../utils/fechas';
import type { ResumenVacanteDoc, VacanteDoc } from '../schemas';

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
 *
 * La fase, el texto y el responsable salen de `faseTarjeta`: la fase REAL, la
 * más avanzada entre el estado de la vacante y sus candidatos en curso
 * (`resumen`, de `vacantes_resumen`). El estado se queda atrás cuando la
 * analista avanza candidatos desde la lista (BUG B, 10-sep): entonces el texto
 * habla de los candidatos y el estado de la vacante va debajo, en pequeño.
 */

// Color de cada fase (su nombre y su cálculo viven en `faseTarjeta`).
const COLOR_FASE: Record<LetraFase, { tono: PillTono; barra: string }> = {
  A: { tono: 'brand', barra: 'bg-brand-200' },
  B: { tono: 'warning', barra: 'bg-warning-500' },
  C: { tono: 'info', barra: 'bg-info-500' },
  D: { tono: 'danger', barra: 'bg-danger-500' },
  E: { tono: 'success', barra: 'bg-success-500' },
  F: { tono: 'neutral', barra: 'bg-slate-700' },
};

const PUNTO_TONO: Record<PillTono, string> = {
  brand: 'bg-brand-500',
  warning: 'bg-warning-500',
  info: 'bg-info-500',
  danger: 'bg-danger-500',
  success: 'bg-success-500',
  neutral: 'bg-slate-500',
};

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Semáforo de días abierta con tonos brand semánticos.
function semaforoDias(dias: number): { tono: PillTono; etiqueta: string } {
  if (dias <= 10) return { tono: 'success', etiqueta: 'En meta' };
  if (dias <= 15) return { tono: 'warning', etiqueta: 'Atención' };
  return { tono: 'danger', etiqueta: 'Vencida' };
}

interface Props {
  vacante: VacanteDoc;
  /** Set de festivos (ISO) para contar en DÍAS HÁBILES, igual que el dashboard. */
  festivos: Set<string>;
  /**
   * Candidatos en curso de la vacante (`useResumenesVacantes`). Sin él la fase
   * sale solo del estado de la vacante, como antes.
   */
  resumen?: ResumenVacanteDoc | null;
}

export function VacanteCard({ vacante, festivos, resumen }: Props) {
  const fase = faseTarjeta(vacante, resumen);
  const faseIdx = fase.letra ? FASES_TARJETA.findIndex((f) => f.letra === fase.letra) : -1;
  const resp = fase.responsable;
  // Apertura efectiva (fecha_activacion de procesos migrados, si existe).
  const creadoEn = aperturaVacante(vacante) ?? new Date();
  // Días HÁBILES desde la apertura (excluye sábados, domingos y festivos), igual
  // que el dashboard y los Excel — antes contaba días calendario y no cuadraba
  // (reu Karen 19-ago). Respeta la fecha de cierre si la vacante ya cerró.
  const dias = diasTranscurridos(vacante, festivos, new Date()) ?? 0;
  const relativo = formatDistanceToNow(creadoEn, { locale: es, addSuffix: true });
  const terminada = fase.terminada;
  // Suspendidas y terminadas sin fase van en gris: no avanzan.
  const tonoFase: PillTono =
    fase.letra && !fase.suspendida ? COLOR_FASE[fase.letra].tono : 'neutral';
  const sem = semaforoDias(dias);
  // Duración del proceso (apertura → cierre) para las vacantes cerradas, también
  // en días hábiles para que cuadre con el semáforo y el dashboard.
  const cerradaEn = vacante.cerrada_en?.toDate?.() ?? null;
  const diasProceso = terminada && cerradaEn ? diasHabilesEntre(creadoEn, cerradaEn, festivos) : null;

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
          <div className="flex items-center gap-1 shrink-0">
            <Pill tono={criticidadTono}>{vacante.criticidad}</Pill>
            {vacante.es_movimiento_interno && (
              <Pill tono="info">
                ↔ Mov. interno{vacante.tipo_movimiento ? ` · ${vacante.tipo_movimiento}` : ''}
              </Pill>
            )}
            <EliminarVacanteAdmin vacante={vacante} />
          </div>
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
            {FASES_TARJETA.map((f, i) => {
              const done = !terminada && faseIdx > i;
              const active = faseIdx === i;
              return (
                <div
                  key={f.letra}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-all',
                    done || active ? COLOR_FASE[f.letra].barra : 'bg-slate-100',
                  )}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[9px] font-bold uppercase tracking-[0.08em]">
            {FASES_TARJETA.map((f, i) => {
              const active = faseIdx === i;
              const done = !terminada && faseIdx > i;
              return (
                <span
                  key={f.letra}
                  className={cn(
                    'flex-1 text-center',
                    active
                      ? 'text-brand-700'
                      : done
                        ? 'text-text-strong'
                        : 'text-slate-300',
                  )}
                >
                  {f.letra}
                </span>
              );
            })}
          </div>
        </div>

        {/* Estado actual (texto legible) */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', PUNTO_TONO[tonoFase])} />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              {fase.letra ? `Fase ${fase.letra} · ${fase.etiquetaFase}` : fase.etiquetaFase}
            </p>
          </div>
          <p className="text-[13px] font-medium text-text-strong leading-snug">{fase.texto}</p>
          {/* Estado de la vacante cuando los candidatos van por delante. */}
          {fase.secundario && (
            <p className="mt-0.5 text-[11px] text-text-muted leading-snug">{fase.secundario}</p>
          )}
        </div>

        {/* Footer: responsable + semáforo días */}
        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-[11px] font-semibold text-text-strong">
              {iniciales(resp.nombre) || '?'}
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
            {!terminada ? (
              <Pill tono={sem.tono} className="mt-1 !text-[9px] !py-0 !px-1.5">
                {sem.etiqueta} · {dias}d
              </Pill>
            ) : diasProceso !== null ? (
              <Pill tono="neutral" className="mt-1 !text-[9px] !py-0 !px-1.5">
                {diasProceso === 0
                  ? 'Cerrada el mismo día'
                  : `Duró ${diasProceso} ${diasProceso === 1 ? 'día hábil' : 'días hábiles'}`}
              </Pill>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}
