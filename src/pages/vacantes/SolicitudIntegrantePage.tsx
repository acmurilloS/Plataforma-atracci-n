import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Printer, Save } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import type { SolicitudIntegranteDoc, VacanteDoc } from '../../schemas';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Pill } from '../../components/brand';

/**
 * SolicitudIntegrantePage · controles brand + hoja oficial VIDA-F-01 v08.
 *
 * Auto-llena desde la vacante lo que ya se captura (paso 1) y deja completar los
 * campos que el formato pide y la vacante no guarda. Exporta a PDF / imprime.
 */

const TIPO_LABEL: Record<string, string> = {
  aumento_planta: 'Aumento de planta',
  reemplazo_indefinido: 'Reemplazo (indefinido)',
  necesidad_temporal: 'Necesidad temporal',
  aumento: 'Aumento de planta',
  reemplazo: 'Reemplazo',
};

/** Campos editables del formato (los que la vacante no captura). */
interface FormSolicitud {
  cargo_solicitante: string;
  cargo_reporta: string;
  tipo_vinculacion: string;
  sistemas: string;
  preferible_poseer: string;
  disponibilidad_viajar: string;
  trabajo_en: string;
  rodamiento_valor: string;
  bonificaciones_texto: string;
  garantizado_total: string;
  valor_prestacional: string;
  valor_no_prestacional: string;
  garantizado_tiempo: string;
  observaciones: string;
}

const FORM_VACIO: FormSolicitud = {
  cargo_solicitante: '',
  cargo_reporta: '',
  tipo_vinculacion: '',
  sistemas: '',
  preferible_poseer: '',
  disponibilidad_viajar: '',
  trabajo_en: '',
  rodamiento_valor: '',
  bonificaciones_texto: '',
  garantizado_total: '',
  valor_prestacional: '',
  valor_no_prestacional: '',
  garantizado_tiempo: '',
  observaciones: '',
};

function pesos(n: number | undefined): string {
  if (n == null) return '—';
  return `$ ${n.toLocaleString('es-CO')}`;
}

