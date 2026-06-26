import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useSourcing } from '../../hooks/useSourcing';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import type {
  BusquedaSourcingDoc,
  EstadoPostulacion,
  PostulacionDoc,
  VacanteDoc,
} from '../../schemas';

/**
 * SourcingPage · sistema brand.
 *
 * Paso 4.5 · candidatos encontrados por Gemini que esperan validación
 * humana antes de pasar al flujo normal del paso 5.
 */

interface PostulacionSourceada extends PostulacionDoc {
  sourcing_busqueda_id?: string;
  sourcing_score?: number;
  sourcing_headline?: string;
  sourcing_empresa_actual?: string | null;
  sourcing_cargo_actual?: string | null;
  sourcing_justificacion?: string;
  /** true si la URL original que dio Gemini fue inválida (404) y se reemplazó por búsqueda Google. */
  sourcing_url_rota?: boolean;
  /** URL original que dio Gemini (404). Solo para auditoría. */
  sourcing_perfil_url_original?: string | null;
  /** true si la URL del perfil estuvo entre las fuentes que Gemini realmente consultó (mayor confianza). */
  sourcing_url_en_grounding?: boolean;
  /** true si la URL no se pudo confirmar y conviene validar manualmente antes de promover. */
  sourcing_requiere_validacion?: boolean;
}

function tonoScore(score: number): PillTono {
  if (score >= 85) return 'success';
  if (score >= 70) return 'warning';
  return 'neutral';
}

