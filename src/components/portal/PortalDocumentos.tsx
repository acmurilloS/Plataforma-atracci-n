import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Check, FileText, Loader2, Plus, Upload, X } from 'lucide-react';
import { auth, functions, storage } from '../../lib/firebase';
import { asegurarSesionAnonima } from '../../lib/sesionAnonima';
import { reportarFalloSubidaPortal } from '../../lib/reportarFalloSubida';
import { ErrorArchivo, MB, mensajeErrorSubida, prepararArchivo, type ArchivoListo } from '../../utils/archivos';

/**
 * PortalDocumentos · F4 · slots pre-etiquetados que van a la carpeta REAL.
 *
 * Cada slot corresponde a un documento que aporta el candidato
 * (`aporta_candidato:true`). La subida va a Storage `portal_docs/{token}/…` y se
 * registra en `documentos_candidato` (la carpeta que ve GH) vía callable, con la
 * cédula como 2º factor. Un doc ya `verificado` por GH no se puede re-subir.
 *
 * Ítems MÚLTIPLES (certificados laborales / de estudio): admiten varios archivos.
 * Se listan todos y hay "Agregar otro archivo" + quitar. Antes cada subida
 * reemplazaba a la anterior y el candidato perdía la primera (reporte 09-sep).
 */

export interface ArchivoSlot {
  url: string;
  nombre: string;
}

