import { formatearCOP, soloDigitos } from '../../utils/moneda';

interface Props {
  value: number | '';
  onChange: (v: number | '') => void;
  bandaMin: number | null;
  bandaMax: number | null;
  error?: string;
  disabled?: boolean;
}

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

  return (
    <div>
      <div className="relative">
        <input
          inputMode="numeric"
          value={display}
          disabled={disabled}
          onChange={(e) => onInput(e.target.value)}
          placeholder="COP 0"
          className={[
            'w-full rounded-md border px-3 py-2 text-sm pr-10 bg-white',
            error
              ? 'border-red-400'
              : enBanda
                ? 'border-emerald-500'
                : fueraBanda
                  ? 'border-amber-500'
                  : sinBanda
                    ? 'border-blue-300'
                    : 'border-navy-200',
            disabled ? 'opacity-60' : '',
          ].join(' ')}
        />
        {enBanda && (
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {fueraBanda && (
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-amber-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        )}
      </div>
      {tieneBanda && (
        <p className="mt-1 text-xs text-navy-500">
          Banda sugerida: {formatearCOP(bandaMin as number)} – {formatearCOP(bandaMax as number)}
        </p>
      )}
      {fueraBanda && (
        <p className="mt-1 text-xs text-amber-700">
          Este salario está fuera de banda, será revisado por Gestión Humana.
        </p>
      )}
      {sinBanda && (
        <p className="mt-1 text-xs text-blue-700">
          Este cargo aún no tiene banda salarial formalizada. La vacante avanza con marca para
          revisión paralela de Gestión Humana.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
