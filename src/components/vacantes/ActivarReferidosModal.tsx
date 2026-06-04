import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Link as LinkIcon, MessageSquare } from 'lucide-react';
import { Modal } from '../ui';
import { Button, Pill } from '../brand';
import { useReferidos } from '../../hooks/useReferidos';
import type { VacanteDoc } from '../../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  vacante: VacanteDoc;
  onGenerada?: () => void;
}

type Plantilla = 'v1' | 'v2' | 'v3';

const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * ActivarReferidosModal · v1 simplificado (decisión JC 2026-06-04).
 *
 * SIN Sheet de RRHH, SIN lista de técnicos, SIN tracking individual:
 *  - Solo genera un mensaje genérico (sin nombre) + el link de la landing pública.
 *  - Karen copia el mensaje y lo manda como pueda — 1 a 1, grupo, difusión.
 *  - Al "marcar como enviadas" queda registro en `referidos_generaciones/`
 *    para saber cuándo y qué plantilla se usó por vacante.
 *
 * Razón del recorte: en esta fase no integramos Sheet ni mensajería. La
 * versión completa con lista personalizada + slug ?ref= + filtro por sede
 * queda dormida en el backend para reactivar cuando se apruebe el
 * presupuesto de WhatsApp Business / Twilio.
 */