export interface PortalSlot {
  clave: string;
  nombre: string;
  seccion: string;
  opcional: boolean;
  estado: string; // pendiente | entregado | verificado | no_aplica
  nombre_archivo: string;
  observaciones: string;
  /** True si el ítem admite varios archivos. */
  multiple?: boolean;
  /** Archivos ya subidos (en ítems múltiples se listan todos). */
  archivos?: ArchivoSlot[];
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
            onCambio={(patch) => actualizarSlot(s.clave, patch)}
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
  onCambio,
}: {
  slot: PortalSlot;
  token: string;
  cedula: string;
  onCambio: (patch: Partial<PortalSlot>) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const bloqueado = slot.estado === 'verificado' || slot.estado === 'no_aplica';
  const esMultiple = !!slot.multiple;
  // Lista a mostrar: `archivos` si viene; si no, deriva del archivo único.
  const archivos: ArchivoSlot[] =
    slot.archivos && slot.archivos.length
      ? slot.archivos
      : slot.nombre_archivo
        ? [{ url: '', nombre: slot.nombre_archivo }]
        : [];

  // Tipo real por contenido (no por lo que diga el celular), fotos comprimidas y
  // sesión asegurada antes de subir: incidente 08-oct (archivos sin tipo → la
  // regla de Storage los rechazaba con un error en inglés). Ver utils/archivos.
  async function subirUno(file: File): Promise<ArchivoSlot[] | null> {
    let listo: ArchivoListo | null = null;
    try {
      listo = await prepararArchivo(file, { permitidos: ['pdf', 'imagen', 'word'], maxBytes: 10 * MB });
      await asegurarSesionAnonima();
      const ts = Date.now();
      const r = storageRef(storage, `portal_docs/${token}/${slot.clave}_${ts}_${listo.nombreSeguro}`);
      await uploadBytes(r, listo.blob, {
        contentType: listo.contentType,
        customMetadata: { uploaderUid: auth.currentUser?.uid ?? '' },
      });
      const url = await getDownloadURL(r);
      return await registrar(url, listo);
    } catch (e) {
      reportarFalloSubidaPortal({ token, clave: slot.clave, file, error: e, listo });
      // Un archivo inválido no frena los demás de la misma selección.
      if (e instanceof ErrorArchivo) {
        setErr(e.message);
        return null;
      }
      throw e;
    }
  }

  async function registrar(url: string, listo: ArchivoListo): Promise<ArchivoSlot[]> {
    const fn = httpsCallable<
      {
        token: string;
        cedula: string;
        clave: string;
        url: string;
        nombre_archivo: string;
        tamano_bytes: number;
      },
      { ok: true; archivos: ArchivoSlot[] }
    >(functions, 'registrarDocumentoCarpetaPortal');
    const res = await fn({
      token,
      cedula,
      clave: slot.clave,
      url,
      nombre_archivo: listo.nombre,
      tamano_bytes: listo.tamano,
    });
    return res.data.archivos ?? [];
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length || !token) return;
    setSubiendo(true);
    setErr(null);
    try {
      let ultima: ArchivoSlot[] | null = null;
      // Uno por uno: cada llamada AGREGA a la lista del servidor.
      for (const file of esMultiple ? files : files.slice(0, 1)) {
        const lista = await subirUno(file);
        if (lista) ultima = lista;
      }
      if (ultima) {
        onCambio({
          estado: 'entregado',
          archivos: ultima,
          nombre_archivo: ultima[0]?.nombre ?? '',
          observaciones: '',
        });
      }
    } catch (e2) {
      setErr(mensajeErrorSubida(e2));
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar(a: ArchivoSlot) {
    if (!a.url) return;
    setQuitando(a.url);
    setErr(null);
    try {
      const fn = httpsCallable<
        { token: string; cedula: string; clave: string; url: string },
        { ok: true; archivos: ArchivoSlot[]; estado: string }
      >(functions, 'quitarArchivoCarpetaPortal');
      const res = await fn({ token, cedula, clave: slot.clave, url: a.url });
      onCambio({
        archivos: res.data.archivos,
        estado: res.data.estado,
        nombre_archivo: res.data.archivos[0]?.nombre ?? '',
      });
    } catch (e2) {
      setErr(mensajeErrorSubida(e2, 'No se pudo quitar el archivo.'));
    } finally {
      setQuitando(null);
    }
  }

  const etiquetaBoton = subiendo
    ? 'Subiendo…'
    : esMultiple
      ? archivos.length > 0
        ? 'Agregar otro archivo'
        : 'Subir documento'
      : slot.estado === 'entregado'
        ? 'Cambiar archivo'
        : 'Subir documento';

  return (
    <div className="px-5 sm:px-7 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-strong leading-[1.4]">
            {slot.nombre}
            {slot.opcional && (
              <span className="text-[11px] text-text-subtle font-normal"> · si aplica</span>
            )}
            {esMultiple && (
              <span className="text-[11px] text-info-700 font-normal"> · varios archivos</span>
            )}
          </p>
          {slot.estado === 'pendiente' && slot.observaciones && (
            <p className="text-[12px] text-warning-700 mt-0.5">
              El equipo pidió corregir: {slot.observaciones}
            </p>
          )}
        </div>
        <EstadoSlot estado={slot.estado} />
      </div>

      {/* Archivos ya subidos */}
      {archivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {archivos.map((a, i) => (
            <li
              key={a.url || i}
              className="flex items-center gap-2 text-[12px] text-text-body bg-slate-50 rounded-md px-2.5 py-1.5"
            >
              <FileText size={13} strokeWidth={1.75} className="text-text-subtle shrink-0" />
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:underline text-info-700"
                >
                  {a.nombre}
                </a>
              ) : (
                <span className="truncate">{a.nombre}</span>
              )}
              {!bloqueado && a.url && (
                <button
                  type="button"
                  onClick={() => quitar(a)}
                  disabled={quitando === a.url || subiendo}
                  title="Quitar este archivo"
                  className="ml-auto shrink-0 text-text-subtle hover:text-danger-700 disabled:opacity-50"
                >
                  {quitando === a.url ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <X size={13} strokeWidth={2} />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!bloqueado && (
        <div className="mt-2">
          <label
            className={`inline-flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3.5 py-2 text-[12.5px] font-medium cursor-pointer hover:bg-slate-50 ${
              subiendo ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {subiendo ? (
              <Loader2 size={14} className="animate-spin" />
            ) : esMultiple && archivos.length > 0 ? (
              <Plus size={14} strokeWidth={2} />
            ) : (
              <Upload size={14} strokeWidth={1.75} />
            )}
            {etiquetaBoton}
            <input
              type="file"
              accept="application/pdf,image/*,.doc,.docx"
              multiple={esMultiple}
              onChange={onFile}
              className="hidden"
              disabled={subiendo}
            />
          </label>
          {esMultiple && (
            <p className="text-[11px] text-text-subtle mt-1">
              Puedes seleccionar varios a la vez; se suman a los que ya subiste.
            </p>
          )}
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
