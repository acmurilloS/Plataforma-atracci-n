import { RefreshCw, Sparkles } from 'lucide-react';
import { useActualizacionDisponible } from '../hooks/useActualizacionDisponible';

/**
 * BannerActualizacion · barra sticky arriba que avisa cuando hay un deploy
 * nuevo. Click "Recargar" hace reload completo. Pensado para que Karen /
 * Alisson / los analistas vean los fixes y nuevas features sin tener que
 * pedirles que limpien caché manual.
 *
 * No oculta nada del Layout (sticky relative al viewport) — empuja el
 * contenido hacia abajo cuando aparece.
 */
export function BannerActualizacion() {
  const { disponible, recargar } = useActualizacionDisponible();

  if (!disponible) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-brand-600 text-white shadow-brand-card"
    >
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles size={15} strokeWidth={1.75} className="shrink-0" />
          <p className="text-[13px] font-medium">
            Hay una nueva versión disponible.{' '}
            <span className="text-white/85 font-normal">
              Recarga la página para ver los últimos cambios.
            </span>
          </p>
        </div>
        <button
          onClick={recargar}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
        >
          <RefreshCw size={12} strokeWidth={2} />
          Recargar ahora
        </button>
      </div>
    </div>
  );
}
