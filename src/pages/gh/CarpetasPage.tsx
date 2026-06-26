import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  FolderOpen,
  RefreshCw,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import {
  CATALOGO_DOCUMENTOS_CARPETA,
  SECCIONES_LABEL,
  type DocumentoCandidatoDoc,
  type EstadoDocumento,
  type PostulacionDoc,
  type SeccionDocumento,
} from '../../schemas';

/**
 * CarpetasPage · sistema brand.
 *
 * Pasos 18-19 del flujograma:
 *  - 18 · Analista organiza la carpeta digital del candidato apto médico.
 *  - 19 · GH la recibe, observa o aprueba para cerrar la vacante (paso 20).
 *
 * Decisión 2026-05-24: la carpeta es una VISTA CONSOLIDADA read-only sobre
 * `documentos_candidato` (que se cargan en el tab Documentos de la postulación
 * durante el paso 10). NO hay checklist paralelo manual. La completitud se
 * calcula de los documentos reales. Si falta algo, GH usa "Observar" y el
 * analista corrige en el tab Documentos de la postulación — fuente única de
 * verdad. Esto elimina la doble carga manual del diseño previo.
 */

interface CarpetaDoc {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  vacante_id: string;
  estado: string;
  candidato_nombre?: string;
  cargo_nombre?: string;
  vacante_consecutivo?: string;
  empresa_codigo?: string;
  sede_codigo?: string;
  entregada_en: Timestamp | null;
  aprobada_en: Timestamp | null;
  observaciones_gh: string | null;
  drive_sincronizada_en?: Timestamp | null;
  drive_error?: string | null;
  drive_carpeta_id?: string | null;
  [k: string]: unknown;
}

const ESTADO_TONO: Record<string, PillTono> = {
  armando: 'neutral',
  lista: 'info',
  entregada_gh: 'warning',
  observada: 'warning',
  aprobada: 'success',
};

const DOC_ESTADO_TONO: Record<EstadoDocumento, PillTono> = {
  pendiente: 'neutral',
  entregado: 'warning',
  verificado: 'success',
  no_aplica: 'neutral',
};

const DOC_ESTADO_LABEL: Record<EstadoDocumento, string> = {
  pendiente: 'Pendiente',
  entregado: 'Sin verificar',
  verificado: 'Verificado',
  no_aplica: 'No aplica',
};

const SECCIONES: SeccionDocumento[] = ['generales', 'seguridad_social', 'hoja_vida'];