export function ActivarReferidosModal({ open, onClose, vacante, onGenerada }: Props) {
  const { marcarEnviadas, ejecutando } = useReferidos();
  const [plantilla, setPlantilla] = useState<Plantilla>('v1');
  const [mensajeEditable, setMensajeEditable] = useState('');
  const [copiado, setCopiado] = useState<'mensaje' | 'link' | 'todo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviadaOk, setEnviadaOk] = useState(false);

  const linkLanding = `${APP_URL}/carreras/${vacante.id}`;

  const mensajeBase = useMemo(
    () => interpolar(TEMPLATES[plantilla], vacante.cargo_nombre, vacante.sede_nombre, linkLanding),
    [plantilla, vacante.cargo_nombre, vacante.sede_nombre, linkLanding],
  );

  // Cuando cambian la plantilla o la vacante, refrescar el editor — pero si
  // Karen ya editó algo manualmente no la pisamos cada render.
  useEffect(() => {
    setMensajeEditable(mensajeBase);
  }, [mensajeBase]);

  // Reset estado al abrir/cerrar.
  useEffect(() => {
    if (!open) {
      setCopiado(null);
      setError(null);
      setEnviadaOk(false);
    }
  }, [open]);

  async function copiar(tipo: 'mensaje' | 'link' | 'todo', texto: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(tipo);
      setTimeout(() => setCopiado((c) => (c === tipo ? null : c)), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopiado(tipo);
        setTimeout(() => setCopiado((c) => (c === tipo ? null : c)), 1800);
      } catch {
        setError('Tu navegador bloqueó el copiado automático. Selecciona el texto y usa Ctrl+C.');
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  async function onMarcarEnviadas() {
    setError(null);
    try {
      await marcarEnviadas({
        vacante_id: vacante.id,
        plantilla,
        mensaje_usado: mensajeEditable,
        link_landing: linkLanding,
      });
      setEnviadaOk(true);
      onGenerada?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el envío.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Activar referidos internos"
      description={`Genera el mensaje listo para compartir con los técnicos · ${vacante.cargo_nombre} · ${vacante.sede_nombre}`}
      footer={
        <>
          <Button variant="neutral-secondary" onClick={onClose} disabled={ejecutando}>
            {enviadaOk ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!enviadaOk && (
            <Button
              variant="brand-primary"
              onClick={onMarcarEnviadas}
              loading={ejecutando}
              disabled={ejecutando}
              icon={<Check size={13} strokeWidth={1.75} />}
            >
              Marcar como enviadas
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Plantillas */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle mb-2">
            Plantilla del mensaje
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['v1', 'v2', 'v3'] as Plantilla[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlantilla(p)}
                className={
                  'text-left rounded-md border p-2.5 transition-colors ' +
                  (plantilla === p
                    ? 'border-brand-500 bg-brand-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300')
                }
              >
                <p className="text-[12px] font-semibold text-text-strong">{LABEL[p]}</p>
                <p className="text-[10px] text-text-muted mt-0.5 leading-[1.4]">{HINT[p]}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Mensaje editable */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle inline-flex items-center gap-1.5">
              <MessageSquare size={11} strokeWidth={1.75} /> Mensaje
            </p>
            <button
              type="button"
              onClick={() => copiar('mensaje', mensajeEditable)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-800"
            >
              <Copy size={11} strokeWidth={1.75} />
              {copiado === 'mensaje' ? 'Copiado' : 'Copiar mensaje'}
            </button>
          </div>
          <textarea
            value={mensajeEditable}
            onChange={(e) => setMensajeEditable(e.target.value)}
            rows={6}
            className="block w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2.5 text-[13px] text-text-strong leading-[1.5] focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 font-mono"
          />
          <p className="text-[11px] text-text-subtle mt-1.5 leading-[1.4]">
            Puedes editarlo antes de copiar. El link de la landing ya está incluido al final.
          </p>
        </div>

        {/* Link aislado */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle inline-flex items-center gap-1.5">
              <LinkIcon size={11} strokeWidth={1.75} /> Link de la vacante
            </p>
            <button
              type="button"
              onClick={() => copiar('link', linkLanding)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-800"
            >
              <Copy size={11} strokeWidth={1.75} />
              {copiado === 'link' ? 'Copiado' : 'Copiar link'}
            </button>
          </div>
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] font-mono text-text-strong break-all">
            {linkLanding}
          </div>
        </div>

        {/* Reglas operativas */}
        <div className="rounded-md bg-brand-50/40 border border-brand-200 p-3 text-[12px] text-text-body leading-[1.5]">
          <p className="font-semibold text-brand-700 mb-1">¿Cómo se usa?</p>
          <ul className="space-y-1 list-disc pl-4">
            <li>Copia el mensaje y mándalo por WhatsApp — 1 a 1, a un grupo o a una lista de difusión.</li>
            <li>El mensaje es genérico (sin nombre), así que puedes usarlo igual en difusión sin editarlo persona por persona.</li>
            <li>Cuando termines de mandar, marca "Enviadas" — queda registro de la fecha y la plantilla usada.</li>
            <li>
              <span className="font-semibold">La plataforma no envía nada por sí sola.</span> El
              envío lo hace una persona.
            </li>
          </ul>
        </div>

        {/* Estados */}
        {enviadaOk && (
          <div className="rounded-md border border-success-500/30 bg-success-50/60 px-3 py-2.5 text-[12px] text-success-700 inline-flex items-start gap-2">
            <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>Registrado. Quedó la marca de "invitaciones enviadas" en la vacante.</span>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-[12px] text-danger-700">
            {error}
          </div>
        )}

        <Pill tono="neutral">v1 simple · sin Sheet · sin tracking individual</Pill>
      </div>
    </Modal>
  );
}

const TEMPLATES: Record<Plantilla, string> = {
  v1: `¡Hola! 👋
Te escribimos de Atracción Equitel. Abrimos una vacante de [CARGO] en [SEDE].
¿Conoces a alguien de confianza buscando empleo? Pásale este link para que aplique:
[LINK]
¡Gracias! 🙌`,
  v2: `¡Hola! Buscamos [CARGO] para [SEDE].
¿Conoces a alguien bueno? Pásale este link:
[LINK]`,
  v3: `¡Hola equipo! 🔧
Abrimos vacante de [CARGO] en [SEDE]. ¿Conoces gente que le sirva?
Pásales este link:
[LINK]`,
};

const LABEL: Record<Plantilla, string> = {
  v1: 'V1 · Cercano',
  v2: 'V2 · Corto',
  v3: 'V3 · Gremio',
};

const HINT: Record<Plantilla, string> = {
  v1: 'Saludo + agradecimiento.',
  v2: 'Directo al grano, mobile-first.',
  v3: 'Tono informal para grupos.',
};

function interpolar(tpl: string, cargo: string, sede: string, link: string): string {
  return tpl
    .replace(/\[CARGO\]/g, cargo)
    .replace(/\[SEDE\]/g, sede)
    .replace(/\[LINK\]/g, link);
}
