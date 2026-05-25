import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  Building2,
  ExternalLink,
  HeartPulse,
  Send,
  Stethoscope,
  User,
  XCircle,
} from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import type { PostulacionDoc } from '../../schemas';

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
  [k: string]: unknown;
}

const ESTADO_TONO: Record<string, PillTono> = {
  solicitada: 'warning',
  enviada: 'info',
  apto: 'success',
  no_apto: 'danger',
};

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

  async function enviar(ex: ExamenDoc) {
    const centro = window.prompt('Centro médico:', 'Colsanitas') ?? 'Colsanitas';
    const url = window.prompt('URL de la orden médica:') ?? '';
    setProcesando(ex.id);
    await actualizar('examenes_medicos', ex.id, {
      centro_medico: centro,
      orden_url: url,
      enviada_al_candidato_en: Timestamp.now(),
      estado: 'enviada',
    });
    setProcesando(null);
  }

  async function registrarConcepto(ex: ExamenDoc) {
    const apto = window.confirm('¿Apto? OK = sí');
    const recomendaciones = window.prompt('Recomendaciones:') ?? '';
    const url = window.prompt('URL del concepto:') ?? '';
    setProcesando(ex.id);
    await actualizar('examenes_medicos', ex.id, {
      concepto_recibido_en: Timestamp.now(),
      concepto_url: url,
      apto,
      recomendaciones,
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
    setProcesando(null);
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
                {ex.estado === 'solicitada' && (
                  <Button
                    onClick={() => enviar(ex)}
                    disabled={procesando === ex.id}
                    loading={procesando === ex.id}
                    variant="brand-primary"
                    size="medium"
                    icon={<Send size={13} strokeWidth={1.75} />}
                  >
                    Enviar al candidato · paso 16
                  </Button>
                )}
                {ex.estado === 'enviada' && (
                  <Button
                    onClick={() => registrarConcepto(ex)}
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
