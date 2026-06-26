import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { Check, FileText, FolderOpen, Mail, Upload, X } from 'lucide-react';
import { storage, functions } from '../../lib/firebase';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import {
  CATALOGO_DOCUMENTOS_CARPETA,
  SECCIONES_LABEL,
  totalObligatorios,
  type ArchivoCarpeta,
  type DocumentoCandidatoDoc,
  type DocumentoCarpetaCatalogo,
  type EstadoDocumento,
  type PostulacionDoc,
  type SeccionDocumento,
} from '../../schemas';
import { Button, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * DocumentosTab · sistema brand.
 *
 * Carpeta digital del integrante (paso 10 · DGH-F-04 v5).
 * Header con barra de progreso brand. Secciones (generales / seguridad social /
 * hoja de vida) como cards con eyebrow + filas para cada documento.
 */

interface Props {
  postulacion: PostulacionDoc;
}

const ESTADO_LABEL: Record<EstadoDocumento, string> = {
  pendiente: 'Pendiente',
  entregado: 'Entregado',
  verificado: 'Verificado',
  no_aplica: 'No aplica',
};

const ESTADO_TONO: Record<EstadoDocumento, PillTono> = {
  pendiente: 'neutral',
  entregado: 'warning',
  verificado: 'success',
  no_aplica: 'neutral',
};

export function DocumentosTab({ postulacion }: Props) {
  const { docs } = useColeccion<DocumentoCandidatoDoc>('documentos_candidato', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  // Documentos que el candidato subió desde su portal público.
  const { docs: docsPortal } = useColeccion<{
    id: string;
    nombre_archivo?: string;
    url?: string;
    subido_en?: Timestamp;
  }>('documentos_portal', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil } = useAuth();
  const [errGlobal, setErrGlobal] = useState<string | null>(null);
  const [enviandoListado, setEnviandoListado] = useState(false);
  const [msgListado, setMsgListado] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const docsPorClave = useMemo(() => {
    const m = new Map<string, DocumentoCandidatoDoc>();
    docs.forEach((d) => m.set(d.clave, d));
    return m;
  }, [docs]);

  const emailCandidato = (postulacion.candidato_email ?? '').trim();

  // Documentos que aporta el candidato y siguen pendientes — los que pediremos
  // por correo (los candidatos no tienen acceso a la plataforma).
  const docsParaCandidato = useMemo(
    () =>
      CATALOGO_DOCUMENTOS_CARPETA.filter((c) => c.aporta_candidato)
        .filter((c) => (docsPorClave.get(c.clave)?.estado ?? 'pendiente') === 'pendiente')
        .map((c) => c.nombre + (c.opcional ? ' (si aplica)' : '')),
    [docsPorClave],
  );

  async function enviarListado() {
    if (docsParaCandidato.length === 0) return;
    setMsgListado(null);
    setEnviandoListado(true);
    try {
      const fn = httpsCallable<
        { postulacion_id: string; documentos: string[] },
        { ok: true; enviados: number; email_destinatario: string }
      >(functions, 'enviarListadoDocumentos');
      const res = await fn({ postulacion_id: postulacion.id, documentos: docsParaCandidato });
      setMsgListado({
        tipo: 'ok',
        texto: `Listado enviado a ${res.data.email_destinatario} (${res.data.enviados} documentos). Cuando responda con los adjuntos, los subes aquí.`,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'No se pudo enviar el listado.';
      setMsgListado({ tipo: 'err', texto: raw });
    } finally {
      setEnviandoListado(false);
    }
  }

  const totalReq = totalObligatorios();
  const verificadosObligatorios = useMemo(
    () =>
      CATALOGO_DOCUMENTOS_CARPETA.filter(
        (cat) =>
          !cat.opcional &&
          cat.responsable !== 'gh' &&
          docsPorClave.get(cat.clave)?.estado === 'verificado',
      ).length,
    [docsPorClave],
  );
  const porcentaje = totalReq > 0 ? Math.round((verificadosObligatorios / totalReq) * 100) : 0;

  // C.1 · cuando todos los obligatorios ya están cargados (ninguno 'pendiente'),
  // avisar a GH que la carpeta está lista para validar. Backend idempotente.
  const todosCargados = useMemo(
    () =>
      CATALOGO_DOCUMENTOS_CARPETA.filter((cat) => !cat.opcional && cat.responsable !== 'gh').every(
        (cat) => {
          const e = docsPorClave.get(cat.clave)?.estado;
          return e === 'entregado' || e === 'verificado' || e === 'no_aplica';
        },
      ),
    [docsPorClave],
  );
  useEffect(() => {
    if (!todosCargados || postulacion.carpeta_lista_validar_notificada_en) return;
    const fn = httpsCallable<{ postulacion_id: string }, { ok: true }>(
      functions,
      'notificarCarpetaListaValidar',
    );
    fn({ postulacion_id: postulacion.id }).catch(() => {
      /* el backend es idempotente; un fallo de red no es crítico */
    });
  }, [todosCargados, postulacion.id, postulacion.carpeta_lista_validar_notificada_en]);

  const secciones: SeccionDocumento[] = ['generales', 'seguridad_social', 'hoja_vida'];

  return (
    <div className="space-y-6">
      {docsPortal.length > 0 && (
        <div className="rounded-md bg-info-50/60 border border-info-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen size={14} strokeWidth={1.75} className="text-info-700" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-info-700">
              Aportados por el integrante · portal ({docsPortal.length})
            </p>
          </div>
          <ul className="space-y-1.5">
            {docsPortal.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-[13px] text-text-body">
                <FileText size={13} strokeWidth={1.75} className="text-text-subtle shrink-0" />
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-700 hover:underline truncate"
                >
                  {d.nombre_archivo || 'documento'}
                </a>
                {d.subido_en && (
                  <span className="text-[11px] text-text-subtle tabular-nums">
                    {formatearFecha(d.subido_en.toDate())}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Header con progreso */}
      <div className="rounded-md bg-white border border-slate-200 shadow-brand-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center">
              <FolderOpen size={18} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                  Carpeta digital del integrante · paso 10
                </p>
              </div>
              <p className="text-[18px] font-semibold tracking-[-0.012em] text-text-strong mt-1">
                Formato DGH-F-04 v5
              </p>
              <p className="text-[12px] text-text-muted mt-0.5 tabular-nums">
                {verificadosObligatorios} de {totalReq} obligatorios verificados
              </p>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'text-[48px] font-extralight leading-[0.9] tracking-[-0.045em] tabular-nums',
                porcentaje === 100
                  ? 'text-success-700'
                  : porcentaje >= 50
                    ? 'text-brand-700'
                    : 'text-text-strong',
              )}
            >
              {porcentaje}
              <span className="text-[24px] font-light">%</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.10em] text-text-subtle font-bold">
              Completitud
            </p>
          </div>
        </div>
        <div className="mt-5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300 ease-cult',
              porcentaje === 100 ? 'bg-success-500' : 'bg-brand-600',
            )}
            style={{ width: `${porcentaje}%` }}
          />
        </div>

        {/* Enviar al candidato el listado de documentos que debe aportar.
            Los candidatos no tienen acceso a la plataforma → se piden por correo. */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <Button
            variant="neutral-secondary"
            onClick={enviarListado}
            loading={enviandoListado}
            disabled={enviandoListado || docsParaCandidato.length === 0 || !emailCandidato}
            icon={<Mail size={13} strokeWidth={1.75} />}
          >
            Enviar listado al integrante
            {docsParaCandidato.length > 0 ? ` (${docsParaCandidato.length})` : ''}
          </Button>
          <span className="text-[11px] text-text-muted">
            {!emailCandidato
              ? 'El integrante no tiene correo — agrégalo en Datos Básicos.'
              : docsParaCandidato.length === 0
                ? 'No hay documentos del integrante pendientes por solicitar.'
                : 'Le llega un correo con la lista para que los envíe; tú los subes aquí.'}
          </span>
        </div>

        {msgListado && (
          <div
            className={cn(
              'mt-3 rounded-md border px-3 py-2 text-[12px]',
              msgListado.tipo === 'ok'
                ? 'border-success-500/20 bg-success-50 text-success-700'
                : 'border-danger-500/20 bg-danger-50 text-danger-700',
            )}
          >
            {msgListado.texto}
          </div>
        )}
      </div>

      {errGlobal && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {errGlobal}
        </div>
      )}

      {/* Secciones */}
      {secciones.map((seccion) => {
        const itemsSeccion = CATALOGO_DOCUMENTOS_CARPETA.filter((c) => c.seccion === seccion);
        const verifSeccion = itemsSeccion.filter(
          (c) => c.responsable !== 'gh' && docsPorClave.get(c.clave)?.estado === 'verificado',
        ).length;
        const obligatoriosSeccion = itemsSeccion.filter(
          (c) => !c.opcional && c.responsable !== 'gh',
        ).length;

        return (
          <section
            key={seccion}
            className="bg-white rounded-md border border-slate-200 shadow-brand-card overflow-hidden"
          >
            <header className="bg-slate-50 px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-strong">
                {SECCIONES_LABEL[seccion]}
              </p>
              <span className="text-[11px] text-text-muted tabular-nums">
                <span className="font-semibold text-text-strong">{verifSeccion}</span>
                <span className="text-text-subtle">/{obligatoriosSeccion} obligatorios</span>
              </span>
            </header>
            <ul className="divide-y divide-slate-100">
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
  const esMultiple = !!catalogo.multiple;
  const esGH = catalogo.responsable === 'gh';
  // Lista de archivos: usa `archivos` si existe; si no, deriva del archivo único
  // (compatibilidad con documentos viejos o subidos desde el portal).
  const archivos: ArchivoCarpeta[] =
    doc?.archivos ??
    (doc?.archivo_url ? [{ url: doc.archivo_url, nombre: doc.nombre_archivo ?? 'archivo' }] : []);
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
      const nuevo: ArchivoCarpeta = {
        url,
        nombre: file.name,
        tamano_bytes: file.size,
        subido_en: ahora,
      };
      // Múltiple → agrega a la lista; único → reemplaza.
      const lista = esMultiple ? [...archivos, nuevo] : [nuevo];
      const comun = {
        archivos: lista,
        archivo_url: lista[0].url,
        nombre_archivo: lista[0].nombre,
        tamano_bytes: lista[0].tamano_bytes ?? null,
        estado: 'entregado' as EstadoDocumento,
        fecha_entrega: ahora,
      };

      if (doc) {
        await actualizar('documentos_candidato', doc.id, comun);
      } else {
        await crear('documentos_candidato', {
          postulacion_id: postulacion.id,
          candidato_id: postulacion.candidato_id,
          candidato_nombre: postulacion.candidato_nombre,
          clave: catalogo.clave,
          seccion: catalogo.seccion,
          nombre: catalogo.nombre,
          observaciones: '',
          verificado_en: null,
          verificado_por_uid: null,
          verificado_por_nombre: null,
          ...comun,
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

  async function quitarArchivo(idx: number) {
    if (!doc) return;
    const lista = archivos.filter((_, i) => i !== idx);
    try {
      await actualizar('documentos_candidato', doc.id, {
        archivos: lista,
        archivo_url: lista[0]?.url ?? null,
        nombre_archivo: lista[0]?.nombre ?? null,
        tamano_bytes: lista[0]?.tamano_bytes ?? null,
        estado: lista.length ? 'entregado' : 'pendiente',
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos quitar el archivo.');
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
    <li className="px-5 py-4 flex items-start gap-3 hover:bg-slate-50/40 transition-colors">
      <div className="mt-0.5 flex-shrink-0">
        {estado === 'verificado' ? (
          <div className="h-8 w-8 rounded-md bg-success-50 flex items-center justify-center">
            <Check size={15} strokeWidth={2} className="text-success-700" />
          </div>
        ) : estado === 'no_aplica' ? (
          <div className="h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center">
            <X size={15} strokeWidth={1.75} className="text-text-subtle" />
          </div>
        ) : estado === 'entregado' ? (
          <div className="h-8 w-8 rounded-md bg-warning-50 flex items-center justify-center">
            <FileText size={15} strokeWidth={1.75} className="text-warning-700" />
          </div>
        ) : (
          <div className="h-8 w-8 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <FileText size={15} strokeWidth={1.5} className="text-text-subtle" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-text-strong">{catalogo.nombre}</span>
          {catalogo.opcional && (
            <span className="text-[10px] uppercase tracking-[0.06em] text-text-subtle font-bold">
              Si aplica
            </span>
          )}
          {esMultiple && (
            <span className="text-[10px] uppercase tracking-[0.06em] text-info-700 font-bold">
              Varios archivos
            </span>
          )}
          {esGH && estado === 'pendiente' ? (
            <Pill tono="neutral" dot>
              Gestión de GH
            </Pill>
          ) : (
            <Pill tono={ESTADO_TONO[estado]} dot>
              {ESTADO_LABEL[estado]}
            </Pill>
          )}
        </div>
        {esGH && estado === 'pendiente' && (
          <p className="text-[11px] text-warning-700 mt-1">
            Omitir — este documento lo gestiona directamente Gestión Humana.
          </p>
        )}
        {catalogo.ayuda && (
          <p className="text-[11px] text-text-muted mt-1">{catalogo.ayuda}</p>
        )}
        {catalogo.plantilla_oficial && (
          <a
            href={catalogo.plantilla_oficial}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            <FileText size={11} strokeWidth={1.5} />
            Descargar formato oficial
          </a>
        )}
        {/* Archivo(s) */}
        {esMultiple ? (
          archivos.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {archivos.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px]">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-800 hover:underline font-medium truncate"
                  >
                    <FileText size={11} strokeWidth={1.5} className="shrink-0" />
                    {a.nombre}
                  </a>
                  <button
                    onClick={() => quitarArchivo(i)}
                    className="text-text-subtle hover:text-danger-700 shrink-0"
                    title="Quitar archivo"
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          doc?.archivo_url && (
            <a
              href={doc.archivo_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
            >
              <FileText size={11} strokeWidth={1.5} />
              {doc.nombre_archivo ?? 'Ver archivo'}
            </a>
          )
        )}
        {doc?.observaciones && (
          <p className="text-[12px] text-text-muted mt-1 italic">"{doc.observaciones}"</p>
        )}
        {doc?.estado === 'verificado' && doc.verificado_en && (
          <p className="text-[10px] text-text-subtle mt-1 inline-flex items-center gap-1">
            <Check size={10} strokeWidth={2} className="text-success-600" />
            Verificado por {doc.verificado_por_nombre ?? '—'} el{' '}
            {formatearFecha(doc.verificado_en.toDate())}
          </p>
        )}
        {subiendo && (
          <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-200 ease-out"
              style={{ width: `${progreso}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {(estado === 'pendiente' || esMultiple) && (
          <>
            <label
              htmlFor={inputId}
              className={cn(
                'cursor-pointer inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150',
                esGH && estado === 'pendiente'
                  ? 'border border-slate-300 bg-white text-text-muted hover:bg-slate-50'
                  : 'bg-brand-600 text-white hover:bg-brand-500',
              )}
            >
              <Upload size={11} strokeWidth={1.75} />
              {esMultiple ? 'Agregar archivo' : esGH ? 'Subir (opcional)' : 'Subir'}
            </label>
            <input
              id={inputId}
              type="file"
              className="hidden"
              onChange={subirArchivo}
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
            {catalogo.opcional && estado === 'pendiente' && (
              <button
                onClick={marcarNoAplica}
                className="text-[11px] text-text-muted hover:text-text-strong hover:underline"
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
              className="inline-flex items-center gap-1.5 rounded-md bg-success-600 text-white px-3 py-1.5 text-[12px] font-semibold hover:bg-success-700 transition-colors duration-150"
            >
              <Check size={11} strokeWidth={1.75} />
              Verificar
            </button>
            {!esMultiple && (
              <>
                <label
                  htmlFor={inputId}
                  className="cursor-pointer text-[11px] text-text-muted hover:text-text-strong hover:underline"
                >
                  Reemplazar
                </label>
                <input
                  id={inputId}
                  type="file"
                  className="hidden"
                  onChange={subirArchivo}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                />
              </>
            )}
          </>
        )}
        {estado === 'verificado' && (
          <button
            onClick={reabrir}
            className="text-[11px] text-text-muted hover:text-text-strong hover:underline"
          >
            Reabrir
          </button>
        )}
        {estado === 'no_aplica' && (
          <button
            onClick={reabrir}
            className="text-[11px] text-text-muted hover:text-text-strong hover:underline"
          >
            Reactivar
          </button>
        )}
      </div>
    </li>
  );
}
