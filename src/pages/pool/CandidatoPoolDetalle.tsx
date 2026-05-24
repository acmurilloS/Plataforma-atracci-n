import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { X, FileText, ExternalLink } from 'lucide-react';
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

interface Props {
  candidato: CandidatoDoc;
  onClose: () => void;
}

/**
 * Panel lateral con el historial cross-vacante del candidato.
 *
 * Acción principal: "Sugerir a vacante activa" — crea una postulación nueva
 * con fuente='base_interna' en una vacante compatible. Reutiliza el candidato
 * existente sin abrir proceso nuevo.
 */
export function CandidatoPoolDetalle({ candidato, onClose }: Props) {
  const { user, perfil } = useAuth();
  const { crear } = useMutacion();

  // Todas las postulaciones del candidato (historial completo)
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones', {
    filtros: [['candidato_id', '==', candidato.id]],
    orden: ['fecha_postulacion', 'desc'],
  });

  // Vacantes activas para sugerir (publicada o en_proceso)
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

  // No re-sugerir a una vacante donde ya está postulado
  const vacantesIdsPostulado = useMemo(
    () => new Set(postulaciones.map((p) => p.vacante_id)),
    [postulaciones],
  );
  const vacantesDisponibles = vacantesActivas.filter((v) => !vacantesIdsPostulado.has(v.id));

  const [vacanteSugerir, setVacanteSugerir] = useState<string>('');
  const [sugiriendo, setSugiriendo] = useState(false);
  const [resultadoSugerir, setResultadoSugerir] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

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
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white border-l border-navy-100 overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-navy-100 px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-gold-700">Pool</p>
            <h2 className="font-display text-xl font-semibold text-navy-900">
              {candidato.nombres} {candidato.apellidos}
            </h2>
            <p className="text-xs text-navy-500 mt-1">
              {candidato.email || 'sin email'} · {candidato.telefono || 'sin tel.'} ·{' '}
              {candidato.ciudad_residencia || 'sin ciudad'}
            </p>
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Resumen del candidato */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-navy-700 mb-2">
              Perfil
            </h3>
            <div className="rounded-lg border border-navy-100 bg-cream-50/40 p-3 grid grid-cols-2 gap-2 text-xs">
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
                  className="col-span-2 text-gold-700 hover:underline text-xs inline-flex items-center gap-1 mt-1"
                >
                  <ExternalLink size={12} /> LinkedIn
                </a>
              )}
              {candidato.fuente_hv_url && (
                <a
                  href={candidato.fuente_hv_url}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 text-gold-700 hover:underline text-xs inline-flex items-center gap-1"
                >
                  <FileText size={12} /> Hoja de vida
                </a>
              )}
            </div>
          </section>

          {/* Historial de postulaciones */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-navy-700 mb-2">
              Historial · {postulaciones.length} postulación(es)
            </h3>
            {postulaciones.length === 0 ? (
              <p className="text-xs text-navy-500 italic">Sin historial.</p>
            ) : (
              <div className="space-y-2">
                {postulaciones.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-navy-100 bg-white p-3 text-xs"
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <Link
                        to={`/vacantes/${p.vacante_id}`}
                        className="font-semibold text-navy-900 hover:text-gold-700"
                      >
                        {p.vacante_consecutivo} · {p.cargo_nombre}
                      </Link>
                      <span className="text-[10px] text-navy-500">
                        {formatearFecha(p.fecha_postulacion?.toDate())}
                      </span>
                    </div>
                    <p className="text-navy-600 mt-1">
                      Estado: <span className="font-medium">{p.estado}</span>
                    </p>
                    {p.motivo_descarte && (
                      <p className="text-amber-700 mt-1">
                        Motivo de descarte:{' '}
                        <span className="font-medium">{MOTIVO_DESCARTE_LABEL[p.motivo_descarte]}</span>
                      </p>
                    )}
                    {p.razon_descarte && (
                      <p className="text-navy-600 italic mt-1">"{p.razon_descarte}"</p>
                    )}
                    <Link
                      to={`/postulaciones/${p.id}`}
                      className="text-gold-700 hover:underline text-[11px] mt-2 inline-block"
                    >
                      Ver postulación completa →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Historial de pruebas (denormalizado) */}
          {(candidato.pruebas_historial?.length ?? 0) > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-navy-700 mb-2">
                Pruebas pasadas · {candidato.pruebas_historial.length}
              </h3>
              <div className="rounded-lg border border-navy-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-cream-100 text-navy-700 text-left">
                    <tr>
                      <th className="px-3 py-1.5">Tipo</th>
                      <th className="px-3 py-1.5">Resultado</th>
                      <th className="px-3 py-1.5">Vacante</th>
                      <th className="px-3 py-1.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidato.pruebas_historial.map((pr, i) => (
                      <tr key={i} className="border-t border-navy-50">
                        <td className="px-3 py-1.5">{pr.tipo_prueba}</td>
                        <td className="px-3 py-1.5 capitalize">{pr.resultado}</td>
                        <td className="px-3 py-1.5 text-navy-500">{pr.vacante_consecutivo}</td>
                        <td className="px-3 py-1.5 text-navy-500">
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
              <h3 className="text-xs font-semibold uppercase tracking-widest text-navy-700 mb-2">
                Sugerir a vacante activa
              </h3>
              {vacantesDisponibles.length === 0 ? (
                <p className="text-xs text-navy-500 italic">
                  {vacantesActivas.length === 0
                    ? 'No hay vacantes activas (publicadas / en proceso) ahora mismo.'
                    : 'Ya está postulado a todas las vacantes activas.'}
                </p>
              ) : (
                <div className="flex items-end gap-2 flex-wrap">
                  <label className="flex-1 min-w-[200px]">
                    <span className="text-[11px] font-medium text-navy-700">Vacante</span>
                    <select
                      value={vacanteSugerir}
                      onChange={(e) => setVacanteSugerir(e.target.value)}
                      className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-xs"
                    >
                      <option value="">Selecciona…</option>
                      {vacantesDisponibles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.consecutivo} · {v.cargo_nombre} ({v.sede_nombre})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={sugerirAVacante}
                    disabled={!vacanteSugerir || sugiriendo}
                    className="rounded-md bg-gold-700 text-white px-4 py-2 text-xs font-semibold hover:bg-gold-800 disabled:bg-gold-300"
                  >
                    {sugiriendo ? '…' : 'Sugerir'}
                  </button>
                </div>
              )}
              {resultadoSugerir && (
                <p
                  className={`mt-2 text-xs ${
                    resultadoSugerir.ok ? 'text-emerald-700' : 'text-red-700'
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

function Dato({ label, valor, ancho }: { label: string; valor: string; ancho?: boolean }) {
  return (
    <div className={ancho ? 'col-span-2' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-navy-500">{label}</p>
      <p className="text-navy-900 font-medium">{valor}</p>
    </div>
  );
}
