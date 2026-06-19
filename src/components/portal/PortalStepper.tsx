import { Check } from 'lucide-react';
import { FASES_PORTAL, indiceFase, type ClaveFase } from '../../portal/faseProceso';

/**
 * PortalStepper · F2 · línea de tiempo humana del proceso para el candidato.
 *
 * Recibe la `fase` ya colapsada por el backend (NUNCA el estado técnico) y
 * muestra las 6 fases amables con la etiqueta + el tiempo esperado de la fase
 * actual. Es propio del portal (no reusa el FlujogramaTimeline del staff).
 * Mobile-first, vertical.
 */
export function PortalStepper({ fase }: { fase: ClaveFase | 'finalizado' | string }) {
  const actualIdx = fase === 'finalizado' ? FASES_PORTAL.length : indiceFase(fase as ClaveFase);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
          ¿En qué va tu proceso?
        </h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          Estas son las etapas de tu proceso. Aquí verás reflejado cada avance.
        </p>
      </div>
      <ol className="px-5 sm:px-7 py-5">
        {FASES_PORTAL.map((f, i) => {
          const done = i < actualIdx;
          const current = i === actualIdx;
          const last = i === FASES_PORTAL.length - 1;
          return (
            <li key={f.clave} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
                    done
                      ? 'bg-success-600 text-white'
                      : current
                        ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                        : 'bg-slate-100 text-text-subtle',
                  ].join(' ')}
                >
                  {done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                </span>
                {!last && (
                  <span
                    className={`w-px flex-1 my-1 ${done ? 'bg-success-500/50' : 'bg-slate-200'}`}
                    style={{ minHeight: current ? 34 : 22 }}
                  />
                )}
              </div>
              <div className={last ? 'pb-0' : 'pb-5'}>
                <p
                  className={[
                    'text-[14px] tracking-[-0.01em]',
                    current
                      ? 'font-semibold text-text-strong'
                      : done
                        ? 'font-medium text-text-body'
                        : 'font-medium text-text-subtle',
                  ].join(' ')}
                >
                  {f.etiqueta}
                </p>
                {current && (
                  <>
                    <p className="text-[12.5px] text-text-muted mt-0.5 leading-[1.5]">
                      {f.descripcion}
                    </p>
                    {f.dias_esperados && (
                      <p className="text-[11.5px] text-brand-700 mt-1 font-medium">
                        ⏱ {f.dias_esperados}
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