export default function CarpetasPage() {
  const { docs: carpetas, cargando } = useColeccion<CarpetaDoc>('carpetas_digitales', {
    orden: ['creado_en', 'desc'],
  });
  const { docs: postulacionesEnContratacion } = useColeccion<PostulacionDoc>(
    'postulaciones',
    { filtros: [['estado', '==', 'en_contratacion']] },
  );
  // Una sola lectura de documentos_candidato; agrupamos en cliente.
  // Si crece a miles esto se debe paginar por postulacion_id.
  const { docs: todosDocumentos } = useColeccion<DocumentoCandidatoDoc>('documentos_candidato');
  const { docs: todasPostulaciones } = useColeccion<PostulacionDoc>('postulaciones');
  const postPorId = useMemo(
    () => new Map(todasPostulaciones.map((p) => [p.id, p])),
    [todasPostulaciones],
  );
  const docsPorPostulacion = useMemo(() => {
    const m = new Map<string, DocumentoCandidatoDoc[]>();
    for (const d of todosDocumentos) {
      const arr = m.get(d.postulacion_id) ?? [];
      arr.push(d);
      m.set(d.postulacion_id, arr);
    }
    return m;
  }, [todosDocumentos]);

  // BUG 3 · 1 contratado por vacante: vacante_id → postulacion_id ya contratada.
  // Sirve para deshabilitar "Aprobar" en las otras carpetas de la misma vacante
  // (defensa en UI; el server lo refuerza en la callable + reglas).
  const contratadoPorVacante = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of todasPostulaciones) {
      if (p.estado === 'contratado') m.set(p.vacante_id, p.id);
    }
    return m;
  }, [todasPostulaciones]);

  const { crear, actualizar } = useMutacion();
  const { user, perfil } = useAuth();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [verificandoDoc, setVerificandoDoc] = useState<string | null>(null);

  /** C.2 · GH valida el documento sin salir de la carpeta (ni descargar). */
  async function verificarDoc(docId: string) {
    setVerificandoDoc(docId);
    try {
      await actualizar('documentos_candidato', docId, {
        estado: 'verificado',
        verificado_en: Timestamp.now(),
        verificado_por_uid: user?.uid ?? null,
        verificado_por_nombre: perfil ? `${perfil.nombre} ${perfil.apellido}` : null,
      });
    } finally {
      setVerificandoDoc(null);
    }
  }
  // Por default todas colapsadas; el usuario abre las que quiera revisar.
  // Evita que la página crezca a la altura de 18 docs × N carpetas.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  function toggleExpandir(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resolverInfo(c: CarpetaDoc) {
    const post = postPorId.get(c.postulacion_id);
    return {
      candidato: c.candidato_nombre ?? post?.candidato_nombre ?? 'Candidato sin nombre',
      cargo: c.cargo_nombre ?? post?.cargo_nombre ?? null,
      consecutivo: c.vacante_consecutivo ?? post?.vacante_consecutivo ?? null,
      empresa: c.empresa_codigo ?? null,
      sede: c.sede_codigo ?? null,
    };
  }

  /**
   * Calcula completitud real de la carpeta basado en documentos_candidato.
   * Si un obligatorio no tiene doc o está en estado != verificado/no_aplica,
   * cuenta como faltante.
   */
  function calcularCompletitud(postulacionId: string) {
    const docs = docsPorPostulacion.get(postulacionId) ?? [];
    const docsPorClave = new Map(docs.map((d) => [d.clave, d]));
    const verif = (cat: { clave: string }) => {
      const d = docsPorClave.get(cat.clave);
      return d?.estado === 'verificado' || d?.estado === 'no_aplica';
    };
    const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 100);
    // BUG 2 · completitud en DOS niveles. La parte de CyD (Atracción) gobierna la
    // entrega/aprobación; la de GH (contrato, afiliaciones) se muestra aparte y NO
    // la bloquea — antes los 4 docs de GH dejaban la carpeta topada en ~69%.
    const oblCyD = CATALOGO_DOCUMENTOS_CARPETA.filter((c) => !c.opcional && c.responsable !== 'gh');
    const oblGH = CATALOGO_DOCUMENTOS_CARPETA.filter((c) => !c.opcional && c.responsable === 'gh');
    const verifCyD = oblCyD.filter(verif).length;
    const verifGH = oblGH.filter(verif).length;
    return {
      // Compat: `verificados/total/porcentaje` = parte de CyD (gobierna los gates).
      verificados: verifCyD,
      total: oblCyD.length,
      porcentaje: pct(verifCyD, oblCyD.length),
      gh: { verificados: verifGH, total: oblGH.length, porcentaje: pct(verifGH, oblGH.length) },
      pendientesGH: oblGH.filter((c) => !verif(c)).map((c) => c.nombre),
      docsPorClave,
    };
  }

  async function crearCarpeta(p: PostulacionDoc) {
    setProcesando(p.id);
    await crear('carpetas_digitales', {
      postulacion_id: p.id,
      candidato_id: p.candidato_id,
      vacante_id: p.vacante_id,
      candidato_nombre: p.candidato_nombre,
      cargo_nombre: p.cargo_nombre,
      vacante_consecutivo: p.vacante_consecutivo,
      estado: 'armando',
      entregada_en: null,
      entregada_a_uid: null,
      observaciones_gh: null,
      aprobada_en: null,
    });
    setProcesando(null);
  }

  async function marcarLista(c: CarpetaDoc) {
    await actualizar('carpetas_digitales', c.id, { estado: 'lista' });
  }

  async function entregar(c: CarpetaDoc) {
    await actualizar('carpetas_digitales', c.id, {
      estado: 'entregada_gh',
      entregada_en: Timestamp.now(),
      entregada_a_uid: user?.uid ?? null,
    });
    await actualizar('postulaciones', c.postulacion_id, {
      'marcas.carpeta_entregada_en': Timestamp.now(),
    });
  }

  async function observar(c: CarpetaDoc, e: FormEvent) {
    e.preventDefault();
    const obs = window.prompt('Observaciones a corregir:');
    if (!obs) return;
    await actualizar('carpetas_digitales', c.id, {
      estado: 'observada',
      observaciones_gh: obs,
    });
  }

  async function volverAArmar(c: CarpetaDoc) {
    await actualizar('carpetas_digitales', c.id, {
      estado: 'armando',
      observaciones_gh: null,
    });
  }

  /**
   * Aprobar = contratar + cerrar vacante + tickets (paso 20). Toda la lógica
   * crítica vive en la Cloud Function `aprobarCarpeta` (transaccional): valida
   * server-side que solo haya UN contratado por vacante (BUG 3) y cierra la
   * vacante de forma atómica (BUG 4). La UI solo invoca y refleja el resultado.
   */
  async function aprobar(c: CarpetaDoc) {
    if (procesando) return; // guard anti doble-clic
    setProcesando(c.id);
    try {
      const fn = httpsCallable<
        { carpeta_id: string },
        { ok: true; yaContratado: boolean; tickets: number }
      >(functions, 'aprobarCarpeta');
      await fn({ carpeta_id: c.id });
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'No se pudo aprobar la carpeta. Intenta de nuevo.',
      );
    } finally {
      setProcesando(null);
    }
  }

  /** Reintento manual del depósito a Drive (cuando la sync automática falló). */
  async function reintentarDrive(c: CarpetaDoc) {
    if (procesando) return;
    setProcesando(c.id);
    try {
      const fn = httpsCallable<{ carpeta_id: string }, { ok: true; subidos: number }>(
        functions,
        'sincronizarCarpetaDrive',
      );
      const res = await fn({ carpeta_id: c.id });
      window.alert(`Carpeta depositada en la Unidad Compartida (${res.data.subidos} archivo(s)).`);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'No se pudo sincronizar a Drive. Intenta de nuevo.',
      );
    } finally {
      setProcesando(null);
    }
  }

  const postSinCarpeta = postulacionesEnContratacion.filter(
    (p) => !carpetas.some((c) => c.postulacion_id === p.id),
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Pasos 18 – 19 · Analista + GH
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Carpetas digitales
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Vista consolidada de los documentos del integrante apto médico. Los archivos viven en
          la postulación (tab Documentos, paso 10) — aquí GH solo valida que todo esté completo
          antes de cerrar la vacante y disparar los tickets del paso 20.
        </p>
      </div>

      {/* Aptos sin carpeta · alerta */}
      {postSinCarpeta.length > 0 && (
        <Card padding="lg" className="border-info-500/30 bg-info-50/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-info-100 text-info-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[15px] font-semibold text-text-strong">
                  Integrantes aptos sin carpeta
                </h2>
                <Pill tono="info">
                  <span className="tabular-nums">{postSinCarpeta.length}</span>
                </Pill>
              </div>
              <p className="text-[12px] text-text-muted mt-1">
                Estos integrantes ya pasaron exámenes médicos. Abre la carpeta para validar
                documentos y avanzar al paso 19.
              </p>
              <ul className="mt-4 divide-y divide-info-500/15">
                {postSinCarpeta.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-text-strong inline-flex items-center gap-1.5">
                        <User size={12} strokeWidth={1.5} className="text-text-subtle" />
                        {p.candidato_nombre}
                      </p>
                      {(p.cargo_nombre || p.vacante_consecutivo) && (
                        <p className="text-[11px] text-text-muted mt-0.5 ml-[18px]">
                          {p.vacante_consecutivo && (
                            <span className="font-mono">{p.vacante_consecutivo}</span>
                          )}
                          {p.vacante_consecutivo && p.cargo_nombre && ' · '}
                          {p.cargo_nombre}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => crearCarpeta(p)}
                      disabled={procesando === p.id}
                      loading={procesando === p.id}
                      variant="brand-primary"
                      size="small"
                      icon={<FolderOpen size={11} strokeWidth={1.75} />}
                    >
                      Abrir carpeta
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {!cargando && carpetas.length === 0 && postSinCarpeta.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[14px] font-medium text-text-strong">Sin carpetas en proceso</p>
          <p className="text-[12px] text-text-muted mt-1">
            Cuando aparezca un integrante apto médico, podrás armar su carpeta acá.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {carpetas.map((c) => {
          const tono = ESTADO_TONO[c.estado] ?? 'neutral';
          const info = resolverInfo(c);
          const completitud = calcularCompletitud(c.postulacion_id);
          const post = postPorId.get(c.postulacion_id) as unknown as Record<string, unknown> | undefined;
          const consentimientosFirmados = [
            {
              etiqueta: 'Acuerdo de uso de imagen y voz',
              url: String(post?.consentimiento_imagen_firma_url ?? ''),
            },
            {
              etiqueta: 'Autorización de tratamiento de datos',
              url: String(post?.consentimiento_datos_firma_url ?? ''),
            },
          ].filter((x) => x.url);
          const abierta = expandidas.has(c.id);
          // BUG 3 · ya hay otro contratado en esta vacante → no se puede aprobar.
          const contratadoOtro = contratadoPorVacante.get(c.vacante_id);
          const bloqueadoPorContratado =
            !!contratadoOtro && contratadoOtro !== c.postulacion_id;

          return (
            <Card key={c.id} padding="lg">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
                <div className="min-w-0 flex-1">
                  {info.consecutivo && (
                    <p className="text-[10px] uppercase tracking-[0.06em] text-text-subtle font-mono">
                      {info.consecutivo}
                      {info.cargo && (
                        <span className="text-text-subtle normal-case tracking-normal font-sans">
                          {' · '}
                          {info.cargo}
                        </span>
                      )}
                    </p>
                  )}
                  <Link
                    to={`/postulaciones/${c.postulacion_id}`}
                    className="group inline-block mt-1"
                  >
                    <h3 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong group-hover:text-brand-700 transition-colors inline-flex items-center gap-2">
                      <User size={14} strokeWidth={1.5} className="text-text-subtle" />
                      {info.candidato}
                    </h3>
                  </Link>
                  {(info.empresa || info.sede) && (
                    <p className="text-[11px] text-text-muted mt-1 inline-flex items-center gap-1.5">
                      <Building2 size={11} strokeWidth={1.5} className="text-text-subtle" />
                      <span className="font-mono">
                        {info.empresa}
                        {info.sede && ` / ${info.sede}`}
                      </span>
                    </p>
                  )}
                  <p className="text-[12px] text-text-muted mt-2 inline-flex items-center gap-2 flex-wrap">
                    {c.entregada_en && (
                      <span className="tabular-nums">
                        entregada {formatearFecha(c.entregada_en.toDate())}
                      </span>
                    )}
                    {c.aprobada_en && (
                      <>
                        {c.entregada_en && <span className="text-text-subtle">·</span>}
                        <span className="tabular-nums text-success-700 font-medium">
                          aprobada {formatearFecha(c.aprobada_en.toDate())}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Pill tono={tono} dot>
                  {c.estado.replace(/_/g, ' ')}
                </Pill>
              </div>

              {/* Progreso · dos niveles (BUG 2): CyD (Atracción) gobierna; GH aparte */}
              <div className="mb-5 space-y-3">
                <BarraCompletitud
                  etiqueta="Cultura y Desarrollo"
                  verificados={completitud.verificados}
                  total={completitud.total}
                  porcentaje={completitud.porcentaje}
                />
                <BarraCompletitud
                  etiqueta="Gestión Humana"
                  verificados={completitud.gh.verificados}
                  total={completitud.gh.total}
                  porcentaje={completitud.gh.porcentaje}
                  tenue
                />
                {completitud.porcentaje === 100 && completitud.pendientesGH.length > 0 && (
                  <div className="rounded-md border border-warning-500/30 bg-warning-50/60 px-3 py-2 text-[11px] text-warning-800">
                    <span className="font-semibold">Pendiente de Gestión Humana:</span>{' '}
                    {completitud.pendientesGH.join(', ')}. GH ya recibió el aviso para
                    cargarlos/validarlos.
                  </div>
                )}
              </div>

              {/* Toggle expandir/colapsar el detalle de documentos */}
              <button
                type="button"
                onClick={() => toggleExpandir(c.id)}
                className={cn(
                  'w-full inline-flex items-center justify-between gap-2',
                  'rounded-md px-3 py-2 text-[12px] font-medium',
                  'border border-slate-200 bg-slate-50/60 hover:bg-slate-100/60',
                  'transition-colors',
                )}
                aria-expanded={abierta}
              >
                <span className="inline-flex items-center gap-2 text-text-body">
                  <FileText size={13} strokeWidth={1.75} className="text-text-subtle" />
                  {abierta ? 'Ocultar detalle de documentos' : 'Ver detalle de los 18 documentos'}
                </span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.75}
                  className={cn(
                    'text-text-muted transition-transform duration-200 ease-cult',
                    abierta && 'rotate-180',
                  )}
                />
              </button>

              {/* Documentos reales agrupados por sección · colapsable */}
              {abierta && (
                <div className="space-y-5 mt-4">
                  {SECCIONES.map((sec) => {
                    const items = CATALOGO_DOCUMENTOS_CARPETA.filter((d) => d.seccion === sec);
                    return (
                      <div key={sec}>
                        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted mb-2">
                          {SECCIONES_LABEL[sec]}
                        </p>
                        <ul className="rounded-md border border-slate-200 overflow-hidden divide-y divide-slate-100">
                          {items.map((cat) => {
                            const doc = completitud.docsPorClave.get(cat.clave);
                            const estado: EstadoDocumento = doc?.estado ?? 'pendiente';
                            const tonoDoc = DOC_ESTADO_TONO[estado];
                            const verificadoOk = estado === 'verificado';
                            const noAplica = estado === 'no_aplica';
                            return (
                              <li
                                key={cat.clave}
                                className="px-3.5 py-2.5 flex items-center gap-3 bg-white hover:bg-slate-50/40 transition-colors"
                              >
                                <FileText
                                  size={13}
                                  strokeWidth={1.5}
                                  className={cn(
                                    'shrink-0',
                                    verificadoOk
                                      ? 'text-success-600'
                                      : noAplica
                                        ? 'text-text-subtle'
                                        : estado === 'entregado'
                                          ? 'text-warning-600'
                                          : 'text-text-subtle',
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={cn(
                                      'text-[13px]',
                                      verificadoOk
                                        ? 'text-text-strong font-medium'
                                        : 'text-text-body',
                                    )}
                                  >
                                    {cat.nombre}
                                    {cat.opcional && (
                                      <span className="ml-2 text-[10px] text-text-subtle uppercase tracking-wide">
                                        opcional
                                      </span>
                                    )}
                                  </p>
                                  {doc?.verificado_por_nombre && verificadoOk && (
                                    <p className="text-[10px] text-text-subtle mt-0.5">
                                      Verificado por {doc.verificado_por_nombre}
                                      {doc.verificado_en &&
                                        ` · ${formatearFecha(doc.verificado_en.toDate())}`}
                                    </p>
                                  )}
                                </div>
                                {doc?.archivo_url && (
                                  <a
                                    href={doc.archivo_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
                                  >
                                    <ExternalLink size={10} strokeWidth={1.75} />
                                    Ver PDF
                                  </a>
                                )}
                                {estado === 'entregado' && doc && (
                                  <button
                                    onClick={() => verificarDoc(doc.id)}
                                    disabled={verificandoDoc === doc.id}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-success-700 hover:text-success-800 hover:underline disabled:opacity-50"
                                  >
                                    <CheckCircle2 size={11} strokeWidth={1.75} />
                                    {verificandoDoc === doc.id ? 'Validando…' : 'Validar'}
                                  </button>
                                )}
                                <Pill tono={tonoDoc}>{DOC_ESTADO_LABEL[estado]}</Pill>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                  {consentimientosFirmados.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted mb-2">
                        Consentimientos firmados · portal
                      </p>
                      <ul className="rounded-md border border-slate-200 overflow-hidden divide-y divide-slate-100">
                        {consentimientosFirmados.map((cs) => (
                          <li
                            key={cs.etiqueta}
                            className="px-3.5 py-2.5 flex items-center gap-3 bg-white hover:bg-slate-50/40 transition-colors"
                          >
                            <FileText
                              size={13}
                              strokeWidth={1.5}
                              className="shrink-0 text-success-600"
                            />
                            <p className="min-w-0 flex-1 text-[13px] text-text-body">
                              {cs.etiqueta}
                            </p>
                            <a
                              href={cs.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
                            >
                              <ExternalLink size={10} strokeWidth={1.75} />
                              Ver PDF
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Observación de GH */}
              {c.observaciones_gh && (
                <div className="mt-5 rounded-md border border-warning-500/30 bg-warning-50/40 px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-warning-700">
                    GH observó
                  </p>
                  <p className="text-[12px] text-warning-700 mt-1 italic">
                    {c.observaciones_gh}
                  </p>
                </div>
              )}

              {/* Depósito en la Unidad Compartida de GH (Drive) */}
              {c.drive_sincronizada_en ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-success-700">
                  <CheckCircle2 size={12} strokeWidth={1.75} />
                  Depositada en la Unidad Compartida de GH
                </p>
              ) : (
                c.drive_error && (
                  <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-rose-700">
                      No se pudo depositar en Drive
                    </p>
                    <p className="text-[12px] text-rose-700 mt-1">{String(c.drive_error)}</p>
                    <button
                      onClick={() => reintentarDrive(c)}
                      disabled={!!procesando}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <RefreshCw size={12} strokeWidth={1.75} />
                      Reintentar Drive
                    </button>
                  </div>
                )
              )}

              {/* Acciones según estado */}
              <div className="flex gap-2 justify-between flex-wrap items-center mt-5 pt-4 border-t border-slate-100">
                <Link
                  to={`/postulaciones/${c.postulacion_id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
                >
                  Ir al tab Documentos para subir/verificar
                  <ArrowRight size={11} strokeWidth={1.75} />
                </Link>

                <div className="flex gap-2 flex-wrap">
                  {c.estado === 'armando' && (
                    <Button
                      onClick={() => marcarLista(c)}
                      disabled={completitud.porcentaje < 100}
                      variant="neutral-secondary"
                      size="medium"
                      icon={<CheckCircle2 size={13} strokeWidth={1.75} />}
                    >
                      {completitud.porcentaje < 100
                        ? `Faltan ${completitud.total - completitud.verificados} obligatorios`
                        : 'Marcar lista'}
                    </Button>
                  )}
                  {c.estado === 'observada' && (
                    <Button
                      onClick={() => volverAArmar(c)}
                      variant="neutral-secondary"
                      size="medium"
                    >
                      Volver a armar
                    </Button>
                  )}
                  {c.estado === 'lista' && (
                    <Button
                      onClick={() => entregar(c)}
                      disabled={completitud.porcentaje < 100}
                      variant="brand-primary"
                      size="medium"
                      icon={<Send size={13} strokeWidth={1.75} />}
                    >
                      Entregar a GH · paso 19
                    </Button>
                  )}
                  {c.estado === 'entregada_gh' && (
                    <>
                      <Button
                        onClick={(e) => observar(c, e)}
                        variant="destructive-secondary"
                        size="medium"
                        icon={<AlertTriangle size={13} strokeWidth={1.75} />}
                      >
                        Observar
                      </Button>
                      {bloqueadoPorContratado ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-warning-700 font-medium">
                          <AlertTriangle size={13} strokeWidth={1.75} />
                          Ya hay un contratado en esta vacante
                        </span>
                      ) : (
                        <Button
                          onClick={() => aprobar(c)}
                          disabled={procesando === c.id}
                          loading={procesando === c.id}
                          variant="brand-primary"
                          size="medium"
                          icon={<Sparkles size={13} strokeWidth={1.75} />}
                        >
                          Aprobar y cerrar el proceso · paso 20
                        </Button>
                      )}
                    </>
                  )}
                  {c.estado === 'aprobada' && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
                      <CheckCircle2 size={13} strokeWidth={1.75} />
                      Ingreso completo · vacante cerrada
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Barra de completitud por responsable (CyD / GH) — BUG 2. */
function BarraCompletitud({
  etiqueta,
  verificados,
  total,
  porcentaje,
  tenue,
}: {
  etiqueta: string;
  verificados: number;
  total: number;
  porcentaje: number;
  tenue?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-[12px]">
        <span className="text-text-muted">
          <span className="font-semibold text-text-strong">{etiqueta}</span>{' '}
          <span className="tabular-nums">
            · {verificados}/{total} verificados
          </span>
        </span>
        <span
          className={cn(
            'font-bold tabular-nums',
            porcentaje === 100 ? 'text-success-700' : tenue ? 'text-text-muted' : 'text-brand-700',
          )}
        >
          {porcentaje}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300 ease-cult',
            porcentaje === 100 ? 'bg-success-500' : tenue ? 'bg-slate-400' : 'bg-brand-600',
          )}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
