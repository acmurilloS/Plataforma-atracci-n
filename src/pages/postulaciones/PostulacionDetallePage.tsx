import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  FileSignature,
  FileText,
  Mail,
  Phone,
  Send,
  Sparkles,
} from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';
import { useAuth } from '../../hooks/useAuth';
import { ReferenciasTab } from './ReferenciasTab';
import { DocumentosTab } from './DocumentosTab';
import { DebidaDiligenciaTab } from './DebidaDiligenciaTab';
import { DatosBasicosTab } from './DatosBasicosTab';
import { politicaParaCriticidad } from '../../schemas';
import { PoliticaCriticidadBanner } from '../../components/vacantes/PoliticaCriticidadBanner';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import type { PostulacionDoc, VacanteDoc, Criticidad } from '../../schemas';

/**
 * PostulacionDetallePage · sistema brand.
 *
 * Hero header con candidato + pills (estado + criticidad). Tabs brand con
 * underline activo y badge "opcional" según política de criticidad.
 * Tabs internas: Pruebas (paso 7), Entrevistas (paso 8, 13), Informe (paso 11-12).
 * Tabs externas en archivos propios: Referencias / Documentos / Diligencia / Datos básicos.
 */

const TABS = [
  'pruebas',
  'entrevistas',
  'referencias',
  'documentos',
  'informe',
  'diligencia',
  'datos básicos',
] as const;
type Tab = (typeof TABS)[number];

function tabEsOpcional(tab: Tab, criticidad: Criticidad | null): boolean {
  if (!criticidad) return false;
  const p = politicaParaCriticidad(criticidad);
  switch (tab) {
    case 'pruebas':
      return !p.pruebas.obligatorio;
    case 'referencias':
      return !p.referencias.obligatorio;
    case 'informe':
      return !p.informe_formal.obligatorio;
    case 'diligencia':
      return !p.debida_diligencia.obligatorio;
    default:
      return false;
  }
}

// Tono de la Pill para cada estado de postulación (consistente con SeguimientoPage / VacanteCard).
const ESTADO_TONO: Record<string, PillTono> = {
  sourceado_por_ia: 'info',
  postulado: 'neutral',
  pre_entrevistado_pendiente: 'warning',
  pre_entrevistado_ok: 'info',
  pre_entrevistado_no_interesado: 'neutral',
  filtrado_no_cumple: 'warning',
  pruebas_enviadas: 'info',
  pruebas_completadas: 'info',
  entrevistado_analista: 'info',
  referencias_validadas: 'success',
  en_terna: 'brand',
  seleccionado_por_lider: 'success',
  descartado_por_lider: 'warning',
  descartado_examenes_medicos: 'danger',
  en_contratacion: 'brand',
  contratado: 'success',
  desistio_candidato: 'neutral',
};

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

const textareaClass = inputClass + ' resize-none leading-relaxed';

export default function PostulacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { doc: post } = useDoc<PostulacionDoc>('postulaciones', id);
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', post?.vacante_id ?? null);
  const [tab, setTab] = useState<Tab>('pruebas');

  if (!post)
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">Cargando…</div>
    );

  const criticidad = vacante?.criticidad ?? null;
  const tono = ESTADO_TONO[post.estado] ?? 'neutral';

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      {/* Volver */}
      <Link
        to={`/vacantes/${post.vacante_id}/postulaciones`}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver a postulaciones
      </Link>

      {/* ─── Hero ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <Pill tono="brand" dot>
            Pasos 7 – 12 · Analista
          </Pill>
          <h1
            className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            {post.candidato_nombre}
          </h1>
          <p className="mt-3 flex items-center gap-3 text-[13px] text-text-muted flex-wrap">
            {post.candidato_email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail size={12} strokeWidth={1.5} className="text-text-subtle" />
                {post.candidato_email}
              </span>
            )}
            {post.candidato_telefono && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} strokeWidth={1.5} className="text-text-subtle" />
                {post.candidato_telefono}
              </span>
            )}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Pill tono={tono} dot>
              {post.estado.replace(/_/g, ' ')}
            </Pill>
            {post.fuente === 'base_interna' && <Pill tono="info">🏢 Interno</Pill>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            to={`/postulaciones/${post.id}/autorizacion-datos`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
          >
            <FileSignature size={12} strokeWidth={1.75} />
            Autorización tratamiento de datos
          </Link>
          <Link
            to={`/postulaciones/${post.id}/autorizacion-imagen`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
          >
            <FileSignature size={12} strokeWidth={1.75} />
            Acuerdo de imagen y voz
          </Link>
        </div>
      </div>

      {criticidad && <PoliticaCriticidadBanner criticidad={criticidad} />}

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6 flex-wrap -mb-px">
          {TABS.map((t) => {
            const opcional = tabEsOpcional(t, criticidad);
            const activo = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'relative pb-3 text-[13px] font-medium capitalize transition-colors duration-150 ease-out flex items-center gap-1.5',
                  activo
                    ? 'text-text-strong border-b-2 border-brand-600'
                    : 'text-text-muted hover:text-text-strong border-b-2 border-transparent',
                )}
              >
                {t}
                {opcional && (
                  <span className="rounded-full bg-success-50 text-success-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] normal-case">
                    opcional
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── Contenido tabs ──────────────────────────────────── */}
      <div>
        {tab === 'pruebas' && <PruebasTab postulacion={post} />}
        {tab === 'entrevistas' && <EntrevistasTab postulacion={post} />}
        {tab === 'referencias' && <ReferenciasTab postulacion={post} />}
        {tab === 'documentos' && <DocumentosTab postulacion={post} />}
        {tab === 'informe' && <InformeTab postulacion={post} />}
        {tab === 'diligencia' && <DebidaDiligenciaTab postulacion={post} />}
        {tab === 'datos básicos' && <DatosBasicosTab postulacion={post} />}
      </div>
    </div>
  );
}

