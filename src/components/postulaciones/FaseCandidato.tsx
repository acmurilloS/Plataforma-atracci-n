import { FASES_PORTAL, faseDeEstado } from '../../portal/faseProceso';
import type { EstadoPostulacion } from '../../schemas';
import { Pill, type PillTono } from '../brand';
import { cn } from '../../utils/cn';

/**
 * FaseCandidato · vista de la fase del proceso por CANDIDATO (BUG 1, 2026-06-24).
 *
 * El `FlujogramaTimeline` muestra el avance de la VACANTE; esta vista muestra
 * en qué fase va CADA candidato, leído de `postulacion.estado` (la fuente de
 * verdad que sí cambia en cada transición). Así "en exámenes médicos" o
 * "contratado/finalizado" siempre se reflejan, sin quedarse en blanco.
 *
 * Reusa el mapeo de `src/portal/faseProceso.ts` (los 18 estados → 6 fases).
 */

/** Etiqueta legible del estado técnico para el staff (los 18 estados). */
const ESTADO_LABEL: Record<EstadoPostulacion, string> = {
  sourceado_por_ia: 'Sourceado por IA',
  postulado: 'Postulado',
  pre_entrevistado_pendiente: 'Pre-entrevista pendiente',
  pre_entrevistado_ok: 'Pre-entrevistado',
  pre_entrevistado_no_interesado: 'No interesado',
  filtrado_no_cumple: 'Filtrado (no cumple)',
  pruebas_enviadas: 'Pruebas enviadas',
  pruebas_completadas: 'Pruebas completadas',
  entrevistado_analista: 'Entrevistado (analista)',
  referencias_validadas: 'Referencias validadas',
  en_terna: 'En terna',
  seleccionado_por_lider: 'Seleccionado por líder',
  descartado_por_lider: 'Descartado por líder',
  en_examenes_medicos: 'En exámenes médicos',
  descartado_examenes_medicos: 'No apto (exámenes médicos)',
  en_contratacion: 'En contratación',
  contratado: 'Contratado',
  desistio_candidato: 'Desistió',
};

const DESCARTES = new Set<string>([
  'filtrado_no_cumple',
  'pre_entrevistado_no_interesado',
  'descartado_por_lider',
  'descartado_examenes_medicos',
]);

/** Etiqueta legible del estado técnico (reutilizable en otras pantallas). */
export function etiquetaEstado(estado: string): string {
  return ESTADO_LABEL[estado as EstadoPostulacion] ?? estado.replace(/_/g, ' ');
}

function tonoEstado(estado: string): PillTono {
  if (estado === 'contratado') return 'success';
  if (DESCARTES.has(estado)) return 'danger';
  if (estado === 'desistio_candidato') return 'neutral';
  return 'info';
}

interface Props {
  estado: string;
  /** `mini` = pill + N/6 (para listas); `full` = stepper de 6 fases (para detalle). */
  variante?: 'mini' | 'full';
  className?: string;
}

export function FaseCandidato({ estado, variante = 'mini', className }: Props) {
  const fase = faseDeEstado(estado);
  const finalizado = fase === 'finalizado';
  const esExito = estado === 'contratado'; // proceso culminado: todo verde
  const idx = finalizado ? -1 : FASES_PORTAL.findIndex((f) => f.clave === fase);

  if (variante === 'mini') {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <Pill tono={tonoEstado(estado)} dot>
          {etiquetaEstado(estado)}
        </Pill>
        {!finalizado && idx >= 0 && (
          <span className="text-[10px] text-text-subtle tabular-nums">
            {idx + 1}/{FASES_PORTAL.length}
          </span>
        )}
      </span>
    );
  }

  // full · stepper de 6 fases
  return (
    <div className={cn('w-full max-w-xl', className)}>
      <div className="flex items-stretch gap-1.5">
        {FASES_PORTAL.map((f, i) => {
          const completada = !finalizado && (i < idx || (esExito && i === idx));
          const actual = !finalizado && i === idx && !esExito;
          return (
            <div key={f.clave} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-full h-1.5 rounded-full transition-colors',
                  completada
                    ? 'bg-success-500'
                    : actual
                      ? 'bg-brand-600'
                      : 'bg-slate-200',
                )}
              />
              <span
                className={cn(
                  'text-[9px] uppercase tracking-[0.04em] text-center leading-tight',
                  actual
                    ? 'text-brand-700 font-bold'
                    : completada
                      ? 'text-success-700'
                      : 'text-text-subtle',
                )}
              >
                {f.etiqueta}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12px]">
        <span className="text-text-muted">Fase actual:</span>{' '}
        <span className="font-semibold text-text-strong">{etiquetaEstado(estado)}</span>
        {finalizado && <span className="text-text-subtle"> · proceso finalizado</span>}
      </p>
    </div>
  );
}
