import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  User2,
} from 'lucide-react';
import { FlujogramaTimeline } from '../components/FlujogramaTimeline';
import { PoliticaCriticidadBanner } from '../components/vacantes/PoliticaCriticidadBanner';
import { BitacoraReprocesos } from '../components/vacantes/BitacoraReprocesos';
import { Card, Pill, type PillTono } from '../components/brand';
import { useVacantes } from '../hooks/useVacantes';
import { formatearFecha } from '../utils/fechas';
import { formatearCOP } from '../utils/moneda';
import { TIPO_SOLICITUD_LABEL, type VacanteDoc } from '../schemas';

/**
 * VacanteDetallePage · sistema brand.
 *
 * Hero header con eyebrow consecutivo + h1 hairline + meta empresa/sede.
 * Pill de estado con tono brand semántico. Cards flat con secciones bien
 * espaciadas (space-y-10). Datos en formato dt/dd con tipografía Inter
 * + tabular-nums donde aplica.
 */

const ESTADO_TONO: Record<string, PillTono> = {
  borrador: 'neutral',
  aprobada: 'brand',
  lista_para_publicar: 'brand',
  publicada: 'warning',
  en_proceso: 'info',
  terna_enviada: 'danger',
  seleccionado: 'danger',
  en_contratacion: 'success',
  cerrada: 'success',
  desierta: 'neutral',
  cancelada: 'neutral',
  pausada: 'warning',
};

