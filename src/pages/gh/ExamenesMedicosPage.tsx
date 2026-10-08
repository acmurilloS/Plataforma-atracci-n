import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  HeartPulse,
  RefreshCw,
  Send,
  Stethoscope,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import { functions, storage } from '../../lib/firebase';
import { MB, mensajeErrorSubida, prepararArchivo } from '../../utils/archivos';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { CargandoPagina } from '../../components/ui/CargandoPagina';
import { EncabezadoPagina } from '../../components/ui/EncabezadoPagina';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import type { PostulacionDoc } from '../../schemas';
import { puedeVerPostulacion } from '../../utils/accesoRutas';
import { cn } from '../../utils/cn';

/**
 * ExamenesMedicosPage · sistema brand.
 *
 * Pasos 15-17 del flujograma (reu Karen 09-jul):
 *  - 15 · solicitada (analista al aprobar al candidato)
 *  - 16 · enviada (GH selecciona centro médico y envía la orden al integrante)
 *  - 17 · el GESTOR SST sube el RESULTADO (PDF) + marca sin/con novedad + observa-
 *    ciones + (si aplica) el acta de recomendaciones.
 *      · sin novedad → apto → contratación (automático).
 *      · con novedad → en_revision_cd → don DIEGO (C&D) decide continúa/no-continúa.
 *
 * Roles: gestor (sube resultado), gh/coordinación/admin (envían orden + deciden
 * novedad), analista (solo lectura del resultado, para su seguimiento).
 */

interface ExamenDoc {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  vacante_id: string;
  candidato_nombre?: string;
  cargo_nombre?: string;
  vacante_consecutivo?: string;
  empresa_codigo?: string;
  sede_codigo?: string;
  sede_nombre?: string;
  documento_numero?: string;
  solicitada_en: Timestamp;
  enviada_al_candidato_en: Timestamp | null;
  centro_medico: string | null;
  concepto_recibido_en: Timestamp | null;
  concepto_url: string | null;
  apto: boolean | null;
  recomendaciones: string | null;
  estado: string;
  correo_gestor_enviado_en?: Timestamp | null;
  correo_gestor_error?: string | null;
  correo_gestor_datos_faltantes?: string[];
  orden_url?: string | null;
  orden_direccion?: string | null;
  orden_instrucciones?: string | null;
  orden_correo_candidato_en?: Timestamp | null;
  // Resultado que sube el gestor SST (reu 09-jul).
  resultado_url?: string | null;
  resultado_subido_en?: Timestamp | null;
  novedad?: 'sin_novedad' | 'con_novedad' | null;
  observaciones_gestor?: string | null;
  con_recomendaciones?: boolean;
  acta_recomendaciones_url?: string | null;
  // Decisión de Cultura y Desarrollo (Diego) para una novedad.
  decision_cd?: 'continua' | 'no_continua' | null;
  decision_cd_en?: Timestamp | null;
  decision_cd_obs?: string | null;
  // Persona en condición de discapacidad (reu Karen jul-2026). Cuando requiere
  // autorización de GH, la orden NO salió sola a los gestores: GH la autoriza.
  discapacidad?: boolean;
  discapacidad_observacion?: string | null;
  requiere_autorizacion_gh?: boolean;
  autorizado_gestores_en?: Timestamp | null;
  autorizado_gestores_por?: string | null;
  [k: string]: unknown;
}

const ESTADO_TONO: Record<string, PillTono> = {
  solicitada: 'warning',
  enviada: 'info',
  en_revision_cd: 'warning',
  apto: 'success',
  no_apto: 'danger',
};

const ESTADO_LABEL: Record<string, string> = {
  solicitada: 'solicitada',
  enviada: 'enviada',
  en_revision_cd: 'en revisión C&D',
  apto: 'apto',
  no_apto: 'no apto',
};

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[13px]',
  'text-text-strong placeholder:text-text-subtle focus:bg-white focus:outline-none',
  'focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 transition-colors',
);

// Tipo por contenido + contentType explícito: sin esto, una foto o PDF sin
// extensión subía como "octet-stream" y la regla de Storage lo rechazaba con un
// error en inglés (incidente portal 08-oct; mismo riesgo aquí). utils/archivos.
async function subirArchivoResultado(
  examenId: string,
  file: File,
  sufijo: string,
): Promise<string> {
  const listo = await prepararArchivo(file, { permitidos: ['pdf', 'imagen'], maxBytes: 15 * MB });
  const r = storageRef(storage, `resultados_examenes/${examenId}/${Date.now()}_${sufijo}_${listo.nombreSeguro}`);
  await uploadBytes(r, listo.blob, { contentType: listo.contentType });
  return getDownloadURL(r);
}

