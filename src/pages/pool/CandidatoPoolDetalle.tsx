import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { ExternalLink, FileText, Send, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import {
  MOTIVO_DESCARTE_LABEL,
  type CandidatoDoc,
  type PostulacionDoc,
  type VacanteDoc,
} from '../../schemas';
import { Button, Pill } from '../../components/brand';

/**
 * CandidatoPoolDetalle · sistema brand.
 *
 * Panel lateral (slide-over) con el historial cross-vacante del candidato.
 * Acción principal: "Sugerir a vacante activa" — crea postulación nueva
 * con fuente='base_interna' reusando el candidato existente.
 */

interface Props {
  candidato: CandidatoDoc;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

export function CandidatoPoolDetalle({ candidato, onClose }: Props) {
  const { user, perfil } = useAuth();
  const { crear } = useMutacion();

  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones', {
    filtros: [['candidato_id', '==', candidato.id]],
    orden: ['fecha_postulacion', 'desc'],
  });

  const { docs: vacantesPublicadas } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'publicada']],
  });
  const { docs: vacantesEnProceso } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'en_proceso']],
  });
  const vacantesActivas = useMemo(
    () => [...vacantesPublicadas, ...vacantesEnProceso],
    [vacantesPublicadas, vacantesEnProceso],
  );

  const vacantesIdsPostulado = useMemo(
    () => new Set(postulaciones.map((p) => p.vacante_id)),
    [postulaciones],
  );
  const vacantesDisponibles = vacantesActivas.filter((v) => !vacantesIdsPostulado.has(v.id));

  const [vacanteSugerir, setVacanteSugerir] = useState<string>('');
  const [sugiriendo, setSugiriendo] = useState(false);
  const [resultadoSugerir, setResultadoSugerir] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  async function sugerirAVacante() {
    if (!user || !perfil || !vacanteSugerir) return;
    const v = vacantesActivas.find((x) => x.id === vacanteSugerir);
    if (!v) return;
    setSugiriendo(true);
    setResultadoSugerir(null);
    try {
      const ahora = Timestamp.now();
      await crear('postulaciones', {
        candidato_id: candidato.id,
        proceso_id: v.proceso_activo_id,
        vacante_id: v.id,
        vacante_consecutivo: v.consecutivo,
        cargo_nombre: v.cargo_nombre,
        candidato_nombre: `${candidato.nombres} ${candidato.apellidos}`.trim(),
        candidato_email: candidato.email || '',
        candidato_telefono: candidato.telefono || '',
        candidato_cv_url: candidato.fuente_hv_url || null,
        estado: 'postulado',
        cumple_criterios: null,
        fuente: 'base_interna',
        marcas: { postulado_en: ahora, sugerido_desde_pool_en: ahora },
        fecha_postulacion: ahora,
        ultima_transicion_estado: ahora,
        origen_publicacion_id: null,
        motivo_descarte: null,
        razon_descarte: null,
        descarte_etapa: null,
        analista_uid: v.analista_uid ?? user.uid,
      });
      setResultadoSugerir({
        ok: true,
        msg: `Candidato sugerido a ${v.consecutivo}. Revisa la vacante para validar criterios.`,
      });
      setVacanteSugerir('');
    } catch (e) {
      setResultadoSugerir({
        ok: false,
        msg: e instanceof Error ? e.message : 'No pudimos sugerir.',
      });
    } finally {
      setSugiriendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-text-strong/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white border-l border-slate-200 overflow-y-auto shadow-brand-modal animate-fade-in-up">
        {/* Header */}
        <div className="sticky top-0 brand-glass-strong border-b border-slate-200/80 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <Pill tono="brand" dot>
              Pool
            </Pill>
            <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.018em] text-text-strong">
              {candidato.nombres} {candidato.apellidos}
            </h2>
            <p className="text-[11px] text-text-muted mt-1">
              {candidato.email || 'sin email'} · {candidato.telefono || 'sin tel.'} ·{' '}
              {candidato.ciudad_residencia || 'sin ciudad'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-strong transition-colors p-1 rounded-md hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-6 space-y-7">
          {/* Perfil */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                Perfil
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50/40 p-4 grid grid-cols-2 gap-3">
              <Dato label="Dominio" valor={candidato.dominio_principal ?? 'sin_clasificar'} />
              <Dato label="Especialidad" valor={candidato.especialidad_tecnica || '—'} />
              <Dato
                label="Experiencia"
                valor={
                  candidato.anios_experiencia_aproximados != null
                    ? `${candidato.anios_experiencia_aproximados} años`
                    : '—'
                }
              />
              <Dato label="Origen" valor={candidato.origen} />
              <Dato
                label="Postulaciones"
                valor={String(candidato.total_postulaciones ?? postulaciones.length)}
              />
              <Dato
                label="Apto para pool"
                valor={candidato.apto_para_pool_futuro === false ? '⛔ NO' : '✓ Sí'}
              />
              {candidato.motivo_no_apto_pool && (
                <Dato label="Motivo no apto" valor={candidato.motivo_no_apto_pool} ancho />
              )}
              {candidato.linkedin_url && (
                <a
                  href={candidato.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 inline-flex items-center gap-1.5 text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium mt-1"
                >
                  <ExternalLink size={11} strokeWidth={1.75} /> LinkedIn
                </a>
              )}
              {candidato.fuente_hv_url && (
                <a
                  href={candidato.fuente_hv_url}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 inline-flex items-center gap-1.5 text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                >
                  <FileText size={11} strokeWidth={1.75} /> Hoja de vida
                </a>
              )}
            </div>
          </section>

          {/* Historial de postulaciones */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                Historial ·{' '}
                <span className="tabular-nums text-text-strong">{postulaciones.length}</span>{' '}
                postulación(es)
              </p>
            </div>
            {postulaciones.length === 0 ? (
              <p className="text-[12px] text-text-muted italic">Sin historial.</p>
            ) : (
              <div className="space-y-2.5">
                {postulaciones.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border border-slate-200 bg-white p-3.5 hover:bg-slate-50/40 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <Link
                        to={`/vacantes/${p.vacante_id}`}
                        className="text-[13px] font-semibold text-text-strong hover:text-brand-700 transition-colors"
                      >
                        {p.vacante_consecutivo} · {p.cargo_nombre}
                      </Link>
                      <span className="text-[10px] text-text-subtle tabular-nums">
                        {formatearFecha(p.fecha_postulacion?.toDate())}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <Pill tono="neutral" dot>
                        {p.estado.replace(/_/g, ' ')}
                      </Pill>
                      {p.fuente === 'base_interna' && <Pill tono="info">🏢 Interno</Pill>}
                    </div>
                    {p.motivo_descarte && (
                      <p className="text-[11px] text-warning-700 mt-2">
                        Motivo de descarte:{' '}
                        <span className="font-medium">
                          {MOTIVO_DESCARTE_LABEL[p.motivo_descarte]}
                        </span>
                      </p>
                    )}
                    {p.razon_descarte && (
                      <p className="text-[11px] text-text-muted italic mt-1">
                        "{p.razon_descarte}"
                      </p>
                    )}
                    <Link
                      to={`/postulaciones/${p.id}`}
                      className="text-[11px] text-brand-700 hover:text-brand-800 hover:underline font-medium mt-2 inline-block"
                    >
                      Ver postulación completa →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pruebas pasadas */}
          {(candidato.pruebas_historial?.length ?? 0) > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                  Pruebas pasadas ·{' '}
                  <span className="tabular-nums text-text-strong">
                    {candidato.pruebas_historial.length}
                  </span>
                </p>
              </div>
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                        Tipo
                      </th>
                      <th className="px-3 py-2 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                        Resultado
                      </th>
                      <th className="px-3 py-2 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                        Vacante
                      </th>
                      <th className="px-3 py-2 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidato.pruebas_historial.map((pr, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-text-body">{pr.tipo_prueba}</td>
                        <td className="px-3 py-2 capitalize text-text-body">{pr.resultado}</td>
                        <td className="px-3 py-2 text-text-muted font-mono text-[11px]">
                          {pr.vacante_consecutivo}
                        </td>
                        <td className="px-3 py-2 text-text-muted tabular-nums">
                          {formatearFecha(pr.registrada_en?.toDate?.())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Sugerir a vacante activa */}
          {candidato.apto_para_pool_futuro !== false && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Send size={11} strokeWidth={1.75} className="text-brand-700" />
                <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-brand-700">
                  Sugerir a vacante activa
                </p>
              </div>
              {vacantesDisponibles.length === 0 ? (
                <p className="text-[12px] text-text-muted italic">
                  {vacantesActivas.length === 0
                    ? 'No hay vacantes activas (publicadas / en proceso) ahora mismo.'
                    : 'Ya está postulado a todas las vacantes activas.'}
                </p>
              ) : (
                <div className="flex items-end gap-2 flex-wrap">
                  <label className="flex-1 min-w-[200px]">
                    <span className="block text-[11px] font-medium text-text-strong mb-1.5">
                      Vacante
                    </span>
                    <select
                      value={vacanteSugerir}
                      onChange={(e) => setVacanteSugerir(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Selecciona…</option>
                      {vacantesDisponibles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.consecutivo} · {v.cargo_nombre} ({v.sede_nombre})
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    onClick={sugerirAVacante}
                    disabled={!vacanteSugerir || sugiriendo}
                    loading={sugiriendo}
                    variant="brand-primary"
                    icon={<Send size={13} strokeWidth={1.75} />}
                  >
                    Sugerir
                  </Button>
                </div>
              )}
              {resultadoSugerir && (
                <p
                  className={`mt-2.5 text-[12px] ${
                    resultadoSugerir.ok ? 'text-success-700' : 'text-danger-700'
                  }`}
                >
                  {resultadoSugerir.msg}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Dato({
  label,
  valor,
  ancho,
}: {
  label: string;
  valor: string;
  ancho?: boolean;
}) {
  return (
    <div className={ancho ? 'col-span-2' : ''}>
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-subtle">
        {label}
      </p>
      <p className="text-[13px] text-text-strong font-medium mt-0.5">{valor}</p>
    </div>
  );
}
