import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useSourcing } from '../../hooks/useSourcing';
import type {
  BusquedaSourcingDoc,
  EstadoPostulacion,
  PostulacionDoc,
  VacanteDoc,
} from '../../schemas';

interface PostulacionSourceada extends PostulacionDoc {
  sourcing_busqueda_id?: string;
  sourcing_score?: number;
  sourcing_headline?: string;
  sourcing_empresa_actual?: string | null;
  sourcing_cargo_actual?: string | null;
  sourcing_justificacion?: string;
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

  async function transicionar(p: PostulacionSourceada, nuevo: EstadoPostulacion, marca: string) {
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

  if (!vacante) return <div className="px-6 py-10 text-sm text-navy-500">Cargando vacante…</div>;

  const ordenados = [...docs].sort((a, b) => (b.sourcing_score ?? 0) - (a.sourcing_score ?? 0));

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <Link to={`/vacantes/${vacante.id}`} className="text-xs text-navy-500 hover:text-navy-800">
          ← Volver a detalle
        </Link>
        <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">
          Paso 4.5 · Búsqueda activa con IA
        </p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Candidatos sourceados
        </h1>
        <p className="text-sm text-navy-600 mt-1">
          {vacante.cargo_nombre} · {ordenados.length} pendientes de validar
        </p>
      </div>

      <section className="rounded-xl border-2 border-gold-300 bg-gradient-to-br from-gold-50 to-cream-50 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-gold-700 font-bold">
              Búsqueda IA
            </p>
            <h2 className="font-display text-xl font-semibold text-navy-900 mt-0.5">
              Encontrar más candidatos en internet
            </h2>
            <p className="text-sm text-navy-700 mt-1 max-w-2xl">
              Gemini hace deep research sobre perfiles públicos (LinkedIn, GitHub, sitios profesionales)
              que coinciden con esta vacante. Devuelve hasta 15 personas — tú validas y promueves a
              postulado las que tengan sentido.
            </p>
          </div>
          <button
            onClick={buscarMas}
            disabled={ejecutando}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 text-white px-4 py-2.5 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300 whitespace-nowrap"
          >
            <Sparkles size={14} />
            {ejecutando ? 'Buscando…' : 'Buscar candidatos'}
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
      </section>

      {errorAccion && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {errorAccion}
        </div>
      )}

      {busquedasEnProceso.length > 0 && (
        <div className="rounded-xl border border-navy-100 bg-white p-5 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-equitel-rojo-600" />
          <div className="flex-1">
            <p className="font-display text-sm font-semibold text-navy-900">
              Buscando candidatos en internet…
            </p>
            <p className="text-xs text-navy-600 mt-0.5">
              Clay está rastreando perfiles públicos. Esto puede tomar entre 1 y 5 minutos. Los
              resultados aparecerán abajo automáticamente cuando terminen.
            </p>
          </div>
        </div>
      )}

      {cargando && (
        <p className="text-sm text-navy-500">Cargando candidatos…</p>
      )}

      {!cargando && ordenados.length === 0 && (
        <div className="rounded-xl border border-dashed border-navy-200 bg-cream-50 p-10 text-center">
          <p className="font-display text-lg font-semibold text-navy-900">
            Sin candidatos sourceados todavía
          </p>
          <p className="text-sm text-navy-600 mt-1 max-w-md mx-auto">
            Si las publicaciones pasivas no traen suficientes HVs, lanza una búsqueda con IA y verás
            aparecer perfiles aquí.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {ordenados.map((p) => (
          <div key={p.id} className="rounded-xl border border-navy-100 bg-white p-5 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-lg font-semibold text-navy-900">
                    {p.candidato_nombre}
                  </h3>
                  {typeof p.sourcing_score === 'number' && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        p.sourcing_score >= 85
                          ? 'bg-emerald-50 text-emerald-700'
                          : p.sourcing_score >= 70
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-navy-50 text-navy-700'
                      }`}
                    >
                      {p.sourcing_score}% match
                    </span>
                  )}
                </div>
                {p.sourcing_headline && (
                  <p className="text-sm text-navy-700 mt-1">{p.sourcing_headline}</p>
                )}
                {(p.sourcing_empresa_actual || p.sourcing_cargo_actual) && (
                  <p className="text-xs text-navy-500 mt-1">
                    {p.sourcing_cargo_actual && <span>{p.sourcing_cargo_actual}</span>}
                    {p.sourcing_cargo_actual && p.sourcing_empresa_actual && <span> · </span>}
                    {p.sourcing_empresa_actual && <span>{p.sourcing_empresa_actual}</span>}
                  </p>
                )}
                {p.sourcing_justificacion && (
                  <p className="mt-2 text-sm text-navy-600 italic border-l-2 border-gold-300 pl-3">
                    {p.sourcing_justificacion}
                  </p>
                )}
                {p.candidato_cv_url && (
                  <a
                    href={p.candidato_cv_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-gold-700 hover:underline"
                  >
                    <ExternalLink size={12} /> Ver perfil
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => transicionar(p, 'filtrado_no_cumple', 'filtrado_no_cumple_en')}
                disabled={accionando === p.id}
                className="rounded-md border border-red-200 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
              >
                Descartar
              </button>
              <button
                onClick={() => transicionar(p, 'postulado', 'postulado_en')}
                disabled={accionando === p.id}
                className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800 disabled:bg-navy-300"
              >
                {accionando === p.id ? '…' : 'Promover a postulado'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {ordenados.length > 0 && (
        <p className="text-xs text-navy-500">
          Promover a postulado mueve al candidato al flujo normal del paso 5. Recuerda incluir un
          mensaje de opt-in claro al primer contacto (Habeas Data).
        </p>
      )}
    </div>
  );
}