export default function SolicitudIntegrantePage() {
  const { id } = useParams<{ id: string }>();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { docs: solicitudes } = useColeccion<SolicitudIntegranteDoc>('solicitudes_integrante', {
    filtros: id ? [['vacante_id', '==', id]] : [],
    limit: 1,
  });
  const { crear, actualizar } = useMutacion();

  const solicitud = solicitudes[0] ?? null;

  const [form, setForm] = useState<FormSolicitud>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!solicitud) return;
    setForm({
      cargo_solicitante: solicitud.cargo_solicitante ?? '',
      cargo_reporta: solicitud.cargo_reporta ?? '',
      tipo_vinculacion: solicitud.tipo_vinculacion ?? '',
      sistemas: solicitud.sistemas ?? '',
      preferible_poseer: solicitud.preferible_poseer ?? '',
      disponibilidad_viajar: solicitud.disponibilidad_viajar ?? '',
      trabajo_en: solicitud.trabajo_en ?? '',
      rodamiento_valor: solicitud.rodamiento_valor ?? '',
      bonificaciones_texto: solicitud.bonificaciones_texto ?? '',
      garantizado_total: solicitud.garantizado_total ?? '',
      valor_prestacional: solicitud.valor_prestacional ?? '',
      valor_no_prestacional: solicitud.valor_no_prestacional ?? '',
      garantizado_tiempo: solicitud.garantizado_tiempo ?? '',
      observaciones: solicitud.observaciones ?? '',
    });
  }, [solicitud]);

  function set<K extends keyof FormSolicitud>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
    setGuardado(false);
  }

  async function guardar() {
    if (!vacante) return;
    setGuardando(true);
    setErr(null);
    try {
      const payload = {
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        ...form,
      };
      if (solicitud) {
        await actualizar('solicitudes_integrante', solicitud.id, payload);
      } else {
        await crear('solicitudes_integrante', payload);
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (!vacante)
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-text-muted text-sm">Cargando vacante…</div>
    );

  const reemplaza =
    vacante.tipo_solicitud === 'reemplazo_indefinido' && vacante.reemplaza_a_nombre
      ? vacante.reemplaza_a_nombre
      : 'NA';
  const tiempoReemplazo =
    vacante.tipo_solicitud === 'necesidad_temporal' && vacante.temporalidad_meses != null
      ? `${vacante.temporalidad_meses} mes${vacante.temporalidad_meses === 1 ? '' : 'es'}`
      : 'NA';

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      {/* Controles · no se imprimen */}
      <div className="print:hidden">
        <Link
          to={`/vacantes/${vacante.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Volver al detalle
        </Link>
        <div className="mt-6 flex items-start justify-between flex-wrap gap-6">
          <div>
            <Pill tono="brand" dot>
              Paso 1 · VIDA-F-01
            </Pill>
            <h1
              className="mt-4 text-[40px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
              style={{ textWrap: 'balance' }}
            >
              Solicitud de Integrantes
            </h1>
            <p className="mt-3 text-[14px] text-text-muted leading-[1.55] max-w-xl">
              Formato oficial VIDA-F-01 v08. Lo de la vacante sale solo; completa los campos que
              falten (condiciones, reporte, rodamiento…), guarda y exporta a PDF.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {guardado && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
                <Check size={13} strokeWidth={2} />
                Guardado
              </span>
            )}
            <Button
              onClick={guardar}
              disabled={guardando}
              loading={guardando}
              variant="brand-primary"
              icon={<Save size={13} strokeWidth={1.75} />}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button
              onClick={() => window.print()}
              variant="neutral-secondary"
              icon={<Printer size={13} strokeWidth={1.75} />}
            >
              Imprimir / PDF
            </Button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 print:hidden">
          {err}
        </div>
      )}

      {/* Hoja oficial VIDA-F-01 */}
      <div className="bg-white border border-slate-300 print:border-0 print:p-0 p-8 shadow-brand-card print:shadow-none text-text-strong">
        <header className="flex items-stretch justify-between border border-text-strong">
          <div className="flex items-center gap-3 px-4 py-3 border-r border-text-strong">
            <EquitelLogo size={52} />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center py-2 px-4">
            <p className="text-[13px] font-bold uppercase tracking-wide">Organización Equitel</p>
            <p className="text-[12px] font-bold uppercase tracking-wide">Cultura y Desarrollo</p>
            <p className="text-[13px] font-bold uppercase tracking-wide">Solicitud de Integrantes</p>
          </div>
          <div className="border-l border-text-strong text-[11px] tabular-nums">
            <CajaCodigo label="Código" valor="VIDA-F-01" />
            <CajaCodigo label="Versión" valor="08" borde />
            <CajaCodigo label="Consecutivo" valor={vacante.consecutivo || '—'} borde />
          </div>
        </header>

        <div className="border-x border-b border-text-strong px-3 py-1.5 text-[10.5px] italic text-text-body">
          Objetivo: garantizar la recopilación de los datos necesarios para iniciar un proceso de
          atracción, que cumpla con los requisitos y expectativas de necesidad de integrantes.
        </div>

        {/* Datos del solicitante */}
        <Barra>Datos del solicitante</Barra>
        <Bloque>
          <Fila label="Fecha de solicitud">
            {formatearFecha((vacante.creado_en?.toDate?.() ?? new Date()) as Date)}
          </Fila>
          <Fila label="Solicitante">{vacante.lider_nombre}</Fila>
          <Fila label="Cargo del solicitante">
            <Entrada value={form.cargo_solicitante} onChange={(v) => set('cargo_solicitante', v)} />
          </Fila>
        </Bloque>

        {/* Detalles del cargo */}
        <Barra>Detalles del cargo</Barra>
        <Bloque>
          <Fila label="Cargo que solicita">{vacante.cargo_nombre}</Fila>
          <Fila label="Empresa">{vacante.empresa_nombre}</Fila>
          <Fila label="Unidad / área">{vacante.unidad_nombre}</Fila>
          <Fila label="Sede">{vacante.sede_nombre}</Fila>
          <Fila label="Cargo al que reporta">
            <Entrada value={form.cargo_reporta} onChange={(v) => set('cargo_reporta', v)} />
          </Fila>
          <Fila label="Tipo de vinculación">
            <Entrada
              value={form.tipo_vinculacion}
              onChange={(v) => set('tipo_vinculacion', v)}
              placeholder="De planta / temporal"
            />
          </Fila>
          <Fila label="Sistemas (herramientas)">
            <Entrada
              value={form.sistemas}
              onChange={(v) => set('sistemas', v)}
              placeholder="¿Requiere sistemas/herramientas? Sí / No / cuáles"
            />
          </Fila>
          <Fila label="Motivo de la solicitud">
            {TIPO_LABEL[vacante.tipo_solicitud] ?? vacante.tipo_solicitud}
          </Fila>
          <Fila label="A quién reemplaza">{reemplaza}</Fila>
          <Fila label="Tiempo (si reemplazo temporal)">{tiempoReemplazo}</Fila>
          <Fila label="Preferible poseer">
            <Entrada
              value={form.preferible_poseer}
              onChange={(v) => set('preferible_poseer', v)}
              placeholder="Vehículo / moto / indiferente"
            />
          </Fila>
          <Fila label="Disponibilidad para viajar">
            <Entrada
              value={form.disponibilidad_viajar}
              onChange={(v) => set('disponibilidad_viajar', v)}
              placeholder="Sí / No"
            />
          </Fila>
          <Fila label="Trabajo en">
            <Entrada
              value={form.trabajo_en}
              onChange={(v) => set('trabajo_en', v)}
              placeholder="Campo / sede / in house"
            />
          </Fila>
        </Bloque>

        {/* Condiciones salariales */}
        <Barra>Condiciones salariales</Barra>
        <Bloque>
          <Fila label="Salario básico mensual">{pesos(vacante.salario_base)}</Fila>
          <Fila label="Auxilio de rodamiento">{vacante.rodamiento ? 'Sí' : 'No'}</Fila>
          <Fila label="Valor del auxilio de rodamiento">
            <Entrada value={form.rodamiento_valor} onChange={(v) => set('rodamiento_valor', v)} />
          </Fila>
          <Fila label="Esquema de comisiones">{vacante.comisiones_texto || '—'}</Fila>
          <Fila label="Esquema de bonificaciones">
            <EntradaArea
              value={form.bonificaciones_texto}
              onChange={(v) => set('bonificaciones_texto', v)}
            />
          </Fila>
          <Fila label="Garantizado total">
            <Entrada value={form.garantizado_total} onChange={(v) => set('garantizado_total', v)} />
          </Fila>
          <Fila label="Valor prestacional y/o %">
            <Entrada value={form.valor_prestacional} onChange={(v) => set('valor_prestacional', v)} />
          </Fila>
          <Fila label="Valor no prestacional y/o %">
            <Entrada
              value={form.valor_no_prestacional}
              onChange={(v) => set('valor_no_prestacional', v)}
            />
          </Fila>
          <Fila label="Tiempo del garantizado">
            <Entrada
              value={form.garantizado_tiempo}
              onChange={(v) => set('garantizado_tiempo', v)}
            />
          </Fila>
        </Bloque>

        {/* Observaciones */}
        <Barra>Observaciones adicionales</Barra>
        <Bloque>
          <Fila label="Observaciones">
            <EntradaArea value={form.observaciones} onChange={(v) => set('observaciones', v)} />
          </Fila>
        </Bloque>
      </div>
    </div>
  );
}

function CajaCodigo({ label, valor, borde }: { label: string; valor: string; borde?: boolean }) {
  return (
    <div className={`flex ${borde ? 'border-t border-text-strong' : ''}`}>
      <span className="px-3 py-1.5 font-bold border-r border-text-strong w-28 uppercase">
        {label}
      </span>
      <span className="px-3 py-1.5 w-28">{valor}</span>
    </div>
  );
}

function Barra({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-x border-t border-text-strong bg-slate-200 print:bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-center">
      {children}
    </div>
  );
}

function Bloque({ children }: { children: React.ReactNode }) {
  return <div className="border-x border-b border-text-strong">{children}</div>;
}

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex border-t border-text-strong first:border-t-0">
      <div className="w-52 shrink-0 px-3 py-1.5 bg-slate-100 print:bg-white border-r border-text-strong font-bold text-[11px] uppercase tracking-wide">
        {label}
      </div>
      <div className="flex-1 px-1 py-0.5 text-[12px] flex items-center">{children}</div>
    </div>
  );
}

function Entrada({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1 text-[12px] border-0 bg-transparent focus:bg-brand-50/40 focus:outline-none print:placeholder:text-transparent"
    />
  );
}

function EntradaArea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className="w-full px-2 py-1 text-[12px] border-0 bg-transparent resize-none focus:bg-brand-50/40 focus:outline-none"
    />
  );
}
