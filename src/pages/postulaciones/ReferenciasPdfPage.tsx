import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Pill } from '../../components/brand';
import type { PostulacionDoc, ReferenciaDoc } from '../../schemas';

/**
 * ReferenciasPdfPage · formato oficial VIDA-F-12 v2 imprimible.
 *
 * Mismo patrón que ConceptoAtraccionPage: header/controles en lenguaje brand
 * (no se imprimen) + hoja oficial con bordes negros para exportar a PDF /
 * imprimir. Lista todas las referencias verificadas del candidato.
 */

const RELACION_LABEL: Record<string, string> = {
  jefe_directo: 'Jefe directo',
  jefe_indirecto: 'Jefe indirecto',
  par: 'Par / compañero',
  subordinado: 'Subordinado',
  cliente_interno: 'Cliente interno',
  otro: 'Otro',
};

const RESULTADO_LABEL: Record<string, string> = {
  positiva: 'Positiva',
  neutra: 'Neutra',
  negativa: 'Negativa',
};

const RECONTRATARIA_LABEL: Record<string, string> = {
  si: 'Sí',
  no: 'No',
  con_reservas: 'Con reservas',
};

export default function ReferenciasPdfPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: postulacion } = useDoc<PostulacionDoc>('postulaciones', id);
  const { docs: referencias } = useColeccion<ReferenciaDoc>('referencias', {
    filtros: id ? [['postulacion_id', '==', id]] : [],
    orden: ['creado_en', 'asc'],
  });

  function imprimir() {
    window.print();
  }

  if (!postulacion) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">
        Cargando postulación…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      {/* Controles (no se imprimen) */}
      <div className="print:hidden">
        <Link
          to={`/postulaciones/${postulacion.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Volver al candidato
        </Link>
        <div className="mt-6 flex items-start justify-between flex-wrap gap-6">
          <div>
            <Pill tono="brand" dot>
              Paso 9 · Verificación de referencias
            </Pill>
            <h1
              className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
              style={{ textWrap: 'balance' }}
            >
              Verificación de Referencias
            </h1>
            <p className="mt-3 text-[14px] text-text-muted leading-[1.55] max-w-xl">
              Formato oficial VIDA-F-12 v2. Exporta a PDF para anexarlo al expediente del
              candidato.
            </p>
          </div>
          <Button
            onClick={imprimir}
            variant="brand-primary"
            icon={<Printer size={13} strokeWidth={1.75} />}
          >
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {referencias.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center print:hidden">
          <p className="text-[13px] text-text-muted">
            Este candidato aún no tiene referencias registradas. Agrégalas en la pestaña
            Referencias antes de exportar.
          </p>
        </div>
      )}

      {/* Hoja oficial imprimible */}
      {referencias.length > 0 && (
        <div className="bg-white border border-slate-300 print:border-0 print:p-0 p-8 shadow-brand-card print:shadow-none">
          {/* Encabezado oficial */}
          <header className="flex items-center justify-between gap-6 border border-text-strong">
            <div className="flex items-center gap-4 px-4 py-3 border-r border-text-strong">
              <EquitelLogo size={56} />
            </div>
            <div className="flex-1 text-center py-3 px-4">
              <p className="text-[13px] font-bold uppercase tracking-wide text-text-strong">
                Organización Equitel
              </p>
              <p className="text-[13px] font-bold uppercase tracking-wide text-text-strong">
                Cultura y Desarrollo
              </p>
              <p className="text-[13px] font-bold uppercase tracking-wide text-text-strong">
                Verificación de Referencias
              </p>
            </div>
            <div className="border-l border-text-strong text-[11px] tabular-nums">
              <div className="flex border-b border-text-strong">
                <span className="px-3 py-1.5 font-bold border-r border-text-strong w-24">CÓDIGO</span>
                <span className="px-3 py-1.5 w-24">VIDA-F-12</span>
              </div>
              <div className="flex border-b border-text-strong">
                <span className="px-3 py-1.5 font-bold border-r border-text-strong w-24">VERSIÓN</span>
                <span className="px-3 py-1.5 w-24">2</span>
              </div>
              <div className="flex">
                <span className="px-3 py-1.5 font-bold border-r border-text-strong w-24">PÁGINA</span>
                <span className="px-3 py-1.5 w-24">1 DE 1</span>
              </div>
            </div>
          </header>

          {/* Datos del candidato */}
          <div className="border-x border-b border-text-strong grid grid-cols-1 sm:grid-cols-2 text-[12px]">
            <FilaDato label="Candidato" valor={postulacion.candidato_nombre} />
            <FilaDato label="Cargo" valor={postulacion.cargo_nombre} />
            <FilaDato label="Consecutivo vacante" valor={postulacion.vacante_consecutivo} />
            <FilaDato
              label="Referencias verificadas"
              valor={`${referencias.filter((r) => r.verificada).length} de ${referencias.length}`}
            />
          </div>

          {/* Una sección por referencia */}
          <div className="mt-6 space-y-6">
            {referencias.map((r, i) => (
              <div key={r.id} className="border border-text-strong">
                <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-100 px-4 py-2 border-b border-text-strong">
                  <p className="text-[13px] font-bold text-text-strong">
                    Referencia {i + 1}: {r.nombre_contacto}
                    {r.cargo_contacto ? ` · ${r.cargo_contacto}` : ''}
                  </p>
                  {r.resultado && (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-strong">
                      Resultado: {RESULTADO_LABEL[r.resultado] ?? r.resultado}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 text-[12px] border-b border-text-strong">
                  <FilaDato label="Empresa" valor={r.empresa_contactada} />
                  <FilaDato
                    label="Relación laboral"
                    valor={r.relacion_laboral ? RELACION_LABEL[r.relacion_laboral] ?? r.relacion_laboral : '—'}
                  />
                  <FilaDato label="Teléfono" valor={r.telefono_contacto || '—'} />
                  <FilaDato label="Correo" valor={r.email_contacto || '—'} />
                  <FilaDato label="Cargo del aspirante" valor={r.cargo_aspirante || '—'} />
                  <FilaDato label="Tiempo laborado" valor={r.tiempo_laborado || '—'} />
                </div>

                <div className="text-[12px]">
                  <CampoLargo label="Funciones / responsabilidades" valor={r.funciones_responsabilidades} />
                  <CampoLargo label="Fortalezas / características" valor={r.fortalezas_caracteristicas} />
                  <CampoLargo label="Logros" valor={r.logros} />
                  <CampoLargo label="Áreas de mejora" valor={r.areas_mejora} />
                  <CampoLargo label="Descripción del desempeño" valor={r.descripcion_desempeno} />
                  <CampoLargo
                    label="¿Lo contrataría otra vez?"
                    valor={
                      (r.recontrataria ? RECONTRATARIA_LABEL[r.recontrataria] ?? r.recontrataria : '—') +
                      (r.recontrataria_porque ? ` — ${r.recontrataria_porque}` : '')
                    }
                  />
                  <CampoLargo label="Motivo de retiro" valor={r.motivo_retiro} />
                  <CampoLargo label="Observaciones" valor={r.observaciones} ultimo />
                </div>

                {r.verificada && (
                  <div className="px-4 py-2 border-t border-text-strong text-[11px] text-text-muted">
                    Verificada por {r.verificada_por_nombre ?? '—'}
                    {r.verificada_en ? ` el ${formatearFecha(r.verificada_en.toDate())}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaDato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex border-b border-text-strong/40 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <span className="px-3 py-1.5 font-bold w-40 shrink-0 border-r border-text-strong/40">
        {label}
      </span>
      <span className="px-3 py-1.5 text-text-body break-words">{valor || '—'}</span>
    </div>
  );
}

function CampoLargo({
  label,
  valor,
  ultimo,
}: {
  label: string;
  valor: string;
  ultimo?: boolean;
}) {
  return (
    <div className={ultimo ? '' : 'border-b border-text-strong/40'}>
      <p className="px-4 pt-2 font-bold text-text-strong">{label}</p>
      <p className="px-4 pb-2 pt-0.5 text-text-body whitespace-pre-line leading-[1.5]">
        {valor || '—'}
      </p>
    </div>
  );
}
