import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Download, ExternalLink } from 'lucide-react';
import { db } from '../../lib/firebase';
import { Button } from '../brand';
import {
  archivosDeCarpeta,
  descargarCarpetaZip,
  nombreZipCarpeta,
} from '../../utils/descargarCarpeta';
import type { DocumentoCandidatoDoc } from '../../schemas';

/**
 * Botón "Descargar carpeta (.zip)" de la tarjeta de Carpetas (reu Karen + Diego
 * 08-oct). Baja TODOS los archivos de la carpeta (también los ítems con varios
 * archivos) con los mismos nombres del depósito en Drive. Si la carpeta ya se
 * depositó en la Unidad Compartida de GH, ofrece además abrirla en Drive.
 */

interface Props {
  candidatoId: string;
  candidatoNombre: string;
  consecutivo?: string;
  documentos: DocumentoCandidatoDoc[];
  driveCarpetaId?: string | null;
}

export function DescargarCarpetaBoton({
  candidatoId,
  candidatoNombre,
  consecutivo,
  documentos,
  driveCarpetaId,
}: Props) {
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const hayArchivos = documentos.some((d) => (d.archivos?.length ?? 0) > 0 || !!d.archivo_url);

  async function descargar() {
    setMsg(null);
    setProgreso({ hechos: 0, total: 0 });
    try {
      // La cédula va en el nombre de cada archivo, como en Drive.
      let cedula = '';
      if (candidatoId) {
        try {
          const c = await getDoc(doc(db, 'candidatos', candidatoId));
          cedula = String(c.data()?.documento_numero ?? '').trim();
        } catch {
          /* sin cédula: los nombres quedan sin ella */
        }
      }
      const archivos = archivosDeCarpeta(documentos, cedula);
      if (archivos.length === 0) {
        setMsg({ tono: 'error', texto: 'Esta carpeta todavía no tiene archivos.' });
        return;
      }
      setProgreso({ hechos: 0, total: archivos.length });
      const r = await descargarCarpetaZip(
        archivos,
        nombreZipCarpeta(candidatoNombre, cedula, consecutivo),
        (hechos, total) => setProgreso({ hechos, total }),
      );
      setMsg(
        r.fallidos.length
          ? {
              tono: 'error',
              texto: `Se descargaron ${r.incluidos} archivos; ${r.fallidos.length} no se pudieron incluir (están listados en el LEEME del .zip).`,
            }
          : { tono: 'ok', texto: `Carpeta descargada: ${r.incluidos} archivos.` },
      );
    } catch (e) {
      setMsg({
        tono: 'error',
        texto: e instanceof Error ? e.message : 'No pudimos armar el .zip. Vuelve a intentarlo.',
      });
    } finally {
      setProgreso(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="neutral-secondary"
          size="medium"
          onClick={descargar}
          disabled={!!progreso || !hayArchivos}
          loading={!!progreso}
          icon={<Download size={13} strokeWidth={1.75} />}
        >
          {progreso
            ? progreso.total
              ? `Descargando ${progreso.hechos}/${progreso.total}…`
              : 'Preparando…'
            : 'Descargar carpeta (.zip)'}
        </Button>
        {driveCarpetaId && (
          <a
            href={`https://drive.google.com/drive/folders/${driveCarpetaId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            <ExternalLink size={11} strokeWidth={1.75} />
            Abrir en Drive
          </a>
        )}
      </div>
      {msg && (
        <p className={`text-[11px] ${msg.tono === 'ok' ? 'text-success-700' : 'text-danger-700'}`}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
