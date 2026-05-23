import { useMemo, useState, type ChangeEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { Check, FileText, Upload, X } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import {
  CATALOGO_DOCUMENTOS_CARPETA,
  SECCIONES_LABEL,
  totalObligatorios,
  type DocumentoCandidatoDoc,
  type DocumentoCarpetaCatalogo,
  type EstadoDocumento,
  type PostulacionDoc,
  type SeccionDocumento,
} from '../../schemas';

interface Props {
  postulacion: PostulacionDoc;
}

const ESTADO_LABEL: Record<EstadoDocumento, string> = {
  pendiente: 'Pendiente',
  entregado: 'Entregado',
  verificado: 'Verificado',
  no_aplica: 'No aplica',
};

const ESTADO_COLOR: Record<EstadoDocumento, string> = {
  pendiente: 'bg-navy-50 text-navy-600 border-navy-200',
  entregado: 'bg-amber-50 text-amber-800 border-amber-200',
  verificado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  no_aplica: 'bg-cream-100 text-navy-500 border-navy-200',
};

export function DocumentosTab({ postulacion }: Props) {
  const { docs } = useColeccion<DocumentoCandidatoDoc>('documentos_candidato', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil } = useAuth();
  const [errGlobal, setErrGlobal] = useState<string | null>(null);

  // Mapa rápido por clave para saber si un doc del catálogo ya existe en Firestore
  const docsPorClave = useMemo(() => {
    const m = new Map<string, DocumentoCandidatoDoc>();
    docs.forEach((d) => m.set(d.clave, d));
    return m;
  }, [docs]);

  // Cálculo de progreso
  const totalReq = totalObligatorios();
  const verificadosObligatorios = useMemo(
    () =>
      CATALOGO_DOCUMENTOS_CARPETA.filter(
        (cat) => !cat.opcional && docsPorClave.get(cat.clave)?.estado === 'verificado',
      ).length,
    [docsPorClave],
  );
  const porcentaje = totalReq > 0 ? Math.round((verificadosObligatorios / totalReq) * 100) : 0;

  const secciones: SeccionDocumento[] = ['generales', 'seguridad_social', 'hoja_vida'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-navy-900">
            Carpeta digital del integrante (paso 10)
          </h3>
          <p className="text-xs text-navy-500 mt-0.5">
            Formato DGH-F-04 v5 · {verificadosObligatorios} de {totalReq} obligatorios verificados
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-bold text-equitel-rojo-700">{porcentaje}%</p>
          <p className="text-[10px] uppercase tracking-wider text-navy-500">Completitud</p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="h-2 rounded-full bg-navy-100 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-equitel-rojo-500 to-equitel-rojo-700 transition-all"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {errGlobal && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {errGlobal}
        </div>
      )}

      {/* Secciones */}
      {secciones.map((seccion) => {
        const itemsSeccion = CATALOGO_DOCUMENTOS_CARPETA.filter((c) => c.seccion === seccion);
        const verifSeccion = itemsSeccion.filter(
          (c) => docsPorClave.get(c.clave)?.estado === 'verificado',
        ).length;
        const obligatoriosSeccion = itemsSeccion.filter((c) => !c.opcional).length;

        return (
          <section key={seccion} className="rounded-xl border border-navy-100 bg-white overflow-hidden">
            <header className="bg-cream-50 px-5 py-3 border-b border-navy-100 flex items-center justify-between">
              <h4 className="font-display text-sm font-bold text-navy-900 uppercase tracking-wide">
                {SECCIONES_LABEL[seccion]}
              </h4>
              <span className="text-xs text-navy-500">
                {verifSeccion}/{obligatoriosSeccion} obligatorios
              </span>
            </header>
            <ul className="divide-y divide-navy-50">
              {itemsSeccion.map((cat) => (
                <DocumentoRow
                  key={cat.clave}
                  catalogo={cat}
                  doc={docsPorClave.get(cat.clave) ?? null}
                  postulacion={postulacion}
                  uid={user?.uid ?? ''}
                  verificadorNombre={perfil ? `${perfil.nombre} ${perfil.apellido}` : null}
                  crear={crear}
                  actualizar={actualizar}
                  onError={(msg) => setErrGlobal(msg)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ─── Row por documento del catálogo ─────────────────────────────────────

interface RowProps {
  catalogo: DocumentoCarpetaCatalogo;
  doc: DocumentoCandidatoDoc | null;
  postulacion: PostulacionDoc;
  uid: string;
  verificadorNombre: string | null;
  crear: ReturnType<typeof useMutacion>['crear'];
  actualizar: ReturnType<typeof useMutacion>['actualizar'];
  onError: (msg: string) => void;
}

function DocumentoRow({
  catalogo,
  doc,
  postulacion,
  uid,
  verificadorNombre,
  crear,
  actualizar,
  onError,
}: RowProps) {
  const estado: EstadoDocumento = doc?.estado ?? 'pendiente';
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);

  async function subirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      onError('El archivo no puede superar 10 MB.');
      return;
    }
    setSubiendo(true);
    setProgreso(0);
    try {
      const ts = Date.now();
      const safe = file.name.replace(/[^\w.-]+/g, '_');
      const path = `documentos_candidato/${postulacion.candidato_id}/${catalogo.clave}_${ts}_${safe}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            if (snap.totalBytes > 0) setProgreso((snap.bytesTransferred / snap.totalBytes) * 100);
          },
          (err) => reject(err),
          () => resolve(),
        );
      });

      const url = await getDownloadURL(task.snapshot.ref);
      const ahora = Timestamp.now();

      if (doc) {
        await actualizar('documentos_candidato', doc.id, {
          archivo_url: url,
          nombre_archivo: file.name,
          tamano_bytes: file.size,
          estado: 'entregado',
          fecha_entrega: ahora,
        });
      } else {
        await crear('documentos_candidato', {
          postulacion_id: postulacion.id,
          candidato_id: postulacion.candidato_id,
          candidato_nombre: postulacion.candidato_nombre,
          clave: catalogo.clave,
          seccion: catalogo.seccion,
          nombre: catalogo.nombre,
          estado: 'entregado',
          archivo_url: url,
          nombre_archivo: file.name,
          tamano_bytes: file.size,
          observaciones: '',
          fecha_entrega: ahora,
          verificado_en: null,
          verificado_por_uid: null,
          verificado_por_nombre: null,
        });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No pudimos subir el archivo.');
    } finally {
      setSubiendo(false);
      setProgreso(0);
      e.target.value = '';
    }
  }

  async function marcarVerificado() {
    if (!doc) return;
    const ahora = Timestamp.now();
    try {
      await actualizar('documentos_candidato', doc.id, {
        estado: 'verificado',
        verificado_en: ahora,
        verificado_por_uid: uid,
        verificado_por_nombre: verificadorNombre,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos verificar.');
    }
  }

  async function marcarNoAplica() {
    const obs = window.prompt('Razón (opcional):') ?? '';
    if (doc) {
      await actualizar('documentos_candidato', doc.id, {
        estado: 'no_aplica',
        observaciones: obs,
      });
    } else {
      await crear('documentos_candidato', {
        postulacion_id: postulacion.id,
        candidato_id: postulacion.candidato_id,
        candidato_nombre: postulacion.candidato_nombre,
        clave: catalogo.clave,
        seccion: catalogo.seccion,
        nombre: catalogo.nombre,
        estado: 'no_aplica',
        archivo_url: null,
        nombre_archivo: null,
        tamano_bytes: null,
        observaciones: obs,
        fecha_entrega: null,
        verificado_en: null,
        verificado_por_uid: null,
        verificado_por_nombre: null,
      });
    }
  }

  async function reabrir() {
    if (!doc) return;
    await actualizar('documentos_candidato', doc.id, {
      estado: doc.archivo_url ? 'entregado' : 'pendiente',
      verificado_en: null,
      verificado_por_uid: null,
      verificado_por_nombre: null,
    });
  }

  const inputId = `up-${catalogo.clave}`;

  return (
    <li className="px-5 py-3 flex items-start gap-3 hover:bg-cream-50/50 transition">
      <div className="mt-0.5 flex-shrink-0">
        {estado === 'verificado' ? (
          <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check size={14} className="text-emerald-700" />
          </div>
        ) : estado === 'no_aplica' ? (
          <div className="h-7 w-7 rounded-full bg-navy-100 flex items-center justify-center">
            <X size={14} className="text-navy-500" />
          </div>
        ) : (
          <div className="h-7 w-7 rounded-full bg-white border border-navy-200 flex items-center justify-center">
            <FileText size={14} className="text-navy-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-navy-900">{catalogo.nombre}</span>
          {catalogo.opcional && (
            <span className="text-[10px] uppercase tracking-wider text-navy-400 font-bold">
              Si aplica
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${ESTADO_COLOR[estado]}`}>
            {ESTADO_LABEL[estado]}
          </span>
        </div>
        {catalogo.ayuda && (
          <p className="text-[11px] text-navy-500 mt-0.5">{catalogo.ayuda}</p>
        )}
        {doc?.archivo_url && (
          <a
            href={doc.archivo_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-xs text-equitel-rojo-700 hover:underline"
          >
            <FileText size={11} />
            {doc.nombre_archivo ?? 'Ver archivo'}
          </a>
        )}
        {doc?.observaciones && (
          <p className="text-xs text-navy-500 mt-1 italic">"{doc.observaciones}"</p>
        )}
        {doc?.estado === 'verificado' && doc.verificado_en && (
          <p className="text-[10px] text-navy-400 mt-1">
            Verificado por {doc.verificado_por_nombre ?? '—'} el {formatearFecha(doc.verificado_en.toDate())}
          </p>
        )}
        {subiendo && (
          <div className="mt-2 h-1 rounded-full bg-navy-100 overflow-hidden">
            <div
              className="h-full bg-equitel-rojo-600 transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {estado === 'pendiente' && (
          <>
            <label
              htmlFor={inputId}
              className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800"
            >
              <Upload size={11} />
              Subir
            </label>
            <input id={inputId} type="file" className="hidden" onChange={subirArchivo} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
            {catalogo.opcional && (
              <button
                onClick={marcarNoAplica}
                className="text-[11px] text-navy-500 hover:text-navy-700 hover:underline"
              >
                No aplica
              </button>
            )}
          </>
        )}
        {estado === 'entregado' && (
          <>
            <button
              onClick={marcarVerificado}
              className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
            >
              Verificar
            </button>
            <label
              htmlFor={inputId}
              className="cursor-pointer text-[11px] text-navy-500 hover:underline"
            >
              Reemplazar
            </label>
            <input id={inputId} type="file" className="hidden" onChange={subirArchivo} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
          </>
        )}
        {estado === 'verificado' && (
          <button
            onClick={reabrir}
            className="text-[11px] text-navy-500 hover:underline"
          >
            Reabrir
          </button>
        )}
        {estado === 'no_aplica' && (
          <button
            onClick={reabrir}
            className="text-[11px] text-navy-500 hover:underline"
          >
            Reactivar
          </button>
        )}
      </div>
    </li>
  );
}
