import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Check, Loader2, Upload } from 'lucide-react';
import { functions, storage } from '../../lib/firebase';

/**
 * PortalDocumentos · F4 · slots pre-etiquetados que van a la carpeta REAL.
 *
 * Cada slot corresponde a un documento que aporta el candidato
 * (`aporta_candidato:true`). La subida va a Storage `portal_docs/{token}/…` y se
 * registra en `documentos_candidato` (la carpeta que ve GH) vía callable, con la
 * cédula como 2º factor. Un doc ya `verificado` por GH no se puede re-subir.
 */

export interface PortalSlot {
  clave: string;
  nombre: string;
  seccion: string;
  opcional: boolean;
  estado: string; // pendiente | entregado | verificado | no_aplica
  nombre_archivo: string;
  observaciones: string;
}

export function PortalDocumentos({
  token,
  cedula,
  slots: slotsIniciales,
}: {
  token: string;
  cedula: string;
  slots: PortalSlot[];
}) {
  const [slots, setSlots] = useState<PortalSlot[]>(slotsIniciales);

  function actualizarSlot(clave: string, patch: Partial<PortalSlot>) {
    setSlots((prev) => prev.map((s) => (s.clave === clave ? { ...s, ...patch } : s)));
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
          Documentos para tu vinculación
        </h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          Sube cada documento en su casilla (PDF o foto legible, máx. 10 MB). El equipo los revisa
          y te avisa si falta algo.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {slots.map((s) => (
          <SlotRow
            key={s.clave}
            slot={s}
            token={token}
            cedula={cedula}
            onSubido={(nombreArchivo) =>
              actualizarSlot(s.clave, {
                estado: 'entregado',
                nombre_archivo: nombreArchivo,
                observaciones: '',
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function SlotRow({
  slot,
  token,
  cedula,
  onSubido,
}: {
  slot: PortalSlot;
  token: string;
  cedula: string;
  onSubido: (nombreArchivo: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bloqueado = slot.estado === 'verificado' || slot.estado === 'no_aplica';

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr('El archivo supera 10 MB. Comprímelo o súbelo en partes.');
      return;
    }
    setSubiendo(true);
    setErr(null);
    try {
      const ts = Date.now();
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const r = storageRef(storage, `portal_docs/${token}/${slot.clave}_${ts}_${safe}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const fn = httpsCallable<
        {
          token: string;
          cedula: string;
          clave: string;
          url: string;
          nombre_archivo: string;
          tamano_bytes: number;
        },
        { ok: true }
      >(functions, 'registrarDocumentoCarpetaPortal');
      await fn({
        token,
        cedula,
        clave: slot.clave,
        url,
        nombre_archivo: file.name,
        tamano_bytes: file.size,
      });
      onSubido(file.name);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo subir el archivo. Reintenta.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="px-5 sm:px-7 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-strong leading-[1.4]">
            {slot.nombre}
            {slot.opcional && (
              <span className="text-[11px] text-text-subtle font-normal"> · si aplica</span>
            )}
          </p>
          {slot.estado === 'entregado' && (
            <p className="text-[12px] text-info-700 mt-0.5">
              Recibido{slot.nombre_archivo ? ` · ${slot.nombre_archivo}` : ''}
            </p>
          )}
          {slot.estado === 'pendiente' && slot.observaciones && (
            <p className="text-[12px] text-warning-700 mt-0.5">
              El equipo pidió corregir: {slot.observaciones}
            </p>
          )}
        </div>
        <EstadoSlot estado={slot.estado} />
      </div>

      {!bloqueado && (
        <div className="mt-2">
          <label
            className={`inline-flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3.5 py-2 text-[12.5px] font-medium cursor-pointer hover:bg-slate-50 ${
              subiendo ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {subiendo ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} strokeWidth={1.75} />
            )}
            {subiendo
              ? 'Subiendo…'
              : slot.estado === 'entregado'
                ? 'Cambiar archivo'
                : 'Subir documento'}
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={onFile}
              className="hidden"
              disabled={subiendo}
            />
          </label>
          {err && <p className="text-[12px] text-danger-700 mt-1.5">{err}</p>}
        </div>
      )}
    </div>
  );
}

function EstadoSlot({ estado }: { estado: string }) {
  if (estado === 'verificado')
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-success-700 bg-success-50 border border-success-500/25 rounded-full px-2 py-0.5">
        <Check size={12} strokeWidth={2.5} />
        Verificado
      </span>
    );
  if (estado === 'entregado')
    return (
      <span className="inline-flex shrink-0 items-center text-[11.5px] font-medium text-info-700 bg-info-50 border border-info-500/25 rounded-full px-2 py-0.5">
        En revisión
      </span>
    );
  if (estado === 'no_aplica')
    return (
      <span className="inline-flex shrink-0 items-center text-[11.5px] font-medium text-text-subtle bg-slate-100 rounded-full px-2 py-0.5">
        No aplica
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center text-[11.5px] font-medium text-text-muted bg-slate-100 rounded-full px-2 py-0.5">
      Pendiente
    </span>
  );
}
