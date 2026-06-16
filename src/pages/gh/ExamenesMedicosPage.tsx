import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  HeartPulse,
  RefreshCw,
  Send,
  Stethoscope,
  User,
  XCircle,
} from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import type { PostulacionDoc } from '../../schemas';
import { cn } from '../../utils/cn';

/**
 * ExamenesMedicosPage · sistema brand.
 *
 * Pasos 15-17 del flujograma:
 *  - 15 · solicitada (analista al aprobar al candidato)
 *  - 16 · enviada (GH selecciona centro médico y envía orden)
 *  - 17 · concepto recibido (GH registra apto / no apto + recomendaciones)
 */

interface ExamenDoc {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  vacante_id: string;
  // Campos denormalizados al crear (a partir de la migración del 2026-05).
  // Opcionales para tolerar exámenes viejos que no los tengan: en ese caso
  // resolvemos por lookup en postulaciones.
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
  // Trazabilidad del correo a gestores SST (ver functions/src/examenes/ordenGestores.ts).
  correo_gestor_enviado_en?: Timestamp | null;
  correo_gestor_error?: string | null;
  correo_gestor_datos_faltantes?: string[];
  [k: string]: unknown;
}

const ESTADO_TONO: Record<string, PillTono> = {
  solicitada: 'warning',
  enviada: 'info',
  apto: 'success',
  no_apto: 'danger',
};

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[13px]',
  'text-text-strong placeholder:text-text-subtle focus:bg-white focus:outline-none',
  'focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 transition-colors',
);

