import { Mail, MessageCircle } from 'lucide-react';
import { CONTACTO_ATRACCION } from '../../portal/faseProceso';

/**
 * PortalAyuda · F7 · canal de ayuda, siempre visible.
 *
 * Botón de correo al analista del proceso (fallback a la config). WhatsApp queda
 * enganchable: solo se muestra si `CONTACTO_ATRACCION.whatsapp` tiene número.
 */
export function PortalAyuda({
  analistaEmail,
  cargo,
}: {
  analistaEmail: string;
  cargo: string;
}) {
  const correo = (analistaEmail || CONTACTO_ATRACCION.correo_fallback).trim();
  const asunto = encodeURIComponent(`Duda sobre mi proceso${cargo ? ` · ${cargo}` : ''}`);
  const wa = CONTACTO_ATRACCION.whatsapp.trim();
  // Abre el redactor de Gmail (no el cliente por defecto del equipo).
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    correo,
  )}&su=${asunto}`;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">¿Dudas?</h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          Si algo no te queda claro, escríbenos. Con gusto te ayudamos.
        </p>
      </div>
      <div className="px-5 sm:px-7 py-5 flex flex-wrap gap-2.5">
        <a
          href={gmailUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-700"
        >
          <Mail size={15} strokeWidth={1.9} />
          Escribir un correo
        </a>
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-[13px] font-semibold text-text-strong hover:bg-slate-50"
          >
            <MessageCircle size={15} strokeWidth={1.9} />
            WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
