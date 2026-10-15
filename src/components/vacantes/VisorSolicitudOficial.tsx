import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Download, FileText, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { Button } from '../brand';
import { estamparSolicitudIntegrante } from '../../utils/estamparSolicitudIntegrante';
import {
  camposEfectivos,
  datosSolicitudOficial,
  nombreArchivoSolicitud,
  type CamposSolicitud,
} from '../../utils/solicitudOficial';
import type { SolicitudIntegranteDoc, VacanteDoc } from '../../schemas';

/**
 * VisorSolicitudOficial · reu Karen + Diego 08-oct: Diego veía la
 * previsualización del VIDA-F-01 pero no "el original que se descarga". Aquí se
 * genera el formato OFICIAL estampado y se muestra en pantalla, con descarga.
 *
 * `campos` llega desde la página de la Solicitud (lo que se está editando); si no
 * llega, se lee lo guardado en `solicitudes_integrante` (GH puede leerlo) y se
 * completa con lo que trae la vacante.
 */

interface Props {
  vacante: VacanteDoc;
  campos?: CamposSolicitud | null;
  onClose: () => void;
}

export function VisorSolicitudOficial({ vacante, campos, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;
    (async () => {
      try {
        let efectivos = campos ?? null;
        if (!efectivos) {
          const snap = await getDocs(
            query(collection(db, 'solicitudes_integrante'), where('vacante_id', '==', vacante.id), limit(1)),
          );
          const guardada = snap.docs[0]
            ? ({ id: snap.docs[0].id, ...snap.docs[0].data() } as SolicitudIntegranteDoc)
            : null;
          efectivos = camposEfectivos(vacante, guardada);
        }
        const blob = await estamparSolicitudIntegrante(datosSolicitudOficial(vacante, efectivos));
        creada = URL.createObjectURL(blob);
        if (vivo) setUrl(creada);
        else URL.revokeObjectURL(creada);
      } catch (e) {
        if (vivo) setErr(e instanceof Error ? e.message : 'No pudimos generar el formato oficial.');
      }
    })();
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [vacante, campos]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[92vh] rounded-xl bg-white shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={16} strokeWidth={1.75} className="text-brand-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-text-strong truncate">
                Solicitud de Integrantes · formato oficial VIDA-F-01
              </p>
              <p className="text-[11px] text-text-subtle truncate">
                {vacante.consecutivo} · {vacante.cargo_nombre}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a href={url} download={nombreArchivoSolicitud(vacante)}>
                <Button variant="neutral-secondary" icon={<Download size={13} strokeWidth={1.75} />}>
                  Descargar
                </Button>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-text-subtle hover:text-text-strong p-1"
              aria-label="Cerrar"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100">
          {err ? (
            <p className="p-6 text-[13px] text-danger-700">{err}</p>
          ) : url ? (
            <iframe src={url} title="Formato oficial VIDA-F-01" className="w-full h-full border-0" />
          ) : (
            <p className="p-6 text-[13px] text-text-muted">Generando el formato oficial…</p>
          )}
        </div>
      </div>
    </div>
  );
}
