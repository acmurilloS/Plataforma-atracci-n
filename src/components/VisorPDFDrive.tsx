import { useState } from 'react';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface Props {
  /** ID del archivo en Google Drive (no la URL completa). */
  fileId: string | null | undefined;
  /** Link completo a abrir en nueva pestaña. Opcional. */
  webViewLink?: string | null;
  /** Nombre legible del archivo para el header. */
  titulo?: string;
  /** Altura del iframe. Default 600px. */
  altura?: number;
  className?: string;
}

/**
 * VisorPDFDrive · iframe embed del viewer oficial de Google Drive.
 *
 * Funciona sin descargar el PDF — el usuario lo ve dentro de la app.
 * El iframe usa el URL pattern `https://drive.google.com/file/d/{id}/preview`
 * que respeta los permisos de la Shared Drive (solo usuarios con acceso
 * verán el archivo; cualquier otro recibe "Necesitas permisos").
 *
 * Para que cualquier usuario autenticado de la plataforma vea los PDFs,
 * los archivos deben estar en una Shared Drive con suficiente alcance, o
 * compartidos individualmente "con cualquiera con el link" (configurable
 * por archivo desde la Cloud Function al subir).
 */
export function VisorPDFDrive({
  fileId,
  webViewLink,
  titulo,
  altura = 600,
  className,
}: Props) {
  const [cargando, setCargando] = useState(true);

  if (!fileId) {
    return (
      <div
        className={cn(
          'rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center',
          className,
        )}
      >
        <FileText size={28} strokeWidth={1.5} className="text-text-subtle mx-auto mb-2" />
        <p className="text-[13px] text-text-muted">Sin archivo cargado todavía.</p>
      </div>
    );
  }

  const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
  const enlaceExterno = webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;

  return (
    <div
      className={cn(
        'rounded-md border border-slate-200 bg-white overflow-hidden shadow-brand-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={13} strokeWidth={1.5} className="text-brand-700 shrink-0" />
          <p className="text-[12px] font-medium text-text-strong truncate">
            {titulo ?? 'Vista previa del documento'}
          </p>
        </div>
        <a
          href={enlaceExterno}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 hover:underline whitespace-nowrap"
        >
          <ExternalLink size={11} strokeWidth={1.75} />
          Abrir en Drive
        </a>
      </div>
      <div className="relative" style={{ height: altura }}>
        {cargando && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-text-muted text-[12px] bg-white">
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
            Cargando vista previa…
          </div>
        )}
        <iframe
          src={embedUrl}
          title={titulo ?? 'Preview Drive'}
          className="w-full h-full"
          allow="autoplay"
          onLoad={() => setCargando(false)}
        />
      </div>
    </div>
  );
}
