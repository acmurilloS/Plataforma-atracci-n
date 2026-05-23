import { Clock } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SemaforoANSProps {
  dias: number;
  umbralAmbar?: number;
  umbralCritico?: number;
  mostrarIcono?: boolean;
  className?: string;
  /** Texto extra, por ejemplo "hace N días" */
  etiqueta?: string;
}

export function SemaforoANS({
  dias,
  umbralAmbar = 7,
  umbralCritico = 10,
  mostrarIcono = true,
  className,
  etiqueta,
}: SemaforoANSProps) {
  const estado: 'ok' | 'warn' | 'crit' =
    dias > umbralCritico ? 'crit' : dias > umbralAmbar ? 'warn' : 'ok';

  const colores: Record<typeof estado, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border border-amber-200',
    crit: 'bg-red-50 text-red-700 border border-red-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        colores[estado],
        className,
      )}
      title={etiqueta}
    >
      {mostrarIcono && <Clock size={10} />}
      <span>{dias}d</span>
    </span>
  );
}