export default function VacanteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { suscribirVacante } = useVacantes();
  const [vac, setVac] = useState<VacanteDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setErr(null);
    try {
      return suscribirVacante(id, setVac, (msg) => setErr(msg));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cargar la vacante.');
    }
  }, [id, suscribirVacante]);

  if (err) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {err}
        </div>
      </div>
    );
  }
  if (!vac) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-sm text-text-muted">Cargando vacante…</div>
    );
  }

  const fechaPropuesta = vac.fecha_entrevista_propuesta?.toDate?.() ?? null;
  const fechaPactada = vac.fecha_entrevista_pactada?.toDate?.() ?? null;
  const avalAprobadoEn = vac.aval_aprobado_en?.toDate?.() ?? null;
  const tono = ESTADO_TONO[vac.estado] ?? 'neutral';

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      {/* Volver */}
      <Link
        to="/seguimiento"
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver a seguimiento
      </Link>

      {/* ─── Hero header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-6">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-subtle">
            {vac.consecutivo || 'Generando consecutivo…'}
          </p>
          <h1
            className="mt-2 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            {vac.cargo_nombre}
          </h1>
          <p className="mt-3 flex items-center gap-1.5 text-[14px] text-text-muted">
            <Building2 size={13} strokeWidth={1.5} className="text-text-subtle" />
            {vac.empresa_nombre} · {vac.sede_nombre} · {vac.unidad_nombre}
          </p>
        </div>
        <Pill tono={tono} dot className="self-start">
          {vac.estado.replace(/_/g, ' ')}
        </Pill>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Link
          to={`/vacantes/${vac.id}/solicitud-integrante`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
        >
          <FileText size={13} strokeWidth={1.75} />
          Solicitud de Integrantes (VIDA-F-01)
        </Link>
      </div>

      <PoliticaCriticidadBanner criticidad={vac.criticidad} />

      {/* ─── Empresa y cargo ─────────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<Layers size={12} strokeWidth={1.75} />}>
          Identificación
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            <Dato label="Empresa" valor={`${vac.empresa_nombre} (${vac.empresa_codigo})`} />
            <Dato label="Sede" valor={`${vac.sede_nombre} (${vac.sede_codigo})`} />
            <Dato label="Unidad" valor={vac.unidad_nombre} />
            <Dato label="Criticidad" valor={vac.criticidad} mono />
            <Dato
              label="Tipo de solicitud"
              valor={TIPO_SOLICITUD_LABEL[vac.tipo_solicitud] ?? vac.tipo_solicitud}
            />
            {vac.tipo_solicitud === 'reemplazo_indefinido' && vac.reemplaza_a_nombre && (
              <Dato label="Reemplaza a" valor={vac.reemplaza_a_nombre} />
            )}
            {vac.tipo_solicitud === 'necesidad_temporal' && vac.temporalidad_meses != null && (
              <Dato
                label="Duración estimada"
                valor={`${vac.temporalidad_meses} mes${vac.temporalidad_meses === 1 ? '' : 'es'}`}
              />
            )}
            <Dato label="Líder solicitante" valor={vac.lider_nombre} />
          </div>
        </Card>
      </section>

      {/* ─── Condiciones ─────────────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<CircleDollarSign size={12} strokeWidth={1.75} />}>
          Condiciones
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            <Dato label="Salario base" valor={formatearCOP(vac.salario_base)} hero />
            <Dato
              label="En banda"
              valor={
                vac.en_banda === null
                  ? 'Sin banda definida'
                  : vac.en_banda
                    ? 'Sí'
                    : 'No · a validar por GH'
              }
            />
            <Dato label="Rodamiento" valor={vac.rodamiento ? 'Sí' : 'No'} />
            <Dato
              label="Comisiones"
              valor={vac.comisiones_texto || '—'}
              ancho="md:col-span-2"
            />
            <Dato label="Garantizado" valor={vac.garantizado_texto || '—'} />
            <Dato label="Justificación" valor={vac.justificacion} ancho="md:col-span-3" preserveBreaks />
          </div>
        </Card>
      </section>

      {/* ─── Aval y agendamiento ─────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<ShieldCheck size={12} strokeWidth={1.75} />}>
          Aval y agendamiento
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <DatoLabel>Aval adjunto</DatoLabel>
              <a
                href={vac.aval_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2"
              >
                <FileText size={13} strokeWidth={1.5} />
                Ver PDF firmado
              </a>
            </div>
            <Dato
              label="Aval aprobado por GH"
              valor={avalAprobadoEn ? formatearFecha(avalAprobadoEn) : 'Pendiente'}
              icon={<CheckCircle2 size={13} strokeWidth={1.5} />}
            />
            <Dato
              label="Fecha propuesta por líder"
              valor={formatearFecha(fechaPropuesta)}
              icon={<Calendar size={13} strokeWidth={1.5} />}
            />
            <Dato
              label="Fecha pactada (paso 3)"
              valor={fechaPactada ? formatearFecha(fechaPactada) : 'Pendiente · perfilamiento'}
              icon={<Calendar size={13} strokeWidth={1.5} />}
            />
          </div>
        </Card>
      </section>

      {/* ─── Asignación ──────────────────────────────────────────── */}
      {(vac.analista_nombre || vac.lider_nombre) && (
        <section>
          <SectionEyebrow icon={<User2 size={12} strokeWidth={1.75} />}>
            Asignación
          </SectionEyebrow>
          <Card padding="lg" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <Dato label="Analista responsable" valor={vac.analista_nombre ?? 'Sin asignar'} />
              <Dato label="Líder solicitante" valor={vac.lider_nombre ?? '—'} />
            </div>
          </Card>
        </section>
      )}

      {/* ─── Reprocesos y novedades (bitácora) ───────────────────── */}
      <BitacoraReprocesos vacante={vac} />

      {/* ─── Flujograma ──────────────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<Sparkles size={12} strokeWidth={1.75} />}>
          Flujograma · 20 pasos
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          <p className="text-[12px] text-text-muted mb-5">
            El paso resaltado en rojo brand es el estado actual. Los pasos en verde ya están
            completados. Click en cualquiera para abrir su pantalla.
          </p>
          <FlujogramaTimeline vacante={vac} />
        </Card>
      </section>
    </div>
  );
}

function SectionEyebrow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted">{icon}</span>
      <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
        {children}
      </p>
    </div>
  );
}

function DatoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
      {children}
    </p>
  );
}

interface DatoProps {
  label: string;
  valor: React.ReactNode;
  hero?: boolean;
  mono?: boolean;
  capital?: boolean;
  ancho?: string;
  icon?: React.ReactNode;
  preserveBreaks?: boolean;
}
function Dato({ label, valor, hero, mono, capital, ancho, icon, preserveBreaks }: DatoProps) {
  return (
    <div className={ancho ?? ''}>
      <DatoLabel>{label}</DatoLabel>
      <p
        className={[
          'mt-1.5 text-text-strong',
          hero ? 'text-[22px] font-light tracking-[-0.02em] tabular-nums' : 'text-[14px] font-medium',
          mono && 'font-mono tabular-nums',
          capital && 'capitalize',
          preserveBreaks && 'whitespace-pre-line',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {icon && <span className="text-text-subtle mr-1.5 inline-block align-[-2px]">{icon}</span>}
        {valor}
      </p>
    </div>
  );
}