export default function ExamenesMedicosPage() {
  const { docs, cargando } = useColeccion<ExamenDoc>('examenes_medicos', {
    orden: ['solicitada_en', 'desc'],
  });
  // Fallback para exámenes viejos sin campos denormalizados.
  // Cargamos postulaciones y resolvemos nombre/cargo en runtime.
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones');
  const postulacionPorId = useMemo(() => {
    const m = new Map<string, PostulacionDoc>();
    for (const p of postulaciones) m.set(p.id, p);
    return m;
  }, [postulaciones]);
  const { actualizar } = useMutacion();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);
  // Formularios inline (reemplazan los window.prompt) para enviar la orden y
  // registrar el concepto médico. Solo uno abierto a la vez.
  const [accion, setAccion] = useState<{ id: string; tipo: 'enviar' | 'concepto' } | null>(null);
  const [centroMedico, setCentroMedico] = useState('Colsanitas');
  const [ordenUrl, setOrdenUrl] = useState('');
  const [apto, setApto] = useState<boolean | null>(null);
  const [recomendaciones, setRecomendaciones] = useState('');
  const [conceptoUrl, setConceptoUrl] = useState('');

  /** Reenvía manualmente la orden a los gestores SST (fallo previo o dato que faltaba). */
  async function reenviarGestores(ex: ExamenDoc) {
    setReenviando(ex.id);
    try {
      const fn = httpsCallable<
        { examen_id: string },
        { ok: true; faltantes: string[]; destinatarios: number }
      >(functions, 'reenviarOrdenGestores');
      const res = await fn({ examen_id: ex.id });
      const faltantes = res.data.faltantes ?? [];
      if (faltantes.length > 0) {
        window.alert(
          `Orden reenviada a los ${res.data.destinatarios} gestores SST.\n\n` +
            `Ojo: todavía faltó ${faltantes.join(', ')}. Complétalo en los Datos Básicos del ` +
            `candidato y vuelve a reenviar para que les llegue completo.`,
        );
      } else {
        window.alert(
          `Orden reenviada a los ${res.data.destinatarios} gestores SST con los 6 datos completos.`,
        );
      }
    } catch (e) {
      window.alert(
        'No se pudo reenviar a los gestores: ' + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setReenviando(null);
    }
  }

  function resolverInfo(ex: ExamenDoc) {
    const post = postulacionPorId.get(ex.postulacion_id);
    return {
      candidato: ex.candidato_nombre ?? post?.candidato_nombre ?? 'Candidato sin nombre',
      cargo: ex.cargo_nombre ?? post?.cargo_nombre ?? null,
      consecutivo: ex.vacante_consecutivo ?? post?.vacante_consecutivo ?? null,
      empresa: ex.empresa_codigo ?? null,
      sede: ex.sede_codigo ?? null,
    };
  }

  function abrirEnvio(ex: ExamenDoc) {
    setCentroMedico(ex.centro_medico || 'Colsanitas');
    setOrdenUrl('');
    setAccion({ id: ex.id, tipo: 'enviar' });
  }

  function abrirConcepto(ex: ExamenDoc) {
    setApto(null);
    setRecomendaciones(ex.recomendaciones || '');
    setConceptoUrl(ex.concepto_url || '');
    setAccion({ id: ex.id, tipo: 'concepto' });
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
        enviada_al_candidato_en: Timestamp.now(),
        estado: 'enviada',
      });
      setAccion(null);
    } catch (e) {
      window.alert('No se pudo enviar la orden: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcesando(null);
    }
  }

  async function confirmarConcepto(ex: ExamenDoc) {
    if (apto === null) return;
    setProcesando(ex.id);
    try {
      await actualizar('examenes_medicos', ex.id, {
        concepto_recibido_en: Timestamp.now(),
        concepto_url: conceptoUrl.trim() || null,
        apto,
        recomendaciones: recomendaciones.trim(),
        estado: apto ? 'apto' : 'no_apto',
      });
      const ahora = Timestamp.now();
      await actualizar('postulaciones', ex.postulacion_id, {
        estado: apto ? 'en_contratacion' : 'descartado_examenes_medicos',
        ultima_transicion_estado: ahora,
        [`marcas.${apto ? 'apto_medico_en' : 'descartado_examenes_medicos_en'}`]: ahora,
      });
      if (apto) {
        await actualizar('vacantes', ex.vacante_id, { estado: 'en_contratacion' });
      }
      setAccion(null);
    } catch (e) {
      window.alert(
        'No se pudo registrar el concepto: ' + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setProcesando(null);
    }
  }

  const stats = useMemo(() => {
    return {
      total: docs.length,
      solicitadas: docs.filter((d) => d.estado === 'solicitada').length,
      enviadas: docs.filter((d) => d.estado === 'enviada').length,
      aptos: docs.filter((d) => d.estado === 'apto').length,
      no_aptos: docs.filter((d) => d.estado === 'no_apto').length,
    };
  }, [docs]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Pasos 15 – 17 · GH
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Exámenes médicos
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Cuando el líder aprueba un candidato, se dispara automáticamente la solicitud. GH
          envía la orden al centro médico y registra el concepto recibido.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MiniStat label="Total" valor={stats.total} icono={<HeartPulse size={14} strokeWidth={1.75} />} />
        <MiniStat label="Solicitadas" valor={stats.solicitadas} tono="warning" />
        <MiniStat label="Enviadas" valor={stats.enviadas} tono="info" />
        <MiniStat label="Aptos" valor={stats.aptos} tono="success" />
        <MiniStat label="No aptos" valor={stats.no_aptos} tono="danger" />
      </div>

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}
      {!cargando && docs.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[14px] font-medium text-text-strong">Sin exámenes pendientes</p>
          <p className="text-[12px] text-text-muted mt-1">
            Cuando el líder apruebe un candidato en la terna, aparecerá aquí la solicitud.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {docs.map((ex) => {
          const tono = ESTADO_TONO[ex.estado] ?? 'neutral';
          const info = resolverInfo(ex);
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
                    <span className="tabular-nums">
                      Solicitada {formatearFecha(ex.solicitada_en.toDate())}
                    </span>
                    {ex.enviada_al_candidato_en && (
                      <>
                        <span className="text-text-subtle">·</span>
                        <span className="tabular-nums">
                          Enviada {formatearFecha(ex.enviada_al_candidato_en.toDate())}
                        </span>
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
                      {ex.correo_gestor_datos_faltantes &&
                        ex.correo_gestor_datos_faltantes.length > 0 && (
                          <span className="text-warning-700 font-normal">
                            · faltó: {ex.correo_gestor_datos_faltantes.join(', ')}
                          </span>
                        )}
                    </p>
                  ) : null}
                  {ex.recomendaciones && (
                    <p className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-text-body italic">
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-subtle not-italic">
                        Recomendaciones:{' '}
                      </span>
                      {ex.recomendaciones}
                    </p>
                  )}
                </div>
                <Pill tono={tono} dot>
                  {ex.estado.replace(/_/g, ' ')}
                </Pill>
              </div>

              <div className="mt-4 flex gap-2 justify-end flex-wrap">
                {(ex.estado === 'solicitada' ||
                  ex.estado === 'enviada' ||
                  ex.correo_gestor_error) && (
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
                {ex.estado === 'solicitada' && accion?.id !== ex.id && (
                  <Button
                    onClick={() => abrirEnvio(ex)}
                    disabled={procesando === ex.id}
                    loading={procesando === ex.id}
                    variant="brand-primary"
                    size="medium"
                    icon={<Send size={13} strokeWidth={1.75} />}
                  >
                    Enviar al candidato · paso 16
                  </Button>
                )}
                {ex.estado === 'enviada' && accion?.id !== ex.id && (
                  <Button
                    onClick={() => abrirConcepto(ex)}
                    disabled={procesando === ex.id}
                    loading={procesando === ex.id}
                    variant="brand-primary"
                    size="medium"
                    icon={<Stethoscope size={13} strokeWidth={1.75} />}
                  >
                    Registrar concepto · paso 17
                  </Button>
                )}
                {(ex.estado === 'apto' || ex.estado === 'no_apto') && ex.concepto_url && (
                  <a
                    href={ex.concepto_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] text-brand-700 hover:text-brand-800 hover:underline underline-offset-2 font-medium"
                  >
                    <ExternalLink size={11} strokeWidth={1.75} />
                    Ver concepto
                  </a>
                )}
                {ex.estado === 'no_apto' && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-danger-700 font-medium">
                    <XCircle size={12} strokeWidth={1.75} />
                    Candidato descartado por médicos
                  </span>
                )}
              </div>

              {accion?.id === ex.id && accion.tipo === 'enviar' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <p className="text-[12px] font-semibold text-text-strong">
                    Enviar orden al candidato · paso 16
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-medium text-text-muted mb-1">
                        Centro médico
                      </span>
                      <input
                        value={centroMedico}
                        onChange={(e) => setCentroMedico(e.target.value)}
                        className={inputClass}
                        placeholder="Colsanitas"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-medium text-text-muted mb-1">
                        URL de la orden (opcional)
                      </span>
                      <input
                        value={ordenUrl}
                        onChange={(e) => setOrdenUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://…"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button onClick={cerrarAccion} variant="neutral-secondary" size="small">
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => confirmarEnvio(ex)}
                      disabled={!centroMedico.trim() || procesando === ex.id}
                      loading={procesando === ex.id}
                      variant="brand-primary"
                      size="small"
                      icon={<Send size={13} strokeWidth={1.75} />}
                    >
                      Confirmar envío
                    </Button>
                  </div>
                </div>
              )}

              {accion?.id === ex.id && accion.tipo === 'concepto' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <p className="text-[12px] font-semibold text-text-strong">
                    Registrar concepto médico · paso 17
                  </p>
                  <div>
                    <span className="block text-[11px] font-medium text-text-muted mb-1">
                      Resultado
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setApto(true)}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors',
                          apto === true
                            ? 'bg-success-600 text-white border-success-600'
                            : 'bg-white text-text-body border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        Apto
                      </button>
                      <button
                        type="button"
                        onClick={() => setApto(false)}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors',
                          apto === false
                            ? 'bg-danger-600 text-white border-danger-600'
                            : 'bg-white text-text-body border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        No apto
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">
                      Recomendaciones (opcional)
                    </span>
                    <textarea
                      value={recomendaciones}
                      onChange={(e) => setRecomendaciones(e.target.value)}
                      rows={2}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-text-muted mb-1">
                      URL del concepto (opcional)
                    </span>
                    <input
                      value={conceptoUrl}
                      onChange={(e) => setConceptoUrl(e.target.value)}
                      className={inputClass}
                      placeholder="https://…"
                    />
                  </label>
                  <div className="flex gap-2 justify-end">
                    <Button onClick={cerrarAccion} variant="neutral-secondary" size="small">
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => confirmarConcepto(ex)}
                      disabled={apto === null || procesando === ex.id}
                      loading={procesando === ex.id}
                      variant="brand-primary"
                      size="small"
                      icon={<Stethoscope size={13} strokeWidth={1.75} />}
                    >
                      Guardar concepto
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
      <p
        className={`mt-2 text-[36px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums ${claseValor}`}
      >
        {valor}
      </p>
    </div>
  );
}