// Orden de exámenes (PDF/imagen) que sube quien envía la orden (GH o gestor SST).
async function subirArchivoOrden(examenId: string, file: File): Promise<string> {
  const listo = await prepararArchivo(file, { permitidos: ['pdf', 'imagen'], maxBytes: 8 * MB });
  const r = storageRef(storage, `ordenes_examenes/${examenId}/${Date.now()}_orden_${listo.nombreSeguro}`);
  await uploadBytes(r, listo.blob, { contentType: listo.contentType });
  return getDownloadURL(r);
}

export default function ExamenesMedicosPage() {
  const { rol } = useAuth();
  const esGestor = rol === 'gestor';
  const esGH = rol === 'gh' || rol === 'coordinador' || rol === 'admin';
  const puedeEnviarOrden = esGH || esGestor; // paso 16: GH o el gestor SST (reu Karen 28-jul)
  const puedeSubirResultado = esGestor || esGH;
  const puedeDecidir = esGH; // decide la novedad (Diego/Paola/coordinación)

  const { docs, cargando, error: errorExamenes } = useColeccion<ExamenDoc>('examenes_medicos', {
    orden: ['solicitada_en', 'desc'],
  });
  // Si las reglas niegan la lectura (sesión con un rol distinto al de la ficha),
  // antes la página quedaba en "Sin resultados pendientes" y parecía vacía. Se
  // dice explícito para que la persona sepa que es un tema de permisos.
  const sinPermisoLectura = !!errorExamenes && /permission|insufficient/i.test(errorExamenes);
  // El gestor SST NO debe leer todo el pipeline (PII de candidatos que no son de
  // exámenes). La página solo usa `postulaciones` como fallback del nombre, y el
  // doc `examenes_medicos` ya trae candidato_nombre denormalizado — así que para
  // el gestor no suscribimos postulaciones (revisión 16-jul). Las reglas también
  // se lo niegan (leePostulacion ya no incluye al gestor).
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones', {
    habilitado: rol !== 'gestor',
  });
  const postulacionPorId = useMemo(() => {
    const m = new Map<string, PostulacionDoc>();
    for (const p of postulaciones) m.set(p.id, p);
    return m;
  }, [postulaciones]);
  const { actualizar } = useMutacion();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);

  // Deep-link desde el correo a gestores (/examenes-medicos?examen=<id>): hace
  // scroll y resalta ese examen puntual — acceso directo al caso, no a la lista.
  const [searchParams] = useSearchParams();
  const examenFocus = searchParams.get('examen');
  const [resaltado, setResaltado] = useState<string | null>(examenFocus);
  // Si el query cambia con la página ya abierta (clic en la campana estando en
  // Exámenes), se vuelve a resaltar y a ubicar la pestaña del nuevo examen.
  const focusAplicado = useRef(false);
  useEffect(() => {
    setResaltado(examenFocus);
    focusAplicado.current = false;
  }, [examenFocus]);

  // Panel abierto (uno a la vez): enviar orden (16), subir resultado, o decidir.
  const [accion, setAccion] = useState<{
    id: string;
    tipo: 'enviar' | 'resultado' | 'decision';
  } | null>(null);

  // Paso 16 · envío de orden.
  const [centroMedico, setCentroMedico] = useState('Colsanitas');
  const [ordenUrl, setOrdenUrl] = useState('');
  const [direccion, setDireccion] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const ordenFileRef = useRef<HTMLInputElement>(null);

  // Pestañas: "Solicitudes" (falta enviar la orden) vs "Resultados" (orden
  // enviada → subir/ver resultado). Petición gestores (reu 28-jul) para no
  // confundir las tareas.
  const [pestana, setPestana] = useState<'solicitudes' | 'resultados'>('solicitudes');

  // Deep-link desde el correo (/examenes-medicos?examen=<id>): abre la pestaña
  // correcta, hace scroll al examen y lo resalta unos segundos.
  useEffect(() => {
    if (!examenFocus || focusAplicado.current || docs.length === 0) return;
    const ex = docs.find((d) => d.id === examenFocus);
    if (ex) {
      setPestana(ex.estado === 'solicitada' ? 'solicitudes' : 'resultados');
      focusAplicado.current = true;
    }
  }, [examenFocus, docs]);
  // Scroll una sola vez por examen (antes se repetía al cambiar de pestaña o al
  // llegar un snapshot, y el timer del resaltado se cancelaba a mitad).
  const scrollHecho = useRef<string | null>(null);
  const timerResaltado = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!examenFocus || scrollHecho.current === examenFocus) return;
    const el = document.getElementById(`examen-${examenFocus}`);
    if (!el) return;
    scrollHecho.current = examenFocus;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (timerResaltado.current) clearTimeout(timerResaltado.current);
    timerResaltado.current = setTimeout(() => setResaltado(null), 4500);
  }, [examenFocus, pestana, docs.length]);
  useEffect(
    () => () => {
      if (timerResaltado.current) clearTimeout(timerResaltado.current);
    },
    [],
  );

  // Subir resultado (gestor).
  const [novedad, setNovedad] = useState<'sin_novedad' | 'con_novedad' | null>(null);
  const [obsGestor, setObsGestor] = useState('');
  const [conRecomendaciones, setConRecomendaciones] = useState(false);
  const resultadoRef = useRef<HTMLInputElement>(null);
  const actaRef = useRef<HTMLInputElement>(null);

  // Decisión de C&D.
  const [decisionObs, setDecisionObs] = useState('');

  function resolverInfo(ex: ExamenDoc) {
    const post = postulacionPorId.get(ex.postulacion_id);
    return {
      candidato: ex.candidato_nombre ?? post?.candidato_nombre ?? 'Integrante sin nombre',
      cargo: ex.cargo_nombre ?? post?.cargo_nombre ?? null,
      consecutivo: ex.vacante_consecutivo ?? post?.vacante_consecutivo ?? null,
      empresa: ex.empresa_codigo ?? null,
      sede: ex.sede_codigo ?? null,
      cedula: ex.documento_numero || null,
      ciudad: ex.sede_nombre || null,
    };
  }

  async function reenviarGestores(ex: ExamenDoc) {
    setReenviando(ex.id);
    try {
      const fn = httpsCallable<
        { examen_id: string },
        { ok: true; faltantes: string[]; destinatarios: number }
      >(functions, 'reenviarOrdenGestores');
      const res = await fn({ examen_id: ex.id });
      const faltantes = res.data.faltantes ?? [];
      window.alert(
        faltantes.length > 0
          ? `Orden reenviada a los ${res.data.destinatarios} gestores SST.\n\nOjo: faltó ${faltantes.join(', ')}. Complétalo en los Datos Básicos y reenvía.`
          : `Orden reenviada a los ${res.data.destinatarios} gestores SST con los datos completos.`,
      );
    } catch (e) {
      window.alert('No se pudo reenviar a los gestores: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReenviando(null);
    }
  }

  // GH autoriza el envío a gestores de una persona en condición de discapacidad
  // (la orden no salió sola al aprobar el líder). Reusa el mismo spinner de reenvío.
  async function autorizarGestores(ex: ExamenDoc) {
    setReenviando(ex.id);
    try {
      const fn = httpsCallable<
        { examen_id: string },
        { ok: true; faltantes: string[]; destinatarios: number }
      >(functions, 'autorizarGestoresDiscapacidad');
      const res = await fn({ examen_id: ex.id });
      const faltantes = res.data.faltantes ?? [];
      window.alert(
        faltantes.length > 0
          ? `Envío autorizado. La orden salió a los ${res.data.destinatarios} gestores SST.\n\nOjo: faltó ${faltantes.join(', ')}. Complétalo en los Datos Básicos y reenvía.`
          : `Envío autorizado. La orden salió a los ${res.data.destinatarios} gestores SST con los datos completos.`,
      );
    } catch (e) {
      window.alert('No se pudo autorizar el envío: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReenviando(null);
    }
  }

  function abrirEnvio(ex: ExamenDoc) {
    setCentroMedico(ex.centro_medico || 'Colsanitas');
    setOrdenUrl(ex.orden_url || '');
    setDireccion(ex.orden_direccion || '');
    setInstrucciones(ex.orden_instrucciones || '');
    if (ordenFileRef.current) ordenFileRef.current.value = '';
    setAccion({ id: ex.id, tipo: 'enviar' });
  }

  function abrirResultado(ex: ExamenDoc) {
    setNovedad(ex.novedad ?? null);
    setObsGestor(ex.observaciones_gestor || '');
    setConRecomendaciones(!!ex.con_recomendaciones);
    if (resultadoRef.current) resultadoRef.current.value = '';
    if (actaRef.current) actaRef.current.value = '';
    setAccion({ id: ex.id, tipo: 'resultado' });
  }

  function abrirDecision(ex: ExamenDoc) {
    setDecisionObs('');
    setAccion({ id: ex.id, tipo: 'decision' });
  }

  function cerrarAccion() {
    setAccion(null);
  }

  async function confirmarEnvio(ex: ExamenDoc) {
    if (!centroMedico.trim()) return;
    setProcesando(ex.id);
    try {
      // Si el gestor/GH sube el PDF de la orden, se guarda en Storage; si no,
      // se usa la URL pegada (o la que ya tenía).
      const ordenFile = ordenFileRef.current?.files?.[0] ?? null;
      let urlOrden = ordenUrl.trim();
      if (ordenFile) urlOrden = await subirArchivoOrden(ex.id, ordenFile);
      await actualizar('examenes_medicos', ex.id, {
        centro_medico: centroMedico.trim(),
        orden_url: urlOrden || null,
        orden_direccion: direccion.trim(),
        orden_instrucciones: instrucciones.trim(),
        enviada_al_candidato_en: Timestamp.now(),
        estado: 'enviada',
      });
      const fn = httpsCallable<{ examen_id: string }, { ok: true; email_destinatario: string }>(
        functions,
        'enviarOrdenExamenCandidato',
      );
      const res = await fn({ examen_id: ex.id });
      window.alert(`Orden enviada al integrante (${res.data.email_destinatario}).`);
      setAccion(null);
    } catch (e) {
      window.alert('No se pudo enviar la orden: ' + mensajeErrorSubida(e, 'inténtalo de nuevo.'));
    } finally {
      setProcesando(null);
    }
  }

  async function confirmarResultado(ex: ExamenDoc) {
    if (!novedad) {
      window.alert('Marca si el examen es SIN novedad o CON novedad.');
      return;
    }
    const resultadoFile = resultadoRef.current?.files?.[0] ?? null;
    const actaFile = actaRef.current?.files?.[0] ?? null;
    if (!resultadoFile && !ex.resultado_url) {
      window.alert('Sube el PDF del resultado del examen.');
      return;
    }
    if (conRecomendaciones && !actaFile && !ex.acta_recomendaciones_url) {
      window.alert('Marcaste "con recomendaciones": sube el acta de recomendaciones.');
      return;
    }
    setProcesando(ex.id);
    try {
      let resultadoUrl = ex.resultado_url || '';
      if (resultadoFile) resultadoUrl = await subirArchivoResultado(ex.id, resultadoFile, 'resultado');
      let actaUrl = ex.acta_recomendaciones_url || '';
      if (conRecomendaciones && actaFile) actaUrl = await subirArchivoResultado(ex.id, actaFile, 'acta');

      const fn = httpsCallable<
        {
          examen_id: string;
          novedad: string;
          observaciones: string;
          con_recomendaciones: boolean;
          resultado_url: string;
          acta_url: string;
        },
        { ok: true; estado: string }
      >(functions, 'registrarResultadoExamen');
      const res = await fn({
        examen_id: ex.id,
        novedad,
        observaciones: obsGestor.trim(),
        con_recomendaciones: conRecomendaciones,
        resultado_url: resultadoUrl,
        acta_url: actaUrl,
      });
      window.alert(
        res.data.estado === 'apto'
          ? 'Resultado registrado sin novedad. El integrante pasa a contratación.'
          : 'Resultado registrado CON novedad. Se envió a don Diego (C&D) para su decisión.',
      );
      setAccion(null);
    } catch (e) {
      window.alert('No se pudo registrar el resultado: ' + mensajeErrorSubida(e, 'inténtalo de nuevo.'));
    } finally {
      setProcesando(null);
    }
  }

  async function confirmarDecision(ex: ExamenDoc, decision: 'continua' | 'no_continua') {
    setProcesando(ex.id);
    try {
      const fn = httpsCallable<
        { examen_id: string; decision: string; observaciones: string },
        { ok: true; estado: string }
      >(functions, 'decisionCulturaExamen');
      await fn({ examen_id: ex.id, decision, observaciones: decisionObs.trim() });
      window.alert(
        decision === 'continua'
          ? 'Registrado: continúa la contratación.'
          : 'Registrado: no continúa por examen médico.',
      );
      setAccion(null);
    } catch (e) {
      window.alert('No se pudo registrar la decisión: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcesando(null);
    }
  }

  const stats = useMemo(() => {
    return {
      total: docs.length,
      solicitadas: docs.filter((d) => d.estado === 'solicitada').length,
      enviadas: docs.filter((d) => d.estado === 'enviada').length,
      revision: docs.filter((d) => d.estado === 'en_revision_cd').length,
      aptos: docs.filter((d) => d.estado === 'apto').length,
      no_aptos: docs.filter((d) => d.estado === 'no_apto').length,
    };
  }, [docs]);

  if (cargando && docs.length === 0) return <CargandoPagina />;

  const descripcion = esGestor
    ? 'En "Solicitudes" subes y envías la orden al integrante; en "Resultados" cargas el resultado y marcas si viene sin o con novedad. Con novedad, don Diego revisa y decide.'
    : 'GH envía la orden al centro médico. El gestor SST sube el resultado; si viene con novedad, Cultura y Desarrollo decide si continúa la contratación.';

  // Filtro por pestaña: Solicitudes = orden aún sin enviar; Resultados = el resto.
  const docsPestana = docs.filter((d) =>
    pestana === 'solicitudes' ? d.estado === 'solicitada' : d.estado !== 'solicitada',
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <EncabezadoPagina
        icono={<Stethoscope size={26} strokeWidth={1.6} />}
        tono="info"
        eyebrow="Pasos 15 – 17"
        titulo="Exámenes médicos"
        descripcion={descripcion}
      />

      {errorExamenes && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {sinPermisoLectura
            ? `No pudimos cargar los exámenes: tu sesión no tiene permiso para verlos (rol ${
                rol ?? 'sin rol'
              }). Cierra sesión, vuelve a entrar con tu correo Equitel y, si sigue igual, avisa a coordinación.`
            : `No pudimos cargar los exámenes: ${errorExamenes}`}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <MiniStat label="Total" valor={stats.total} icono={<HeartPulse size={14} strokeWidth={1.75} />} />
        <MiniStat label="Solicitadas" valor={stats.solicitadas} tono="warning" />
        <MiniStat label="Enviadas" valor={stats.enviadas} tono="info" />
        <MiniStat label="Revisión C&D" valor={stats.revision} tono="warning" />
        <MiniStat label="Aptos" valor={stats.aptos} tono="success" />
        <MiniStat label="No aptos" valor={stats.no_aptos} tono="danger" />
      </div>

      {/* Pestañas: Solicitudes (enviar orden) / Resultados (subir/ver resultado). */}
      <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {([
          ['solicitudes', 'Solicitudes', stats.solicitadas],
          ['resultados', 'Resultados', stats.total - stats.solicitadas],
        ] as const).map(([clave, label, n]) => (
          <button
            key={clave}
            type="button"
            onClick={() => setPestana(clave)}
            className={
              pestana === clave
                ? 'rounded-md bg-white px-4 py-1.5 text-[13px] font-semibold text-text-strong shadow-sm'
                : 'rounded-md px-4 py-1.5 text-[13px] font-medium text-text-muted hover:text-text-strong'
            }
          >
            {label} <span className="tabular-nums text-text-subtle">({n})</span>
          </button>
        ))}
      </div>

      {!cargando && !errorExamenes && docsPestana.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[14px] font-medium text-text-strong">
            {pestana === 'solicitudes' ? 'Sin órdenes por enviar' : 'Sin resultados pendientes'}
          </p>
          <p className="text-[12px] text-text-muted mt-1">
            {pestana === 'solicitudes'
              ? 'Cuando el líder apruebe un integrante en la terna, aparecerá aquí la solicitud de exámenes.'
              : 'Aquí aparecen los exámenes cuya orden ya se envió, para subir o ver el resultado.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {docsPestana.map((ex) => {
          const tono = ESTADO_TONO[ex.estado] ?? 'neutral';
          const info = resolverInfo(ex);
          const abierto = accion?.id === ex.id;
          return (
            <Card
              key={ex.id}
              id={`examen-${ex.id}`}
              padding="md"
              className={
                resaltado === ex.id
                  ? 'ring-2 ring-brand-500 ring-offset-2 transition-shadow'
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
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
                  <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.012em] text-text-strong inline-flex items-center gap-2">
                    <User size={14} strokeWidth={1.5} className="text-text-subtle shrink-0" />
                    {/* El gestor SST no abre la ficha del integrante: para él es
                        solo texto (antes daba "Sin permisos" — auditoría 14-jul). */}
                    {puedeVerPostulacion(rol) ? (
                      <Link
                        to={`/postulaciones/${ex.postulacion_id}`}
                        className="hover:text-brand-700 transition-colors"
                      >
                        {info.candidato}
                      </Link>
                    ) : (
                      info.candidato
                    )}
                  </h3>
                  {(info.empresa || info.sede) && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                      <Building2 size={11} strokeWidth={1.5} className="text-text-subtle" />
                      <span className="font-mono">
                        {info.empresa}
                        {info.sede && ` / ${info.sede}`}
                      </span>
                    </p>
                  )}
                  {/* Cédula + ciudad: los gestores SST las necesitan para tramitar
                      la orden (reu 28-jul). */}
                  {(info.cedula || info.ciudad) && (
                    <p className="mt-1 text-[11px] text-text-muted">
                      {info.cedula && (
                        <span>
                          CC <span className="tabular-nums font-medium text-text-body">{info.cedula}</span>
                        </span>
                      )}
                      {info.cedula && info.ciudad && ' · '}
                      {info.ciudad && <span>{info.ciudad}</span>}
                    </p>
                  )}
                  <p className="text-[12px] text-text-muted mt-1.5 inline-flex items-center gap-2 flex-wrap">
                    <span className="tabular-nums">Solicitada {formatearFecha(ex.solicitada_en.toDate())}</span>
                    {ex.enviada_al_candidato_en && (
                      <>
                        <span className="text-text-subtle">·</span>
                        <span className="tabular-nums">Enviada {formatearFecha(ex.enviada_al_candidato_en.toDate())}</span>
                      </>
                    )}
                    {ex.centro_medico && (
                      <>
                        <span className="text-text-subtle">·</span>
                        <span className="inline-flex items-center gap-1 text-text-body font-medium">
                          <Stethoscope size={11} strokeWidth={1.75} className="text-text-subtle" />
                          {ex.centro_medico}
                        </span>
                      </>
                    )}
                  </p>
                  {/* Acuse del correo a los gestores SST */}
                  {ex.correo_gestor_error ? (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-danger-700 font-medium">
                      <AlertTriangle size={12} strokeWidth={1.75} />
                      No se pudo avisar a los gestores SST — usa “Reenviar a gestores”
                    </p>
                  ) : ex.correo_gestor_enviado_en ? (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 flex-wrap text-[11px] text-success-700 font-medium">
                      <CheckCircle2 size={12} strokeWidth={1.75} />
                      Gestores SST notificados {formatearFecha(ex.correo_gestor_enviado_en.toDate())}
                    </p>
                  ) : null}
                  {/* Persona en condición de discapacidad · el correo a gestores
                      requiere el visto bueno de GH antes de salir. */}
                  {ex.discapacidad && (
                    <p className="mt-1.5 flex items-start gap-1.5 flex-wrap text-[11px] text-blue-700 font-medium">
                      <span aria-hidden>♿</span>
                      <span>
                        Persona en condición de discapacidad
                        {ex.discapacidad_observacion ? ` · ${ex.discapacidad_observacion}` : ''}
                        {ex.requiere_autorizacion_gh && !ex.autorizado_gestores_en
                          ? ' — pendiente de autorización de GH para enviar a gestores'
                          : ex.autorizado_gestores_en
                            ? ' — envío autorizado'
                            : ''}
                      </span>
                    </p>
                  )}
                </div>
                <Pill tono={tono} dot>
                  {ESTADO_LABEL[ex.estado] ?? ex.estado.replace(/_/g, ' ')}
                </Pill>
              </div>

              {/* Bloque de RESULTADO (lectura) — visible para todos apenas exista. */}
              {ex.resultado_url && <BloqueResultado ex={ex} />}

              {/* Acciones */}
              <div className="mt-4 flex gap-2 justify-end flex-wrap items-center">
                {/* Persona en condición de discapacidad · GH autoriza el envío que
                    no salió solo. Mientras esté pendiente, reemplaza al reenvío. */}
                {ex.requiere_autorizacion_gh && !ex.autorizado_gestores_en && puedeEnviarOrden && (
                  <Button
                    onClick={() => autorizarGestores(ex)}
                    disabled={reenviando === ex.id}
                    loading={reenviando === ex.id}
                    variant="brand-primary"
                    size="small"
                    icon={<CheckCircle2 size={13} strokeWidth={1.75} />}
                  >
                    Autorizar y enviar a gestores
                  </Button>
                )}

                {(ex.estado === 'solicitada' || ex.estado === 'enviada' || ex.correo_gestor_error) &&
                  puedeEnviarOrden &&
                  !(ex.requiere_autorizacion_gh && !ex.autorizado_gestores_en) && (
                    <Button
                      onClick={() => reenviarGestores(ex)}
                      disabled={reenviando === ex.id}
                      loading={reenviando === ex.id}
                      variant="neutral-secondary"
                      size="small"
                      icon={<RefreshCw size={13} strokeWidth={1.75} />}
                    >
                      Reenviar a gestores
                    </Button>
                  )}

                {ex.estado === 'solicitada' && puedeEnviarOrden && !abierto && (
                  <Button
                    onClick={() => abrirEnvio(ex)}
                    disabled={procesando === ex.id}
                    variant="brand-primary"
                    size="medium"
                    icon={<Send size={13} strokeWidth={1.75} />}
                  >
                    Enviar al integrante · paso 16
                  </Button>
                )}

                {/* Orden ya enviada: reprogramar/editar (candidato no asistió, dato
                    errado…) sin recrear todo — reabre el mismo panel y reenvía. */}
                {ex.estado === 'enviada' && puedeEnviarOrden && !abierto && (
                  <Button
                    onClick={() => abrirEnvio(ex)}
                    disabled={procesando === ex.id}
                    variant="neutral-secondary"
                    size="small"
                    icon={<RefreshCw size={13} strokeWidth={1.75} />}
                  >
                    Reprogramar / editar orden
                  </Button>
                )}

                {(ex.estado === 'enviada' || ex.estado === 'solicitada') &&
                  puedeSubirResultado &&
                  !abierto && (
                    <Button
                      onClick={() => abrirResultado(ex)}
                      disabled={procesando === ex.id}
                      variant="brand-primary"
                      size="medium"
                      icon={<Upload size={13} strokeWidth={1.75} />}
                    >
                      Subir resultado
                    </Button>
                  )}

                {ex.estado === 'en_revision_cd' && puedeDecidir && !abierto && (
                  <Button
                    onClick={() => abrirDecision(ex)}
                    disabled={procesando === ex.id}
                    variant="brand-primary"
                    size="medium"
                    icon={<Stethoscope size={13} strokeWidth={1.75} />}
                  >
                    Decidir novedad (C&D)
                  </Button>
                )}

                {ex.estado === 'en_revision_cd' && !puedeDecidir && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-warning-700 font-medium">
                    <AlertTriangle size={12} strokeWidth={1.75} />
                    Con novedad · esperando decisión de Cultura y Desarrollo
                  </span>
                )}

                {ex.estado === 'no_apto' && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-danger-700 font-medium">
                    <XCircle size={12} strokeWidth={1.75} />
                    Integrante descartado por médicos
                  </span>
                )}
                {ex.estado === 'apto' && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
                    <CheckCircle2 size={12} strokeWidth={1.75} />
                    Apto · pasa a contratación
                  </span>
                )}
              </div>

              {/* Panel · enviar orden (paso 16) */}
              {abierto && accion?.tipo === 'enviar' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <p className="text-[12px] font-semibold text-text-strong">
                    {ex.estado === 'enviada'
                      ? 'Reprogramar / editar la orden'
                      : 'Enviar orden al integrante · paso 16'}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-medium text-text-muted mb-1">Centro médico</span>
                      <input value={centroMedico} onChange={(e) => setCentroMedico(e.target.value)} className={inputClass} placeholder="Colsanitas" />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-medium text-text-muted mb-1">URL de la orden (opcional)</span>
                      <input value={ordenUrl} onChange={(e) => setOrdenUrl(e.target.value)} className={inputClass} placeholder="https://…" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">Subir la orden (PDF o imagen)</span>
                    <input ref={ordenFileRef} type="file" accept="application/pdf,image/*" className="block w-full text-[12px] text-text-body file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
                    {ex.orden_url && (
                      <span className="text-[11px] text-text-subtle mt-1 inline-block">Ya hay una orden cargada; sube una nueva solo si la vas a reemplazar.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">Dirección</span>
                    <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputClass} placeholder="Dirección del centro médico" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">Indicaciones (opcional)</span>
                    <textarea value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} rows={2} className={inputClass} placeholder="Ayuno, horario, qué llevar…" />
                  </label>
                  <div className="flex gap-2 justify-end">
                    <Button onClick={cerrarAccion} variant="neutral-secondary" size="small">Cancelar</Button>
                    <Button onClick={() => confirmarEnvio(ex)} disabled={!centroMedico.trim() || procesando === ex.id} loading={procesando === ex.id} variant="brand-primary" size="small" icon={<Send size={13} strokeWidth={1.75} />}>
                      {ex.estado === 'enviada' ? 'Reprogramar y reenviar' : 'Confirmar envío'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Panel · subir resultado (gestor) */}
              {abierto && accion?.tipo === 'resultado' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <p className="text-[12px] font-semibold text-text-strong">Resultado del examen médico</p>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">PDF del resultado</span>
                    <input ref={resultadoRef} type="file" accept="application/pdf,image/*" className="block w-full text-[12px] text-text-body file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
                    {ex.resultado_url && (
                      <span className="text-[11px] text-text-subtle mt-1 inline-block">Ya hay un resultado cargado; sube uno nuevo solo si lo vas a reemplazar.</span>
                    )}
                  </label>
                  <div>
                    <span className="block text-[11px] font-medium text-text-muted mb-1">¿Salió con novedad?</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNovedad('sin_novedad')}
                        className={cn('px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors', novedad === 'sin_novedad' ? 'bg-success-600 text-white border-success-600' : 'bg-white text-text-body border-slate-300 hover:bg-slate-50')}
                      >
                        Sin novedad
                      </button>
                      <button
                        type="button"
                        onClick={() => setNovedad('con_novedad')}
                        className={cn('px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors', novedad === 'con_novedad' ? 'bg-warning-600 text-white border-warning-600' : 'bg-white text-text-body border-slate-300 hover:bg-slate-50')}
                      >
                        Con novedad
                      </button>
                    </div>
                    {novedad === 'con_novedad' && (
                      <p className="text-[11px] text-warning-700 mt-1.5">Con novedad → don Diego (C&D) revisa y decide si continúa la contratación.</p>
                    )}
                  </div>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">Observaciones (opcional)</span>
                    <textarea value={obsGestor} onChange={(e) => setObsGestor(e.target.value)} rows={2} className={inputClass} placeholder="Notas del gestor…" />
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-text-body">
                    <input type="checkbox" checked={conRecomendaciones} onChange={(e) => setConRecomendaciones(e.target.checked)} className="rounded border-slate-300" />
                    Pasa con recomendaciones (subir acta)
                  </label>
                  {conRecomendaciones && (
                    <label className="block">
                      <span className="block text-[11px] font-medium text-text-muted mb-1">Acta de recomendaciones (PDF)</span>
                      <input ref={actaRef} type="file" accept="application/pdf,image/*" className="block w-full text-[12px] text-text-body file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
                    </label>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button onClick={cerrarAccion} variant="neutral-secondary" size="small">Cancelar</Button>
                    <Button onClick={() => confirmarResultado(ex)} disabled={!novedad || procesando === ex.id} loading={procesando === ex.id} variant="brand-primary" size="small" icon={<Upload size={13} strokeWidth={1.75} />}>
                      {procesando === ex.id ? 'Subiendo…' : 'Guardar resultado'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Panel · decisión de C&D (Diego) */}
              {abierto && accion?.tipo === 'decision' && (
                <div className="mt-4 rounded-lg border border-warning-300 bg-warning-50/40 p-4 space-y-3">
                  <p className="text-[12px] font-semibold text-text-strong">Decisión de Cultura y Desarrollo</p>
                  <p className="text-[12px] text-text-muted">
                    El examen salió con novedad. Revisa el resultado y decide si la contratación continúa.
                  </p>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">Observaciones (opcional)</span>
                    <textarea value={decisionObs} onChange={(e) => setDecisionObs(e.target.value)} rows={2} className={inputClass} placeholder="Motivo / condiciones de la decisión…" />
                  </label>
                  <div className="flex gap-2 justify-end">
                    <Button onClick={cerrarAccion} variant="neutral-secondary" size="small">Cancelar</Button>
                    <Button onClick={() => confirmarDecision(ex, 'no_continua')} disabled={procesando === ex.id} loading={procesando === ex.id} variant="destructive-secondary" size="small" icon={<XCircle size={13} strokeWidth={1.75} />}>
                      No continúa
                    </Button>
                    <Button onClick={() => confirmarDecision(ex, 'continua')} disabled={procesando === ex.id} loading={procesando === ex.id} variant="brand-primary" size="small" icon={<CheckCircle2 size={13} strokeWidth={1.75} />}>
                      Continúa
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function BloqueResultado({ ex }: { ex: ExamenDoc }) {
  const novedadTono: PillTono = ex.novedad === 'con_novedad' ? 'warning' : 'success';
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={ex.resultado_url ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          <FileText size={13} strokeWidth={1.75} />
          Ver resultado (PDF)
          <ExternalLink size={10} strokeWidth={1.75} />
        </a>
        {ex.novedad && (
          <Pill tono={novedadTono}>{ex.novedad === 'con_novedad' ? 'Con novedad' : 'Sin novedad'}</Pill>
        )}
        {ex.con_recomendaciones && ex.acta_recomendaciones_url && (
          <a
            href={ex.acta_recomendaciones_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            <FileText size={13} strokeWidth={1.75} />
            Acta de recomendaciones
            <ExternalLink size={10} strokeWidth={1.75} />
          </a>
        )}
      </div>
      {ex.observaciones_gestor && (
        <p className="text-[12px] text-text-body">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-subtle">Observaciones: </span>
          {ex.observaciones_gestor}
        </p>
      )}
      {ex.decision_cd && (
        <p
          className={cn(
            'text-[12px] font-medium inline-flex items-center gap-1.5',
            ex.decision_cd === 'continua' ? 'text-success-700' : 'text-danger-700',
          )}
        >
          {ex.decision_cd === 'continua' ? (
            <CheckCircle2 size={12} strokeWidth={1.75} />
          ) : (
            <XCircle size={12} strokeWidth={1.75} />
          )}
          C&D: {ex.decision_cd === 'continua' ? 'continúa' : 'no continúa'}
          {ex.decision_cd_obs ? ` · ${ex.decision_cd_obs}` : ''}
        </p>
      )}
    </div>
  );
}

function MiniStat({
  label,
  valor,
  tono = 'neutral',
  icono,
}: {
  label: string;
  valor: number;
  tono?: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  icono?: React.ReactNode;
}) {
  const claseValor =
    tono === 'brand'
      ? 'text-brand-700'
      : tono === 'info'
        ? 'text-info-700'
        : tono === 'success'
          ? 'text-success-700'
          : tono === 'warning'
            ? 'text-warning-700'
            : tono === 'danger'
              ? 'text-danger-700'
              : 'text-text-strong';
  return (
    <div className="bg-white rounded-md border border-slate-200 p-4 shadow-brand-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icono}
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase">{label}</p>
      </div>
      <p className={`mt-2 text-[32px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums ${claseValor}`}>
        {valor}
      </p>
    </div>
  );
}
