import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { formatearCOP, soloDigitos } from '../../utils/moneda';
import { cn } from '../../utils/cn';

interface Props {
  value: number | '';
  onChange: (v: number | '') => void;
  bandaMin: number | null;
  bandaMax: number | null;
  error?: string;
  disabled?: boolean;
}

/**
 * ValidadorSalario · sistema brand.
 *
 * Input sunken con borde semántico según validación contra banda del cargo:
 * verde si está en banda, ámbar si está fuera, azul si no hay banda.
 * Hint informativo debajo con tono que matchea el estado.
 */
export function ValidadorSalario({
  value,
  onChange,
  bandaMin,
  bandaMax,
  error,
  disabled,
}: Props) {
  const tieneBanda = bandaMin != null && bandaMax != null;
  const display = value === '' ? '' : formatearCOP(value);
  const enBanda =
    tieneBanda &&
    typeof value === 'number' &&
    value >= (bandaMin as number) &&
    value <= (bandaMax as number);
  const fueraBanda = tieneBanda && typeof value === 'number' && !enBanda && value > 0;
  const sinBanda = !tieneBanda && typeof value === 'number' && value > 0;

  function onInput(raw: string) {
    const d = soloDigitos(raw);
    onChange(d.length === 0 ? '' : Number(d));
  }

  const borderClass = error
    ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/30'
    : enBanda
      ? 'border-success-500 focus:border-success-500 focus:ring-success-500/30'
      : fueraBanda
        ? 'border-warning-500 focus:border-warning-500 focus:ring-warning-500/30'
        : sinBanda
          ? 'border-info-500 focus:border-info-500 focus:ring-info-500/30'
          : 'border-slate-200 focus:border-brand-400 focus:ring-brand-300/40';

  return (
    <div>
      <div className="relative">
        <input
          inputMode="numeric"
          value={display}
          disabled={disabled}
          onChange={(e) => onInput(e.target.value)}
          placeholder="COP 0"
          className={cn(
            'w-full rounded-brand-input bg-slate-50 px-3.5 py-2.5 text-[15px] font-medium text-text-strong tabular-nums',
            'pr-11 border transition-colors duration-150 ease-out',
            'focus:bg-white focus:outline-none focus:ring-2',
            borderClass,
            disabled && 'opacity-60',
          )}
        />
        {enBanda && (
          <CheckCircle2
            size={18}
            strokeWidth={1.75}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-success-600"
          />
        )}
        {fueraBanda && (
          <AlertTriangle
            size={18}
            strokeWidth={1.75}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-warning-600"
          />
        )}
        {sinBanda && (
          <Info
            size={18}
            strokeWidth={1.75}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-info-600"
          />
        )}
      </div>

      {tieneBanda && (
        <p className="mt-2 text-[11px] text-text-muted">
          <span className="font-semibold text-text-body">Banda sugerida:</span>{' '}
          <span className="tabular-nums">
            {formatearCOP(bandaMin as number)} – {formatearCOP(bandaMax as number)}
          </span>
        </p>
      )}

      {enBanda && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-success-700">
          <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
          En banda
        </div>
      )}

      {fueraBanda && (
        <p className="mt-2 text-[11px] text-warning-700 leading-relaxed">
          ⚠ Fuera de banda. La solicitud quedará marcada para validación de
          Gestión Humana antes de avanzar.
        </p>
      )}

      {sinBanda && (
        <p className="mt-2 text-[11px] text-info-700 leading-relaxed">
          ℹ Este cargo aún no tiene banda salarial formalizada. La vacante
          avanza con marca para revisión paralela de Gestión Humana.
        </p>
      )}

      {error && <p className="mt-2 text-[11px] text-danger-700">{error}</p>}
    </div>
  );
}
