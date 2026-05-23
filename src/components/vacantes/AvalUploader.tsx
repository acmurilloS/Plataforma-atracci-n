import { useCallback, useRef, useState, type DragEvent } from 'react';
import { useVacantes } from '../../hooks/useVacantes';

interface Props {
  empresaCodigo: string;
  value?: string;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function AvalUploader({ empresaCodigo, value, onChange, disabled }: Props) {
  const { subirAval } = useVacantes();
  const [arrastrando, setArrastrando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const manejar = useCallback(
    async (file: File) => {
      if (!empresaCodigo) {
        setError('Selecciona una empresa antes de adjuntar el aval.');
        return;
      }
      setError(null);
      setSubiendo(true);
      setProgreso(0);
      setNombre(file.name);
      try {
        const url = await subirAval(file, empresaCodigo, setProgreso);
        onChange(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No pudimos subir el aval.');
        setNombre(null);
        onChange(null);
      } finally {
        setSubiendo(false);
      }
    },
    [empresaCodigo, onChange, subirAval],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setArrastrando(false);
      if (disabled || subiendo) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void manejar(file);
    },
    [disabled, subiendo, manejar],
  );

  function reemplazar() {
    onChange(null);
    setNombre(null);
    setProgreso(0);
    inputRef.current?.click();
  }

  if (value && !subiendo) {
    return (
      <div className="rounded-lg border border-navy-100 bg-cream-100 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-navy-700 text-white flex items-center justify-center text-xs font-semibold">
            PDF
          </div>
          <div>
            <p className="text-sm font-medium text-navy-900">{nombre ?? 'Aval cargado'}</p>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-gold-700 hover:underline"
            >
              Ver archivo
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={reemplazar}
          disabled={disabled}
          className="text-sm font-medium text-navy-700 hover:text-navy-900 disabled:text-navy-300"
        >
          Reemplazar
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && manejar(e.target.files[0])}
        />
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !subiendo) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={[
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition',
          arrastrando
            ? 'border-gold-500 bg-gold-50'
            : 'border-navy-200 bg-cream-100 hover:border-navy-400',
          disabled || subiendo ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <svg className="h-10 w-10 text-navy-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0l-3 3m3-3l3 3m5 9v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
          />
        </svg>
        <p className="text-sm font-medium text-navy-800">
          Arrastra el PDF del aval o{' '}
          <span className="text-gold-700 underline">selecciona un archivo</span>
        </p>
        <p className="text-xs text-navy-500">Solo PDF, máximo 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && manejar(e.target.files[0])}
        />
      </label>
      {subiendo && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-navy-600 mb-1">
            <span>{nombre}</span>
            <span>{Math.round(progreso)}%</span>
          </div>
          <div className="h-2 rounded bg-navy-100 overflow-hidden">
            <div
              className="h-full bg-gold-500 transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
