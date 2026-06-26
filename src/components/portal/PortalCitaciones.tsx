import { CalendarPlus, MapPin, Stethoscope, Video } from 'lucide-react';

/**
 * PortalCitaciones · F3 · próximas citas del candidato.
 *
 * Muestra (si existen) la próxima entrevista y la orden de exámenes médicos, con
 * fecha legible es-CO (zona Bogotá) y botón "Agregar a Google Calendar" para la
 * entrevista. Solo lectura; los datos los entrega el resolver tras la cédula.
 */

export interface CitaEntrevista {
  programada_para_ms: number | null;
  modalidad: string;
  sala_o_link: string;
  tipo: string;
}
export interface CitaExamen {
  centro_medico: string;
  orden_direccion: string;
  orden_url: string;
  orden_instrucciones: string;
  cita_para_ms: number | null;
}

const DURACION_ENTREVISTA_MIN = 45;

function fechaLegible(ms: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  }).format(new Date(ms));
}

function modalidadLabel(m: string): string {
  return m === 'presencial' ? 'Presencial' : m === 'telefonica' ? 'Telefónica' : 'Virtual';
}

function gcalUrl(args: { titulo: string; inicioMs: number; detalle: string; ubicacion: string }): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const inicio = new Date(args.inicioMs);
  const fin = new Date(args.inicioMs + DURACION_ENTREVISTA_MIN * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.titulo,
    dates: `${fmt(inicio)}/${fmt(fin)}`,
    details: args.detalle,
    location: args.ubicacion,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function PortalCitaciones({
  entrevista,
  examen,
  cargo,
}: {
  entrevista: CitaEntrevista | null;
  examen: CitaExamen | null;
  cargo: string;
}) {
  const tieneEntrevista = entrevista && entrevista.programada_para_ms;
  const tieneExamen =
    examen && (examen.centro_medico || examen.orden_direccion || examen.orden_url);
  if (!tieneEntrevista && !tieneExamen) return null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
          Tus próximas citas
        </h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          Agéndalas para no perderlas. Cualquier cambio te lo avisamos.
        </p>
      </div>
      <div className="px-5 sm:px-7 py-5 space-y-4">
        {tieneEntrevista && entrevista && entrevista.programada_para_ms && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-text-strong">
              {entrevista.modalidad === 'presencial' ? (
                <MapPin size={15} strokeWidth={1.9} className="text-brand-600" />
              ) : (
                <Video size={15} strokeWidth={1.9} className="text-brand-600" />
              )}
              Entrevista {entrevista.tipo === 'lider' ? 'con el líder' : 'de atracción'}
            </div>
            <p className="text-[13.5px] text-text-strong mt-1.5 capitalize">
              {fechaLegible(entrevista.programada_para_ms)}
            </p>
            <p className="text-[12px] text-text-muted mt-0.5">
              Modalidad: {modalidadLabel(entrevista.modalidad)}
            </p>
            {entrevista.sala_o_link && (
              <p className="text-[12.5px] mt-1 break-words">
                {entrevista.modalidad === 'presencial' ? 'Dirección: ' : 'Link: '}
                {/^https?:\/\//.test(entrevista.sala_o_link) ? (
                  <a
                    href={entrevista.sala_o_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    {entrevista.sala_o_link}
                  </a>
                ) : (
                  <span className="text-text-body">{entrevista.sala_o_link}</span>
                )}
              </p>
            )}
            <a
              href={gcalUrl({
                titulo: `Entrevista Equitel · ${cargo}`,
                inicioMs: entrevista.programada_para_ms,
                detalle: `Entrevista (${modalidadLabel(entrevista.modalidad)}) para el cargo ${cargo}.${
                  entrevista.sala_o_link ? `\n${entrevista.sala_o_link}` : ''
                }`,
                ubicacion: entrevista.sala_o_link,
              })}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-700"
            >
              <CalendarPlus size={14} strokeWidth={2} />
              Agregar a Google Calendar
            </a>
          </div>
        )}

        {tieneExamen && examen && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-text-strong">
              <Stethoscope size={15} strokeWidth={1.9} className="text-brand-600" />
              Exámenes médicos de ingreso
            </div>
            {examen.cita_para_ms && (
              <p className="text-[13.5px] text-text-strong mt-1.5 capitalize">
                {fechaLegible(examen.cita_para_ms)}
              </p>
            )}
            {examen.centro_medico && (
              <p className="text-[13px] text-text-strong mt-1.5">
                Centro médico: <span className="font-medium">{examen.centro_medico}</span>
              </p>
            )}
            {examen.orden_direccion && (
              <p className="text-[12.5px] text-text-muted mt-0.5">{examen.orden_direccion}</p>
            )}
            {examen.orden_instrucciones && (
              <p className="text-[12.5px] text-text-body mt-1.5 whitespace-pre-line">
                {examen.orden_instrucciones}
              </p>
            )}
            {examen.cita_para_ms && (
              <a
                href={gcalUrl({
                  titulo: `Exámenes médicos Equitel · ${cargo}`,
                  inicioMs: examen.cita_para_ms,
                  detalle: `Exámenes médicos de ingreso para el cargo ${cargo}.${
                    examen.centro_medico ? `\nCentro: ${examen.centro_medico}` : ''
                  }`,
                  ubicacion: examen.orden_direccion || examen.centro_medico || '',
                })}
                target="_blank"
                rel="noreferrer"
                className="mt-3 mr-2 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-text-strong hover:bg-slate-50"
              >
                <CalendarPlus size={14} strokeWidth={2} />
                Agregar a Google Calendar
              </a>
            )}
            {examen.orden_url && (
              <a
                href={examen.orden_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-700"
              >
                Ver / descargar tu orden médica
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
