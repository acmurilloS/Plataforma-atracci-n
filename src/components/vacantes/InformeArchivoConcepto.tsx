import { useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ExternalLink, FileSpreadsheet, FileText, Trash2, Upload } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { MB, mensajeErrorSubida, prepararArchivo } from '../../utils/archivos';
import { formatearFecha } from '../../utils/fechas';
import { Button } from '../brand';
import type { ArchivoInformeConcepto } from '../../schemas';

/**
 * Informe de atracción en ARCHIVO (PDF o Excel) dentro del Concepto (reu Karen
 * 20-oct: "los líderes nos siguen diciendo que visualmente no se ve bien y no lo
 * entienden"). La analista lo sube aquí y el líder lo ve en la misma página:
 * el PDF se muestra embebido; el Excel se descarga. La tabla VIDA-F-03 sigue
 * disponible y es opcional si hay archivo.
 *
 * El archivo va a Storage `conceptos/{vacanteId}/…` (regla: solo Atracción sube,
 * PDF/Excel hasta 15 MB) y queda referenciado en `conceptos_atraccion.archivo_informe`.
 * Reemplazar o quitar no borra el archivo anterior (trazabilidad).
 */
export function InformeArchivoConcepto({
  vacanteId,
  archivo,
  puedeEditar,
  onGuardar,
}: {
  vacanteId: string;
  archivo: ArchivoInformeConcepto | null;
  puedeEditar: boolean;
  /** Persiste el archivo (o null para quitarlo) en el concepto. */
  onGuardar: (archivo: ArchivoInformeConcepto | null) => Promise<boolean>;
}) {
  const { user, perfil } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!archivo && !puedeEditar) return null;

  const esPdf = archivo?.content_type === 'application/pdf';

  async function subir(file: File) {
    if (!user) return;
    setSubiendo(true);
    setErr(null);
    try {
      const listo = await prepararArchivo(file, { permitidos: ['pdf', 'excel'], maxBytes: 15 * MB });
      const path = `conceptos/${vacanteId}/${Date.now()}_${listo.nombreSeguro}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, listo.blob, { contentType: listo.contentType });
      const url = await getDownloadURL(r);
      const ok = await onGuardar({
        url,
        path,
        nombre: listo.nombre,
        content_type: listo.contentType,
        tamano: listo.tamano,
        subido_en: Timestamp.now(),
        subido_por: user.uid,
        subido_por_nombre: perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : '',
      });
      if (!ok) setErr('El archivo se subió, pero no se pudo guardar en el concepto. Vuelve a intentarlo.');
    } catch (e) {
      setErr(mensajeErrorSubida(e, 'No se pudo subir el informe.'));
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function quitar() {
    if (!window.confirm('¿Quitar el informe en archivo de este concepto? El líder dejará de verlo.')) return;
    setErr(null);
    const ok = await onGuardar(null);
    if (!ok) setErr('No se pudo quitar el archivo.');
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-brand-card print:hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Informe del proceso
          </p>
          {archivo ? (
            <div className="mt-2 flex items-center gap-2.5 min-w-0">
              {esPdf ? (
                <FileText size={20} strokeWidth={1.75} className="text-brand-700 shrink-0" />
              ) : (
                <FileSpreadsheet size={20} strokeWidth={1.75} className="text-success-700 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-text-strong truncate">{archivo.nombre}</p>
                <p className="text-[11.5px] text-text-muted">
                  {esPdf ? 'PDF' : 'Excel'} · {(archivo.tamano / MB).toFixed(1)} MB
                  {archivo.subido_por_nombre ? ` · subido por ${archivo.subido_por_nombre}` : ''}
                  {archivo.subido_en?.toDate
                    ? ` · ${formatearFecha(archivo.subido_en.toDate(), 'dd/MM/yyyy h:mm a')}`
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-text-muted leading-[1.5] max-w-xl">
              ¿Prefieres enviar el informe en tu propio formato? Súbelo en PDF o Excel y el líder lo
              verá aquí. Si lo subes, la tabla de abajo es opcional.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {archivo && (
            <a
              href={archivo.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50"
            >
              <ExternalLink size={13} strokeWidth={1.75} />
              {esPdf ? 'Abrir en otra pestaña' : 'Descargar Excel'}
            </a>
          )}
          {puedeEditar && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void subir(f);
                }}
              />
              <Button
                variant={archivo ? 'neutral-secondary' : 'brand-primary'}
                onClick={() => inputRef.current?.click()}
                loading={subiendo}
                disabled={subiendo}
                icon={<Upload size={13} strokeWidth={1.75} />}
              >
                {subiendo ? 'Subiendo…' : archivo ? 'Reemplazar' : 'Subir PDF o Excel'}
              </Button>
              {archivo && (
                <button
                  type="button"
                  onClick={quitar}
                  className="inline-flex items-center gap-1 text-[12px] text-danger-700 hover:underline"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                  Quitar
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {err && <p className="mt-3 text-[12px] text-danger-700">{err}</p>}
      {archivo && esPdf && (
        <iframe
          src={archivo.url}
          title={archivo.nombre}
          className="mt-4 w-full h-[75vh] rounded border border-slate-200 bg-slate-50"
        />
      )}
      {archivo && !esPdf && (
        <p className="mt-3 text-[12px] text-text-muted">
          Los archivos de Excel no se pueden ver dentro de la página: usa «Descargar Excel» para
          abrirlo.
        </p>
      )}
    </section>
  );
}
