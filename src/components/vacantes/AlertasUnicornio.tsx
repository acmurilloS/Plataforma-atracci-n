import { AlertTriangle, Info, Sparkles } from 'lucide-react';
import type { AlertaUnicornio, SeveridadAlerta } from '../../utils/validadorPerfilUnicornio';
import { resumirAlertas } from '../../utils/validadorPerfilUnicornio';
import { cn } from '../../utils/cn';

interface Props {
  alertas: AlertaUnicornio[];
  analisisIA?: {
    diagnostico: string;
    alertas_adicionales: string[];
    recomendacion_global: string;
    cargando?: boolean;
  } | null;
}

const ESTILOS: Record<
  SeveridadAlerta,
  { caja: string; titulo: string; icono: string }
> = {
  unicornio: {
    caja: 'border-danger-500/30 bg-danger-50',
    titulo: 'text-danger-700',
    icono: 'text-danger-700',
  },
  advertencia: {
    caja: 'border-warning-500/30 bg-warning-50/60',
    titulo: 'text-warning-700',
    icono: 'text-warning-700',
  },
  info: {
    caja: 'border-slate-200 bg-slate-50/60',
    titulo: 'text-text-strong',
    icono: 'text-text-muted',
  },
};

export function AlertasUnicornio({ alertas, analisisIA }: Props) {
  const resumen = resumirAlertas(alertas);

  if (resumen.total === 0 && !analisisIA) return null;

  return (
    <div className="space-y-3">
      {resumen.total > 0 && (
        <div
          className={cn(
            'rounded-md border p-4',
            resumen.unicornio > 0
              ? 'border-danger-500/30 bg-danger-50'
              : resumen.advertencia > 0
                ? 'border-warning-500/30 bg-warning-50/60'
                : 'border-slate-200 bg-slate-50/60',
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              strokeWidth={1.75}
              className={cn(
                'mt-0.5 shrink-0',
                resumen.unicornio > 0
                  ? 'text-danger-700'
                  : resumen.advertencia > 0
                    ? 'text-warning-700'
                    : 'text-text-muted',
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text-strong">
                {resumen.unicornio > 0
                  ? `Estás buscando ${resumen.unicornio} unicornio${
                      resumen.unicornio > 1 ? 's' : ''
                    }`
                  : resumen.advertencia > 0
                    ? `Hay ${resumen.advertencia} inconsistencia${
                        resumen.advertencia > 1 ? 's' : ''
                      } en el perfil`
                    : 'Observaciones'}
              </p>
              <p className="text-[12px] text-text-muted mt-0.5 leading-[1.5]">
                Revisa lo que pide el líder vs lo que ofrece la vacante antes de publicar. Cada
                alerta abajo tiene una sugerencia de ajuste.
              </p>
            </div>
          </div>
        </div>
      )}

      {alertas.map((a) => {
        const e = ESTILOS[a.severidad];
        return (
          <div key={a.id} className={cn('rounded-md border p-3.5', e.caja)}>
            <div className="flex items-start gap-2.5">
              {a.severidad === 'info' ? (
                <Info size={14} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', e.icono)} />
              ) : (
                <AlertTriangle
                  size={14}
                  strokeWidth={1.75}
                  className={cn('mt-0.5 shrink-0', e.icono)}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn('text-[13px] font-semibold', e.titulo)}>{a.titulo}</p>
                <p className="text-[12px] text-text-body mt-0.5 leading-[1.5]">{a.mensaje}</p>
                {a.sugerencia && (
                  <p className="text-[12px] text-text-muted mt-1.5 italic leading-[1.5]">
                    → {a.sugerencia}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {analisisIA && (
        <div className="rounded-md border border-brand-200 bg-gradient-to-br from-brand-50/40 to-white p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
              <Sparkles size={14} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text-strong">Análisis IA del perfil</p>
              {analisisIA.cargando ? (
                <p className="text-[12px] text-text-muted mt-1 italic">Analizando con Gemini…</p>
              ) : (
                <>
                  <p className="text-[12px] text-text-body mt-1 leading-[1.55]">
                    {analisisIA.diagnostico}
                  </p>
                  {analisisIA.alertas_adicionales.length > 0 && (
                    <ul className="text-[12px] text-text-body mt-2 space-y-1 leading-[1.5]">
                      {analisisIA.alertas_adicionales.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-text-subtle mt-1.5 shrink-0" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[12px] text-brand-700 mt-2 italic font-medium border-l-2 border-brand-400 pl-2.5">
                    → {analisisIA.recomendacion_global}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