interface SubProps {
  postulacion: PostulacionDoc;
}

// ───────────────────────────────────────────────────────────────
// Pruebas (paso 7)
// ───────────────────────────────────────────────────────────────
function PruebasTab({ postulacion }: SubProps) {
  interface P {
    id: string;
    nombre: string;
    tipo: string;
    proveedor: string;
    enviada_en: Timestamp;
    realizada_en: Timestamp | null;
    resultado_resumen: string | null;
    cumple_expectativas: boolean | null;
    [k: string]: unknown;
  }
  const { docs } = useColeccion<P>('pruebas', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  const { crear, actualizar } = useMutacion();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'psicotecnica' | 'tecnica' | 'conocimiento'>('psicotecnica');

  async function enviar() {
    if (!nombre.trim()) return;
    await crear('pruebas', {
      postulacion_id: postulacion.id,
      candidato_id: postulacion.candidato_id,
      proceso_id: postulacion.proceso_id,
      tipo,
      proveedor: 'magneto',
      codigo_prueba: nombre.toLowerCase().replace(/\s+/g, '_'),
      nombre,
      enviada_en: Timestamp.now(),
      realizada_en: null,
      resultado_url: null,
      resultado_resumen: null,
      competencias: null,
      cumple_expectativas: null,
    });
    setNombre('');
  }

  async function registrarResultado(p: P) {
    const resumen = window.prompt('Resumen del resultado:');
    if (resumen == null) return;
    const cumple = window.confirm('¿Cumple expectativas? OK = sí');
    await actualizar('pruebas', p.id, {
      realizada_en: Timestamp.now(),
      resultado_resumen: resumen,
      cumple_expectativas: cumple,
    });
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Enviar prueba · paso 7
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value as 'psicotecnica' | 'tecnica' | 'conocimiento')
            }
            className={cn(inputClass, 'md:w-auto')}
          >
            <option value="psicotecnica">Psicotécnica</option>
            <option value="tecnica">Técnica</option>
            <option value="conocimiento">Conocimiento</option>
          </select>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la prueba"
            className={cn(inputClass, 'flex-1 min-w-[200px]')}
          />
          <Button onClick={enviar} variant="brand-primary" disabled={!nombre.trim()}>
            Enviar
          </Button>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Nombre
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Tipo
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Enviada
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Realizada
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Resultado
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-[13px]">
                  Sin pruebas enviadas todavía.
                </td>
              </tr>
            )}
            {docs.map((p) => (
              <tr
                key={p.id}
                className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-text-strong">{p.nombre}</td>
                <td className="px-4 py-3 text-text-muted capitalize">{p.tipo}</td>
                <td className="px-4 py-3 text-text-muted text-[12px] tabular-nums">
                  {formatearFecha(p.enviada_en.toDate())}
                </td>
                <td className="px-4 py-3 text-text-muted text-[12px] tabular-nums">
                  {p.realizada_en ? formatearFecha(p.realizada_en.toDate()) : '—'}
                </td>
                <td className="px-4 py-3 text-[12px]">
                  {p.cumple_expectativas === true && (
                    <Pill tono="success" dot>
                      Cumple
                    </Pill>
                  )}
                  {p.cumple_expectativas === false && (
                    <Pill tono="warning" dot>
                      No cumple
                    </Pill>
                  )}
                  {p.cumple_expectativas === null && p.resultado_resumen && (
                    <span className="text-text-body">{p.resultado_resumen}</span>
                  )}
                  {p.cumple_expectativas === null && !p.resultado_resumen && (
                    <span className="text-text-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!p.realizada_en && (
                    <button
                      onClick={() => registrarResultado(p)}
                      className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                    >
                      Registrar resultado
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Entrevistas (pasos 8 y 13)
// ───────────────────────────────────────────────────────────────
function EntrevistasTab({ postulacion }: SubProps) {
  interface E {
    id: string;
    tipo: string;
    modalidad: string;
    programada_para: Timestamp;
    entrevistador_nombre: string;
    estado: string;
    feedback: { notas: string } | null;
    [k: string]: unknown;
  }
  const { docs } = useColeccion<E>('entrevistas', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil } = useAuth();
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState<'analista' | 'lider'>('analista');
  const [modalidad, setModalidad] = useState<'presencial' | 'virtual' | 'telefonica'>('virtual');

  async function agendar() {
    if (!fecha || !user || !perfil) return;
    await crear('entrevistas', {
      postulacion_id: postulacion.id,
      candidato_id: postulacion.candidato_id,
      proceso_id: postulacion.proceso_id,
      tipo,
      modalidad,
      programada_para: Timestamp.fromDate(new Date(`${fecha}T10:00:00`)),
      duracion_min: 45,
      sala_o_link: null,
      entrevistador_uid: user.uid,
      entrevistador_nombre: `${perfil.nombre} ${perfil.apellido}`,
      google_calendar_event_id: null,
      estado: 'programada',
      realizada_en: null,
      feedback: null,
    });
    setFecha('');
  }

  async function registrarFeedback(e: E) {
    const notas = window.prompt('Feedback de la entrevista:');
    if (notas == null) return;
    await actualizar('entrevistas', e.id, {
      estado: 'realizada',
      realizada_en: Timestamp.now(),
      feedback: {
        cumple_perfil: true,
        fortalezas: '',
        oportunidades: '',
        recomendacion: 'avanzar',
        notas,
        completado_en: Timestamp.now(),
        completado_por_uid: user?.uid ?? null,
      },
    });
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Agendar entrevista · pasos 8 / 13
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <label className="block">
            <span className="block text-[11px] font-medium text-text-strong mb-1">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={cn(inputClass, 'md:w-auto')}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-text-strong mb-1">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'analista' | 'lider')}
              className={cn(inputClass, 'md:w-auto')}
            >
              <option value="analista">Con analista (paso 8)</option>
              <option value="lider">Con líder (paso 13)</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-text-strong mb-1">Modalidad</span>
            <select
              value={modalidad}
              onChange={(e) =>
                setModalidad(e.target.value as 'presencial' | 'virtual' | 'telefonica')
              }
              className={cn(inputClass, 'md:w-auto')}
            >
              <option value="virtual">Virtual</option>
              <option value="presencial">Presencial</option>
              <option value="telefonica">Telefónica</option>
            </select>
          </label>
          <Button onClick={agendar} variant="brand-primary" disabled={!fecha}>
            Agendar
          </Button>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Tipo
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Fecha
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Modalidad
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Estado
              </th>
              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                Feedback
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-[13px]">
                  Sin entrevistas agendadas.
                </td>
              </tr>
            )}
            {docs.map((e) => (
              <tr
                key={e.id}
                className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors"
              >
                <td className="px-4 py-3 capitalize text-text-strong font-medium">{e.tipo}</td>
                <td className="px-4 py-3 text-text-muted text-[12px] tabular-nums">
                  {formatearFecha(e.programada_para.toDate())}
                </td>
                <td className="px-4 py-3 capitalize text-text-body">{e.modalidad}</td>
                <td className="px-4 py-3">
                  <Pill
                    tono={
                      e.estado === 'realizada' ? 'success' : e.estado === 'programada' ? 'info' : 'neutral'
                    }
                    dot
                  >
                    {e.estado}
                  </Pill>
                </td>
                <td className="px-4 py-3 text-[12px] text-text-muted italic">
                  {e.feedback?.notas ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.estado === 'programada' && (
                    <button
                      onClick={() => registrarFeedback(e)}
                      className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                    >
                      Marcar realizada
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Informe (pasos 11 y 12)
// ───────────────────────────────────────────────────────────────
function InformeTab({ postulacion }: SubProps) {
  interface I {
    id: string;
    resumen_ejecutivo: string;
    trayectoria: string;
    recomendacion_analista: string;
    version: number;
    enviado_al_lider_en: Timestamp | null;
    [k: string]: unknown;
  }
  const { docs } = useColeccion<I>('informes', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  const { crear, actualizar } = useMutacion();
  const [resumen, setResumen] = useState('');
  const [trayectoria, setTrayectoria] = useState('');
  const [recomendacion, setRecomendacion] = useState<'avanzar' | 'descartar' | 'con_reservas'>(
    'avanzar',
  );

  const informeVigente = docs[0] ?? null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const version = (informeVigente?.version ?? 0) + 1;
    await crear('informes', {
      postulacion_id: postulacion.id,
      proceso_id: postulacion.proceso_id,
      vacante_id: postulacion.vacante_id,
      resumen_ejecutivo: resumen,
      trayectoria,
      cumplimiento_criterios: {},
      competencias_destacadas: [],
      alertas: [],
      aspiracion_salarial: null,
      disponibilidad_ingreso: null,
      recomendacion_analista: recomendacion,
      version,
      enviado_al_lider_en: null,
      enviado_por_uid: null,
      url_pdf: null,
    });
    setResumen('');
    setTrayectoria('');
  }

  async function enviarAlLider(i: I) {
    const ahora = Timestamp.now();
    await actualizar('informes', i.id, { enviado_al_lider_en: ahora });
    await actualizar('postulaciones', postulacion.id, {
      estado: 'en_terna',
      ultima_transicion_estado: ahora,
      'marcas.en_terna_en': ahora,
    });
  }

  const recomendacionTono = (r: string): PillTono =>
    r === 'avanzar' ? 'success' : r === 'descartar' ? 'warning' : 'info';

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Informe del analista · paso 11
          </p>
        </div>
        <form onSubmit={guardar} className="space-y-4">
          <label className="block">
            <span className="block text-[13px] font-medium text-text-strong mb-1.5">
              Resumen ejecutivo <span className="text-brand-600">*</span>
            </span>
            <textarea
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              rows={3}
              required
              placeholder="3-4 líneas: quién es el candidato, qué pesa más, recomendación corta."
              className={textareaClass}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-text-strong mb-1.5">
              Trayectoria profesional <span className="text-brand-600">*</span>
            </span>
            <textarea
              value={trayectoria}
              onChange={(e) => setTrayectoria(e.target.value)}
              rows={4}
              required
              placeholder="Trayectoria, empresas anteriores, logros relevantes para esta vacante."
              className={textareaClass}
            />
          </label>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="block flex-1 min-w-[200px]">
              <span className="block text-[13px] font-medium text-text-strong mb-1.5">
                Recomendación
              </span>
              <select
                value={recomendacion}
                onChange={(e) =>
                  setRecomendacion(e.target.value as 'avanzar' | 'descartar' | 'con_reservas')
                }
                className={inputClass}
              >
                <option value="avanzar">Avanzar</option>
                <option value="con_reservas">Con reservas</option>
                <option value="descartar">Descartar</option>
              </select>
            </label>
            <Button type="submit" variant="brand-primary" disabled={!resumen || !trayectoria}>
              Guardar versión
            </Button>
          </div>
        </form>
      </Card>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Versiones del informe ·{' '}
            <span className="tabular-nums text-text-strong">{docs.length}</span>
          </p>
        </div>
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Versión
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Recomendación
                </th>
                <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                  Enviado al líder
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted text-[13px]">
                    Sin informes guardados.
                  </td>
                </tr>
              )}
              {docs.map((i) => (
                <tr
                  key={i.id}
                  className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-text-strong tabular-nums">
                    v{i.version}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tono={recomendacionTono(i.recomendacion_analista)} dot>
                      {i.recomendacion_analista.replace('_', ' ')}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-text-muted text-[12px] tabular-nums">
                    {i.enviado_al_lider_en
                      ? formatearFecha(i.enviado_al_lider_en.toDate())
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!i.enviado_al_lider_en && (
                      <button
                        onClick={() => enviarAlLider(i)}
                        className="inline-flex items-center gap-1.5 text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                      >
                        <Send size={11} strokeWidth={1.75} />
                        Enviar al líder · paso 12
                      </button>
                    )}
                    {i.enviado_al_lider_en && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-success-700">
                        <ClipboardCheck size={11} strokeWidth={1.75} />
                        Enviado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
