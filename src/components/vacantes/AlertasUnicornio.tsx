import { AlertTriangle, Info, Sparkles } from 'lucide-react';
import type { AlertaUnicornio, SeveridadAlerta } from '../../utils/validadorPerfilUnicornio';
import { resumirAlertas } from '../../utils/validadorPerfilUnicornio';

interface Props {
  alertas: AlertaUnicornio[];
  analisisIA?: {
    diagnostico: string;
    alertas_adicionales: string[];
    recomendacion_global: string;
    cargando?: boolean;
  } | null;
}

const ESTILOS: Record<SeveridadAlerta, { caja: string; titulo: string; icono: string }> = {
  unicornio: {
    caja: 'border-red-300 bg-red-50',
    titulo: 'text-red-800',
    icono: 'text-red-600',
  },
  advertencia: {
    caja: 'border-amber-300 bg-amber-50',
    titulo: 'text-amber-800',
    icono: 'text-amber-600',
  },
  info: {
    caja: 'border-navy-200 bg-cream-50',
    titulo: 'text-navy-800',
    icono: 'text-navy-500',
  },
};

export function AlertasUnicornio({ alertas, analisisIA }: Props) {
  const resumen = resumirAlertas(alertas);

  if (resumen.total === 0 && !analisisIA) return null;

  return (
    <div className="space-y-3">
      {resumen.total > 0 && (
        <div
          className={`rounded-xl border p-4 ${
            resumen.unicornio > 0
              ? 'border-red-300 bg-red-50'
              : resumen.advertencia > 0
                ? 'border-amber-300 bg-amber-50'
                : 'border-navy-200 bg-cream-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              className={
                resumen.unicornio > 0
                  ? 'text-red-700'
                  : resumen.advertencia > 0
                    ? 'text-amber-700'
                    : 'text-navy-600'
              }
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy-900">
                {resumen.unicornio > 0
                  ? `Estás buscando ${resumen.unicornio} unicornio${resumen.unicornio > 1 ? 's' : ''}`
                  : resumen.advertencia > 0
                    ? `Hay ${resumen.advertencia} inconsistencia${resumen.advertencia > 1 ? 's' : ''} en el perfil`
                    : 'Observaciones'}
              </p>
              <p className="text-xs text-navy-600 mt-1">
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
          <div key={a.id} className={`rounded-lg border p-3 ${e.caja}`}>
            <div className="flex items-start gap-2">
              {a.severidad === 'info' ? (
                <Info size={16} className={`mt-0.5 ${e.icono}`} />
              ) : (
                <AlertTriangle size={16} className={`mt-0.5 ${e.icono}`} />
              )}
              <div className="flex-1">
                <p className={`text-sm font-semibold ${e.titulo}`}>{a.titulo}</p>
                <p className="text-xs text-navy-700 mt-1">{a.mensaje}</p>
                {a.sugerencia && (
                  <p className="text-xs text-navy-600 mt-2 italic">→ {a.sugerencia}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {analisisIA && (
        <div className="rounded-xl border border-equitel-rojo-200 bg-gradient-to-br from-cream-50 to-equitel-rojo-50/40 p-4">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="text-equitel-rojo-700 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy-900">Análisis IA del perfil</p>
              {analisisIA.cargando ? (
                <p className="text-xs text-navy-600 mt-1 italic">Analizando con Gemini…</p>
              ) : (
                <>
                  <p className="text-xs text-navy-700 mt-1">{analisisIA.diagnostico}</p>
                  {analisisIA.alertas_adicionales.length > 0 && (
                    <ul className="text-xs text-navy-700 mt-2 space-y-1 list-disc list-inside">
                      {analisisIA.alertas_adicionales.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-navy-800 mt-2 italic font-medium">
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
