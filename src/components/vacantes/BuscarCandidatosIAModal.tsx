import { useState } from 'react';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { Modal } from '../ui';
import { Button, Pill } from '../brand';
import { useSourcing } from '../../hooks/useSourcing';
import type { VacanteDoc } from '../../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompletado: (busquedaId: string, encontrados: number) => void;
  vacante: VacanteDoc;
}

/**
 * BuscarCandidatosIAModal · sistema brand.
 *
 * Modal de confirmación previo a disparar Gemini con grounding (paso 4.5).
 * Muestra preview de la vacante + reglas operativas + advertencia habeas data.
 */
export function BuscarCandidatosIAModal({ open, onClose, onCompletado, vacante }: Props) {
  const { buscarCandidatos, ejecutando } = useSourcing();
  const [error, setError] = useState<string | null>(null);
  const [resultadoVacio, setResultadoVacio] = useState<{
    queryUsada?: string;
    fuentes?: string[];
    urlsRotas?: number;
  } | null>(null);

  async function ejecutar() {
    setError(null);
    setResultadoVacio(null);
    try {
      const res = await buscarCandidatos(vacante.id);
      if (res.modo === 'clay') {
        onCompletado(res.busqueda_id, 0);
        return;
      }
      if (res.encontrados === 0) {
        setResultadoVacio({
          queryUsada: res.query_usada,
          fuentes: res.fuentes_consultadas,
          urlsRotas: res.urls_rotas,
        });
        return;
      }
      onCompletado(res.busqueda_id, res.encontrados ?? 0);
    } catch (e) {
      setError(humanizarError(e));
    }
  }

  /**
   * Convierte errores técnicos crudos (JSON de Gemini, deadline-exceeded) en
   * mensajes accionables para el analista.
   */
  function humanizarError(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (/503|UNAVAILABLE|high demand/i.test(raw)) {
      return (
        'Gemini está sobrecargado en este momento (high demand de Google). ' +
        'Intentamos varios reintentos automáticos y un modelo de respaldo, ' +
        'pero todos estuvieron saturados. Espera 1-2 minutos y vuelve a darle.'
      );
    }
    if (/deadline-exceeded|timeout/i.test(raw)) {
      return (
        'La búsqueda tardó más de lo esperado y se canceló. Puede ser carga ' +
        'temporal de Gemini — intenta de nuevo en un minuto.'
      );
    }
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
      return (
        'Se alcanzó el límite diario de la API de Gemini (free tier). ' +
        'Si esto pasa seguido, considera habilitar facturación para subir el cupo.'
      );
    }
    if (/GEMINI_API_KEY|no configurada/i.test(raw)) {
      return (
        'La clave de la API de Gemini no está configurada. Avísale al admin.'
      );
    }
    return raw.length > 280
      ? 'No pudimos ejecutar la búsqueda. El servicio devolvió un error técnico — vuelve a intentar en un momento.'
      : raw;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Buscar candidatos con IA"
      description="Gemini hará deep research sobre perfiles públicos y devolverá hasta 15 personas que coincidan con esta vacante."
      footer={
        <>
          <Button variant="neutral-secondary" onClick={onClose} disabled={ejecutando}>
            Cancelar
          </Button>
          <Button
            variant="brand-primary"
            onClick={ejecutar}
            loading={ejecutando}
            disabled={ejecutando}
            icon={<Sparkles size={13} strokeWidth={1.75} />}
          >
            {ejecutando ? 'Buscando…' : 'Buscar ahora'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Preview vacante */}
        <div className="rounded-md bg-brand-50/40 border border-brand-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-brand-700 mb-1.5">
            Vacante
          </p>
          <p className="text-[15px] font-semibold tracking-[-0.012em] text-text-strong">
            {vacante.cargo_nombre}
          </p>
          <p className="text-[12px] text-text-muted mt-0.5">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          {vacante.consecutivo && (
            <p className="text-[11px] text-text-subtle font-mono mt-1">{vacante.consecutivo}</p>
          )}
        </div>

        {/* Reglas operativas */}
        <ul className="space-y-1.5">
          {[
            <>
              Los candidatos entran con estado{' '}
              <Pill tono="brand">sourceado_por_ia</Pill>.
            </>,
            <>Tú revisas cada uno y decides si avanza al flujo normal (paso 5).</>,
            <>El primer contacto debe incluir un mensaje de opt-in claro (Habeas Data).</>,
            <>La búsqueda toma entre 1 y 3 minutos (Gemini hace varias búsquedas reales). No cierres la ventana — es normal que tarde.</>,
          ].map((txt, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[12px] text-text-body leading-[1.5]"
            >
              <span className="w-1 h-1 rounded-full bg-text-subtle mt-1.5 shrink-0" />
              <span>{txt}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-[12px] text-danger-700 inline-flex items-start gap-2">
            <X size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {resultadoVacio && (
          <div className="rounded-md border border-warning-500/30 bg-warning-50/60 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={14}
                strokeWidth={1.75}
                className="text-warning-700 mt-0.5 shrink-0"
              />
              <div className="flex-1 space-y-2 text-[12px] text-warning-700">
                <p className="font-semibold">Gemini no devolvió candidatos para esta vacante.</p>
                <p className="leading-[1.5]">
                  Esto pasa cuando el rol no tiene huella digital significativa (ej. cargos
                  operativos, juniors, oficios) o cuando los criterios son demasiado genéricos.
                  No es un error técnico — la IA hizo la búsqueda, pero no encontró perfiles
                  públicos verificables.
                </p>
                {(resultadoVacio.urlsRotas ?? 0) > 0 && (
                  <p className="leading-[1.5]">
                    Además, {resultadoVacio.urlsRotas} URL(s) inventadas por la IA fueron
                    descartadas en la validación.
                  </p>
                )}
                <div className="space-y-1 pt-1">
                  <p className="font-semibold text-[11px]">Qué puedes hacer:</p>
                  <ul className="list-disc pl-4 space-y-0.5 leading-[1.45]">
                    <li>Refinar el perfilamiento con palabras clave concretas (herramientas, certificaciones, empresas competencia).</li>
                    <li>Para roles operativos, usar canales tradicionales (cajas de compensación, instituciones, referidos).</li>
                    <li>Reintentar en 1–2 minutos si crees que fue saturación temporal de Gemini.</li>
                  </ul>
                </div>
                {resultadoVacio.queryUsada && (
                  <details className="pt-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-warning-700 hover:text-warning-800">
                      Ver qué buscó Gemini
                    </summary>
                    <div className="mt-1.5 space-y-1 text-[11px] leading-[1.4] text-warning-700/90 pl-2 border-l border-warning-500/30">
                      <p className="break-words">
                        <span className="font-medium">Query:</span>{' '}
                        {resultadoVacio.queryUsada}
                      </p>
                      {resultadoVacio.fuentes && resultadoVacio.fuentes.length > 0 && (
                        <p className="break-words">
                          <span className="font-medium">Fuentes consultadas:</span>{' '}
                          {resultadoVacio.fuentes.slice(0, 5).join(', ')}
                          {resultadoVacio.fuentes.length > 5 && ` (+${resultadoVacio.fuentes.length - 5} más)`}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
