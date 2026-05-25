import { useCallback, useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, FileText, Upload, UploadCloud } from 'lucide-react';
import { useVacantes } from '../../hooks/useVacantes';
import { cn } from '../../utils/cn';

interface Props {
  empresaCodigo: string;
  value?: string;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

/**
 * AvalUploader · sistema brand.
 *
 * Drop zone con border dashed slate + hover brand-300 + estado "arrastrando"
 * con tinte brand-50. Estado cargado muestra card flat con icono FileText
 * dentro de cuadrito brand-50, nombre del archivo y link "Reemplazar".
 */
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

  // Estado: aval cargado correctamente
  if (value && !subiendo) {
    return (
      <div className="rounded-md border border-success-500/20 bg-success-50/40 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <FileText size={20} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} strokeWidth={1.75} className="text-success-700 shrink-0" />
              <p className="text-[13px] font-medium text-text-strong truncate">
                {nombre ?? 'Aval cargado'}
              </p>
            </div>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline underline-offset-2"
            >
              Ver archivo →
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={reemplazar}
          disabled={disabled}
          className="text-[12px] font-medium text-text-muted hover:text-text-strong transition-colors disabled:text-text-subtle shrink-0"
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
        className={cn(
          'flex flex-col items-center justify-center gap-2.5 rounded-md border-2 border-dashed py-10 px-6 text-center cursor-pointer transition-colors duration-200 ease-out',
          arrastrando
            ? 'border-brand-400 bg-brand-50'
            : 'border-slate-300 bg-slate-50/50 hover:border-brand-300 hover:bg-slate-50',
          (disabled || subiendo) && 'pointer-events-none opacity-60',
        )}
      >
        <div
          className={cn(
            'w-12 h-12 rounded-md flex items-center justify-center transition-colors',
            arrastrando ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-text-muted',
          )}
        >
          <UploadCloud size={22} strokeWidth={1.5} />
        </div>
        <p className="text-[14px] font-medium text-text-strong">
          Arrastra el PDF del aval o{' '}
          <span className="text-brand-700 underline underline-offset-2">selecciona un archivo</span>
        </p>
        <p className="text-[11px] text-text-subtle">Solo PDF · máximo 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && manejar(e.target.files[0])}
        />
      </label>
      {subiendo && (
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between text-[12px] mb-2">
            <span className="flex items-center gap-1.5 text-text-body font-medium truncate">
              <Upload size={12} strokeWidth={1.75} className="text-brand-700" />
              {nombre}
            </span>
            <span className="text-text-strong font-bold tabular-nums">{Math.round(progreso)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-200 ease-out"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <p className="mt-3 text-[12px] text-danger-700 bg-danger-50 border border-danger-500/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
