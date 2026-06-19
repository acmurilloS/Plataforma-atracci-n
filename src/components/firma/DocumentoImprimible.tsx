import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import { EquitelLogo } from '../EquitelLogo';
import { Button } from '../brand';
import { formatearFecha } from '../../utils/fechas';

/**
 * DocumentoImprimible · hoja oficial imprimible "todo en uno": el formulario
 * lleno (secciones → campos label/valor) + la firma digital del candidato
 * incrustada al final. Reutilizable para DGH-F-05 (datos básicos) y F-CAR-01
 * (SAGRILAFT). Botón "Imprimir / Guardar PDF" usa window.print().
 */

export interface CampoImprimible {
  label: string;
  valor: string;
}
export interface SeccionImprimible {
  titulo: string;
  campos: CampoImprimible[];
}

export function DocumentoImprimible({
  volverA,
  titulo,
  subtitulo,
  empresaNombre,
  empresaNit,
  secciones,
  firmaImagenUrl,
  firmaFecha,
  firmaPdfUrl,
  nombreFirmante,
  documentoFirmante,
}: {
  volverA: string;
  titulo: string;
  subtitulo?: string;
  empresaNombre: string;
  empresaNit?: string;
  secciones: SeccionImprimible[];
  firmaImagenUrl?: string | null;
  firmaFecha?: Timestamp | null;
  firmaPdfUrl?: string | null;
  nombreFirmante?: string;
  documentoFirmante?: string;
}) {
  const fecha = firmaFecha?.toDate ? formatearFecha(firmaFecha.toDate()) : '';
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <Link
          to={volverA}
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Volver a postulación
        </Link>
        <Button
          variant="brand-primary"
          onClick={() => window.print()}
          icon={<Printer size={13} strokeWidth={1.75} />}
        >
          Imprimir / Guardar PDF
        </Button>
      </div>

      <article className="bg-white border border-slate-200 print:border-0 p-12 print:p-0 shadow-brand-card print:shadow-none text-[13px] leading-relaxed text-text-strong">
        <header className="flex items-center gap-6 border-b-2 border-text-strong pb-5 mb-7">
          <EquitelLogo size={64} />
          <div>
            <h2 className="text-[18px] font-bold uppercase tracking-tight text-text-strong">
              {empresaNombre}
            </h2>
            {empresaNit && <p className="text-[11px] text-text-muted mt-1">NIT {empresaNit}</p>}
          </div>
        </header>

        <div className="text-center mb-6">
          <p className="text-[14px] font-bold uppercase tracking-wide">{titulo}</p>
          {subtitulo && <p className="text-[11px] text-text-muted mt-1">{subtitulo}</p>}
        </div>

        {secciones.map((s, i) => (
          <section key={i} className="mb-5 break-inside-avoid">
            <h3 className="text-[12px] font-bold uppercase tracking-wide border-b border-slate-300 pb-1 mb-2">
              {s.titulo}
            </h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {s.campos.map((c, j) => (
                <div key={j} className="flex gap-2">
                  <span className="text-[11px] font-semibold text-text-muted shrink-0">
                    {c.label}:
                  </span>
                  <span className="text-[12px] text-text-strong break-words">{c.valor || '—'}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Firma digital del candidato */}
        <div className="mt-10 break-inside-avoid">
          {firmaImagenUrl ? (
            <img src={firmaImagenUrl} alt="Firma del integrante" className="max-h-24 object-contain mb-1" />
          ) : (
            <div className="min-h-[3em]" />
          )}
          <div className="border-b border-text-strong mb-1 w-72"></div>
          <p className="text-[11px] font-bold uppercase tracking-wide">Firma del integrante</p>
          {nombreFirmante && (
            <p className="text-[11px] text-text-muted mt-1">
              {nombreFirmante}
              {documentoFirmante ? ` · C.C. ${documentoFirmante}` : ''}
            </p>
          )}
          {fecha && (
            <p className="text-[11px] text-text-muted">
              ✓ Firmado digitalmente el {fecha}
              {firmaPdfUrl && (
                <>
                  {' · '}
                  <a
                    href={firmaPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline print:no-underline"
                  >
                    constancia (PDF)
                  </a>
                </>
              )}
            </p>
          )}
        </div>

        <footer className="mt-12 pt-4 border-t border-slate-300 text-[10px] text-text-muted text-center">
          {empresaNombre} · Plataforma de Atracción · {formatearFecha(new Date())}
        </footer>
      </article>
    </div>
  );
}
