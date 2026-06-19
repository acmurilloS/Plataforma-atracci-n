import { CheckCircle2 } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import { formatearFecha } from '../../utils/fechas';

/**
 * FirmaDigitalBanner · muestra al staff la firma digital que el candidato hizo en
 * el portal (imagen de la firma + fecha + enlace a la constancia PDF). Se alimenta
 * de los campos `firma_*` de la postulación. Si no hay firma, no renderiza nada.
 */
export function FirmaDigitalBanner({
  titulo,
  imagenUrl,
  fecha,
  pdfUrl,
}: {
  titulo?: string;
  imagenUrl?: string | null;
  fecha?: Timestamp | null;
  pdfUrl?: string | null;
}) {
  if (!imagenUrl && !fecha) return null;
  const f = fecha?.toDate ? formatearFecha(fecha.toDate()) : '';
  return (
    <div className="rounded-md border border-success-500/25 bg-success-50/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
        <CheckCircle2 size={13} strokeWidth={1.75} />
        {titulo ? `${titulo} — ` : ''}Firmado digitalmente por el integrante{f ? ` el ${f}` : ''}
      </div>
      {imagenUrl && (
        <img
          src={imagenUrl}
          alt="Firma del integrante"
          className="mt-2 max-h-24 object-contain bg-white rounded border border-slate-200 p-1"
        />
      )}
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[11px] text-brand-700 underline hover:text-brand-800"
        >
          Ver constancia firmada (PDF)
        </a>
      )}
    </div>
  );
}