export default function SourcingPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { docs, cargando } = useColeccion<PostulacionSourceada>('postulaciones', {
    filtros: id
      ? [
          ['vacante_id', '==', id],
          ['estado', '==', 'sourceado_por_ia'],
        ]
      : [],
  });
  const { docs: busquedasEnProceso } = useColeccion<BusquedaSourcingDoc>('busquedas_sourcing', {
    filtros: id
      ? [
          ['vacante_id', '==', id],
          ['estado', '==', 'en_proceso'],
        ]
      : [],
    orden: ['iniciada_en', 'desc'],
  });
  const { actualizar } = useMutacion();
  const { buscarCandidatos, ejecutando, error } = useSourcing();
  const [accionando, setAccionando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  async function buscarMas() {
    if (!vacante) return;
    try {
      await buscarCandidatos(vacante.id);
    } catch {
      // useSourcing maneja el error en su estado
    }
  }

  async function transicionar(
    p: PostulacionSourceada,
    nuevo: EstadoPostulacion,
    marca: string,
  ) {
    setAccionando(p.id);
    setErrorAccion(null);
    try {
      const ahora = Timestamp.now();
      await actualizar('postulaciones', p.id, {
        estado: nuevo,
        ultima_transicion_estado: ahora,
        [`marcas.${marca}`]: ahora,
      });
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No pudimos actualizar.');
    } finally {
      setAccionando(null);
    }
  }

  if (!vacante)
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">
        Cargando vacante…
      </div>
    );

  const ordenados = [...docs].sort(
    (a, b) => (b.sourcing_score ?? 0) - (a.sourcing_score ?? 0),
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      {/* Volver */}
      <Link
        to={`/vacantes/${vacante.id}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver al detalle
      </Link>

      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Paso 4.5 · Búsqueda activa con IA
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Integrantes sourceados
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          {vacante.cargo_nombre} ·{' '}
          <span className="tabular-nums font-semibold text-text-body">
            {ordenados.length} pendientes de validar
          </span>
          . Promover a postulado los mueve al flujo normal del paso 5.
        </p>
      </div>

      {/* Buscar más con IA */}
      <Card padding="lg" className="border-brand-200 bg-gradient-to-br from-brand-50/40 to-white">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Sparkles size={20} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <Pill tono="brand">Búsqueda IA</Pill>
            <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.012em] text-text-strong">
              Encontrar más integrantes en internet
            </h2>
            <p className="text-[13px] text-text-muted mt-1.5 max-w-2xl">
              Gemini hace deep research sobre perfiles públicos (LinkedIn, GitHub, sitios
              profesionales) que coinciden con la vacante. Devuelve hasta 15 personas — tú validas
              y promueves al flujo las que tengan sentido.
            </p>
          </div>
          <Button
            onClick={buscarMas}
            disabled={ejecutando}
            loading={ejecutando}
            variant="brand-primary"
            icon={<Sparkles size={13} strokeWidth={1.75} />}
          >
            {ejecutando ? 'Buscando…' : 'Buscar integrantes'}
          </Button>
        </div>
        {error && (
          <p className="mt-3 text-[12px] text-danger-700 inline-flex items-center gap-1.5">
            <X size={11} strokeWidth={1.75} />
            {error}
          </p>
        )}
      </Card>

      {errorAccion && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {errorAccion}
        </div>
      )}

      {/* Búsqueda en proceso */}
      {busquedasEnProceso.length > 0 && (
        <Card padding="md" className="border-info-500/30 bg-info-50/40">
          <div className="flex items-center gap-3">
            <Loader2
              size={18}
              strokeWidth={1.75}
              className="animate-spin text-info-700 shrink-0"
            />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-text-strong">
                Buscando integrantes en internet…
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                La IA está rastreando perfiles públicos. Puede tomar entre 1 y 5 minutos. Los
                resultados aparecerán abajo automáticamente.
              </p>
            </div>
          </div>
        </Card>
      )}

      {cargando && <p className="text-[13px] text-text-muted">Cargando integrantes…</p>}

      {!cargando && ordenados.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={20} strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-text-strong">
            Sin integrantes sourceados todavía
          </p>
          <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
            Si las publicaciones pasivas no traen suficientes HVs, lanza una búsqueda con IA y
            verás aparecer perfiles aquí.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {ordenados.map((p) => (
          <Card key={p.id} padding="lg">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[17px] font-semibold tracking-[-0.012em] text-text-strong">
                    {p.candidato_nombre}
                  </h3>
                  {typeof p.sourcing_score === 'number' && (
                    <Pill tono={tonoScore(p.sourcing_score)}>
                      <span className="tabular-nums">{p.sourcing_score}% match</span>
                    </Pill>
                  )}
                  {p.sourcing_url_en_grounding ? (
                    <Pill tono="success">
                      <span className="inline-flex items-center gap-1">
                        <Check size={10} strokeWidth={2.25} /> Verificado en fuente
                      </span>
                    </Pill>
                  ) : p.sourcing_requiere_validacion ? (
                    <Pill tono="warning">Validar manualmente</Pill>
                  ) : null}
                </div>
                {p.sourcing_headline && (
                  <p className="text-[13px] text-text-body mt-1.5">{p.sourcing_headline}</p>
                )}
                {(p.sourcing_empresa_actual || p.sourcing_cargo_actual) && (
                  <p className="text-[12px] text-text-muted mt-1 inline-flex items-center gap-1.5">
                    <Building2
                      size={11}
                      strokeWidth={1.5}
                      className="text-text-subtle"
                    />
                    {p.sourcing_cargo_actual && <span>{p.sourcing_cargo_actual}</span>}
                    {p.sourcing_cargo_actual && p.sourcing_empresa_actual && <span>·</span>}
                    {p.sourcing_empresa_actual && <span>{p.sourcing_empresa_actual}</span>}
                  </p>
                )}
                {p.sourcing_justificacion && (
                  <p className="mt-3 text-[13px] text-text-body italic border-l-2 border-brand-400 pl-3 leading-relaxed">
                    {p.sourcing_justificacion}
                  </p>
                )}
                {p.candidato_cv_url && (
                  <div className="mt-3 space-y-1.5">
                    <a
                      href={p.candidato_cv_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                    >
                      <ExternalLink size={11} strokeWidth={1.75} />
                      {p.sourcing_url_rota
                        ? 'Buscar a esta persona en Google'
                        : 'Ver perfil público'}
                    </a>
                    {p.sourcing_url_rota && (
                      <p className="text-[11px] text-warning-700 inline-flex items-start gap-1.5 leading-[1.4]">
                        <X size={11} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                        <span>
                          La URL que dio la IA no resolvió, posiblemente fue inventada. Usa el
                          link de búsqueda para ubicar al integrante manualmente.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end mt-4 pt-4 border-t border-slate-100">
              <Button
                variant="destructive-secondary"
                size="medium"
                onClick={() => transicionar(p, 'filtrado_no_cumple', 'filtrado_no_cumple_en')}
                disabled={accionando === p.id}
                icon={<X size={13} strokeWidth={1.75} />}
              >
                Descartar
              </Button>
              <Button
                variant="brand-primary"
                size="medium"
                onClick={() => transicionar(p, 'postulado', 'postulado_en')}
                disabled={accionando === p.id}
                loading={accionando === p.id}
                icon={<Check size={13} strokeWidth={1.75} />}
              >
                Promover a postulado
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {ordenados.length > 0 && (
        <div
          className={cn(
            'rounded-md border border-warning-500/30 bg-warning-50/40',
            'px-4 py-3 text-[12px] text-warning-700',
          )}
        >
          <p>
            <span className="font-semibold">Habeas Data:</span> promover a postulado mueve al
            integrante al flujo normal del paso 5. Recuerda incluir un mensaje de opt-in claro al
            primer contacto.
          </p>
        </div>
      )}
    </div>
  );
}
