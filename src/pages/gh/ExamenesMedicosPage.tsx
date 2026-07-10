import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { CargandoPagina } from '../../components/ui/CargandoPagina';
import { EncabezadoPagina } from '../../components/ui/EncabezadoPagina';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import type { PostulacionDoc } from '../../schemas';
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

async function subirArchivoResultado(
  examenId: string,
  file: File,
  sufijo: string,
): Promise<string> {
  const limpio = `${Date.now()}_${sufijo}_${file.name}`.replace(/[^\w.\-]+/g, '_');
  const r = storageRef(storage, `resultados_examenes/${examenId}/${limpio}`);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

export default function ExamenesMedicosPage() {
  const { rol } = useAuth();
  const esGestor = rol === 'gestor';
  const esGH = rol === 'gh' || rol === 'coordinador' || rol === 'admin';
  const puedeEnviarOrden = esGH; // paso 16 (no el gestor, no el analista)
  const puedeSubirResultado = esGestor || esGH;
  const puedeDecidir = esGH; // decide la novedad (Diego/Paola/coordinación)

  const { docs, cargando } = useColeccion<ExamenDoc>('examenes_medicos', {
    orden: ['solicitada_en', 'desc'],
  });
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones');
  const postulacionPorId = useMemo(() => {
    const m = new Map<string, PostulacionDoc>();
    for (const p of postulaciones) m.set(p.id, p);
    return m;
  }, [postulaciones]);
  const { actualizar } = useMutacion();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);

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

  function abrirEnvio(ex: ExamenDoc) {
    setCentroMedico(ex.centro_medico || 'Colsanitas');
    setOrdenUrl(ex.orden_url || '');
    setDireccion(ex.orden_direccion || '');
    setInstrucciones(ex.orden_instrucciones || '');
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
      await actualizar('examenes_medicos', ex.id, {
        centro_medico: centroMedico.trim(),
        orden_url: ordenUrl.trim() || null,
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
      window.alert('No se pudo enviar la orden: ' + (e instanceof Error ? e.message : String(e)));
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
      window.alert('No se pudo registrar el resultado: ' + (e instanceof Error ? e.message : String(e)));
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
    ? 'Sube el resultado del examen de cada integrante y marca si viene sin o con novedad. Con novedad, don Diego revisa y decide.'
    : 'GH envía la orden al centro médico. El gestor SST sube el resultado; si viene con novedad, Cultura y Desarrollo decide si continúa la contratación.';

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <EncabezadoPagina
        icono={<Stethoscope size={26} strokeWidth={1.6} />}
        tono="info"
        eyebrow="Pasos 15 – 17"
        titulo="Exámenes médicos"
        descripcion={descripcion}
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <MiniStat label="Total" valor={stats.total} icono={<HeartPulse size={14} strokeWidth={1.75} />} />
        <MiniStat label="Solicitadas" valor={stats.solicitadas} tono="warning" />
        <MiniStat label="Enviadas" valor={stats.enviadas} tono="info" />
        <MiniStat label="Revisión C&D" valor={stats.revision} tono="warning" />
        <MiniStat label="Aptos" valor={stats.aptos} tono="success" />
        <MiniStat label="No aptos" valor={stats.no_aptos} tono="danger" />
      </div>

      {!cargando && docs.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[14px] font-medium text-text-strong">Sin exámenes pendientes</p>
          <p className="text-[12px] text-text-muted mt-1">
            Cuando el líder apruebe un integrante en la terna, aparecerá aquí la solicitud.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {docs.map((ex) => {
          const tono = ESTADO_TONO[ex.estado] ?? 'neutral';
          const info = resolverInfo(ex);
          const abierto = accion?.id === ex.id;
          return (
            <Card key={ex.id} padding="md">
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
                    <Link
                      to={`/postulaciones/${ex.postulacion_id}`}
                      className="hover:text-brand-700 transition-colors"
                    >
                      {info.candidato}
                    </Link>
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
                </div>
                <Pill tono={tono} dot>
                  {ESTADO_LABEL[ex.estado] ?? ex.estado.replace(/_/g, ' ')}
                </Pill>
              </div>

              {/* Bloque de RESULTADO (lectura) — visible para todos apenas exista. */}
              {ex.resultado_url && <BloqueResultado ex={ex} />}

              {/* Acciones */}
              <div className="mt-4 flex gap-2 justify-end flex-wrap items-center">
                {(ex.estado === 'solicitada' || ex.estado === 'enviada' || ex.correo_gestor_error) &&
                  puedeEnviarOrden && (
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

                {ex.estado === 'enviada' && puedeSubirResultado && !abierto && (
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
                  <p className="text-[12px] font-semibold text-text-strong">Enviar orden al integrante · paso 16</p>
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
                      Confirmar envío
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
