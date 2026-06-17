import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
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
  X,
} from 'lucide-react';
import { functions } from '../../lib/firebase';
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
import type { PostulacionDoc, VacanteDoc, Criticidad, CargoDoc } from '../../schemas';

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
  en_examenes_medicos: 'info',
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
  const { doc: cargo } = useDoc<CargoDoc>('cargos_catalogo', vacante?.cargo_id ?? null);
  const [tab, setTab] = useState<Tab>('pruebas');
  const [enviandoPortal, setEnviandoPortal] = useState(false);
  const [agradecerAbierto, setAgradecerAbierto] = useState(false);
  const [mensajeAgradecimiento, setMensajeAgradecimiento] = useState('');
  const [enviandoAgradecimiento, setEnviandoAgradecimiento] = useState(false);
  const [condicionesAbierto, setCondicionesAbierto] = useState(false);
  const [horario, setHorario] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [enviandoCondiciones, setEnviandoCondiciones] = useState(false);

  if (!post)
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">Cargando…</div>
    );

  const criticidad = vacante?.criticidad ?? null;
  const tono = ESTADO_TONO[post.estado] ?? 'neutral';

  /** Envía (o reenvía) al candidato el link a su portal público de consentimientos. */
  async function enviarPortal() {
    if (!post) return;
    setEnviandoPortal(true);
    try {
      const fn = httpsCallable<
        { postulacion_id: string },
        { ok: true; url: string; email_destinatario: string }
      >(functions, 'enviarPortalCandidato');
      const res = await fn({ postulacion_id: post.id });
      window.alert(`Portal enviado al candidato (${res.data.email_destinatario}).`);
    } catch (e) {
      window.alert('No se pudo enviar el portal: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviandoPortal(false);
    }
  }

  async function revocarPortal() {
    if (!post) return;
    if (
      !window.confirm(
        '¿Revocar el portal del candidato? El enlace dejará de funcionar. Puedes reabrirlo con "Reenviar portal".',
      )
    )
      return;
    try {
      const fn = httpsCallable<{ postulacion_id: string }, { ok: true }>(
        functions,
        'revocarPortalCandidato',
      );
      await fn({ postulacion_id: post.id });
      window.alert('Portal revocado. El enlace ya no funciona.');
    } catch (e) {
      window.alert('No se pudo revocar: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // D.3 · agradecimiento al candidato descartado (texto editable, sin causa).
  const DESCARTES = [
    'filtrado_no_cumple',
    'pre_entrevistado_no_interesado',
    'descartado_por_lider',
    'descartado_examenes_medicos',
    'desistio_candidato',
  ];
  const esDescartado = DESCARTES.includes(post.estado);

  function abrirAgradecimiento() {
    if (!post) return;
    const primer = post.candidato_nombre?.split(' ')[0] || 'candidato/a';
    setMensajeAgradecimiento(
      `Hola ${primer},\n\n` +
        `Te agradecemos sinceramente tu interés y el tiempo que dedicaste a nuestro proceso de ` +
        `selección${post.cargo_nombre ? ` para el cargo ${post.cargo_nombre}` : ''} en Equitel.\n\n` +
        `En esta ocasión hemos continuado con otros candidatos. Valoramos mucho tu participación y ` +
        `conservaremos tu perfil para futuras oportunidades.\n\n` +
        `Te deseamos muchos éxitos.\n\n` +
        `Cordialmente,\nEquipo de Atracción · Organización Equitel`,
    );
    setAgradecerAbierto(true);
  }

  async function enviarAgradecimiento() {
    if (!post) return;
    setEnviandoAgradecimiento(true);
    try {
      const fn = httpsCallable<
        { postulacion_id: string; mensaje: string },
        { ok: true; email_destinatario: string }
      >(functions, 'enviarAgradecimientoCandidato');
      const res = await fn({ postulacion_id: post.id, mensaje: mensajeAgradecimiento });
      window.alert(`Mensaje de agradecimiento enviado a ${res.data.email_destinatario}.`);
      setAgradecerAbierto(false);
    } catch (e) {
      window.alert('No se pudo enviar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviandoAgradecimiento(false);
    }
  }

  // E · enviar condiciones laborales (tras apto médico = en_contratacion).
  async function enviarCondiciones() {
    if (!post) return;
    setEnviandoCondiciones(true);
    try {
      const fn = httpsCallable<
        { postulacion_id: string; horario: string; tipo_contrato: string },
        { ok: true; email_destinatario: string }
      >(functions, 'enviarCondicionesLaborales');
      const res = await fn({ postulacion_id: post.id, horario, tipo_contrato: tipoContrato });
      window.alert(`Condiciones laborales enviadas a ${res.data.email_destinatario}.`);
      setCondicionesAbierto(false);
    } catch (e) {
      window.alert('No se pudo enviar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviandoCondiciones(false);
    }
  }

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
          <button
            onClick={enviarPortal}
            disabled={enviandoPortal}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60 transition-colors duration-150"
          >
            <Mail size={12} strokeWidth={1.75} />
            {enviandoPortal
              ? 'Enviando…'
              : post.portal_enviado_en
                ? 'Reenviar portal al candidato'
                : 'Enviar portal al candidato'}
          </button>
          {post.portal_token && !post.portal_revocado_en && (
            <button
              onClick={revocarPortal}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-slate-50 transition-colors duration-150"
            >
              Revocar portal
            </button>
          )}
          {esDescartado && (
            <button
              onClick={abrirAgradecimiento}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
            >
              <Mail size={12} strokeWidth={1.75} />
              {post.agradecimiento_enviado_en ? 'Reenviar agradecimiento' : 'Enviar agradecimiento'}
            </button>
          )}
          {post.estado === 'en_contratacion' && (
            <button
              onClick={() => setCondicionesAbierto(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
            >
              <Mail size={12} strokeWidth={1.75} />
              {post.condiciones_enviadas_en
                ? 'Reenviar condiciones laborales'
                : 'Enviar condiciones laborales'}
            </button>
          )}
          {(post.consentimiento_datos_aceptado_en || post.consentimiento_imagen_aceptado_en) && (
            <p className="text-[11px] text-text-muted leading-[1.5] px-0.5">
              Consentimientos:{' '}
              <span className={post.consentimiento_datos_aceptado_en ? 'text-success-700 font-medium' : ''}>
                {post.consentimiento_datos_aceptado_en ? '✓' : '○'} datos
              </span>
              {' · '}
              <span className={post.consentimiento_imagen_aceptado_en ? 'text-success-700 font-medium' : ''}>
                {post.consentimiento_imagen_aceptado_en ? '✓' : '○'} imagen y voz
              </span>
            </p>
          )}
        </div>
      </div>

      {agradecerAbierto && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3 print:hidden">
          <div>
            <p className="text-[13px] font-semibold text-text-strong">
              Mensaje de agradecimiento al candidato
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Edítalo si quieres. <strong>No menciones el motivo del descarte.</strong>
            </p>
          </div>
          <textarea
            value={mensajeAgradecimiento}
            onChange={(e) => setMensajeAgradecimiento(e.target.value)}
            rows={9}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setAgradecerAbierto(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={enviarAgradecimiento}
              disabled={enviandoAgradecimiento || mensajeAgradecimiento.trim().length < 10}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Mail size={12} strokeWidth={1.75} />
              {enviandoAgradecimiento ? 'Enviando…' : 'Enviar agradecimiento'}
            </button>
          </div>
        </div>
      )}

      {condicionesAbierto && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3 print:hidden">
          <div>
            <p className="text-[13px] font-semibold text-text-strong">Enviar condiciones laborales</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Cargo, empresa, unidad y salario salen de la vacante. Completa el horario y el tipo de
              contrato.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-medium text-text-muted mb-1">Horario</span>
              <input
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
                placeholder="L–V 8:00–17:00"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-text-muted mb-1">
                Tipo de contrato
              </span>
              <input
                value={tipoContrato}
                onChange={(e) => setTipoContrato(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
                placeholder="Término indefinido / fijo…"
              />
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setCondicionesAbierto(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={enviarCondiciones}
              disabled={enviandoCondiciones}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Mail size={12} strokeWidth={1.75} />
              {enviandoCondiciones ? 'Enviando…' : 'Enviar condiciones'}
            </button>
          </div>
        </div>
      )}

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
        {tab === 'pruebas' && (
          <PruebasTab postulacion={post} pruebasSugeridas={cargo?.pruebas_sugeridas ?? []} />
        )}
        {tab === 'entrevistas' && (
          <EntrevistasTab
            postulacion={post}
            liderUid={vacante?.lider_uid ?? null}
            liderNombre={vacante?.lider_nombre ?? null}
          />
        )}
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
function PruebasTab({
  postulacion,
  pruebasSugeridas = [],
}: SubProps & { pruebasSugeridas?: string[] }) {
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
  const [tipo, setTipo] = useState<'psicotecnica' | 'tecnica' | 'conocimiento'>('psicotecnica');
  const [instrucciones, setInstrucciones] = useState('');
  // Lista de pruebas a enviar de una sola vez (varios links en un correo).
  const [filas, setFilas] = useState<{ nombre: string; link: string }[]>([
    { nombre: '', link: '' },
  ]);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const emailCandidato = (postulacion.candidato_email ?? '').trim();
  const filasCompletas = filas.filter((f) => f.nombre.trim() && f.link.trim());
  const filasConNombre = filas.filter((f) => f.nombre.trim());

  function setFila(i: number, patch: Partial<{ nombre: string; link: string }>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    setMsg(null);
  }
  function agregarFila() {
    setFilas((prev) => [...prev, { nombre: '', link: '' }]);
  }
  function quitarFila(i: number) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  // Pre-carga los nombres de las pruebas definidas para el cargo (matriz
  // prueba×cargo). Los links se pegan a mano (Magneto/formulario). Así se
  // pueden enviar "todas las del cargo" sin teclear cada nombre.
  function cargarDelCargo() {
    if (pruebasSugeridas.length === 0) {
      setMsg({ tipo: 'err', texto: 'Este cargo no tiene pruebas sugeridas en el catálogo.' });
      return;
    }
    const yaPresentes = new Set(
      filas.map((f) => f.nombre.trim().toLowerCase()).filter(Boolean),
    );
    const nuevas = pruebasSugeridas
      .filter((n) => n.trim() && !yaPresentes.has(n.trim().toLowerCase()))
      .map((n) => ({ nombre: n.trim(), link: '' }));
    if (nuevas.length === 0) {
      setMsg({ tipo: 'ok', texto: 'Las pruebas del cargo ya están en la lista. Pega los links.' });
      return;
    }
    setFilas((prev) => {
      const base = prev.filter((f) => f.nombre.trim() || f.link.trim());
      return [...base, ...nuevas];
    });
    setMsg({ tipo: 'ok', texto: `Se cargaron ${nuevas.length} prueba(s) del cargo. Pega los links.` });
  }

  // Envía un solo correo con todas las pruebas que tengan nombre + link.
  async function enviarPorCorreo() {
    setMsg(null);
    if (filasCompletas.length === 0) {
      setMsg({ tipo: 'err', texto: 'Agrega al menos una prueba con nombre y link.' });
      return;
    }
    setEnviandoCorreo(true);
    try {
      const fn = httpsCallable<
        {
          postulacion_id: string;
          tipo: string;
          instrucciones: string;
          pruebas: { nombre: string; link: string }[];
        },
        { ok: true; enviadas: number; email_destinatario: string }
      >(functions, 'enviarPruebaCandidato');
      const res = await fn({
        postulacion_id: postulacion.id,
        tipo,
        instrucciones,
        pruebas: filasCompletas,
      });
      setMsg({
        tipo: 'ok',
        texto: `${res.data.enviadas} prueba(s) enviada(s) a ${res.data.email_destinatario}.`,
      });
      setFilas([{ nombre: '', link: '' }]);
      setInstrucciones('');
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'No se pudieron enviar las pruebas.';
      setMsg({ tipo: 'err', texto: raw });
    } finally {
      setEnviandoCorreo(false);
    }
  }

  // Registra las pruebas (con nombre) sin mandar correo — para envíos por fuera.
  async function registrarSolo() {
    if (filasConNombre.length === 0) return;
    setRegistrando(true);
    try {
      for (const f of filasConNombre) {
        await crear('pruebas', {
          postulacion_id: postulacion.id,
          candidato_id: postulacion.candidato_id,
          proceso_id: postulacion.proceso_id,
          tipo,
          proveedor: 'externo',
          codigo_prueba: f.nombre.toLowerCase().replace(/\s+/g, '_'),
          nombre: f.nombre,
          link_prueba: f.link.trim() || null,
          instrucciones: instrucciones.trim() || null,
          enviada_en: Timestamp.now(),
          realizada_en: null,
          resultado_url: null,
          resultado_resumen: null,
          competencias: null,
          cumple_expectativas: null,
        });
      }
      setMsg({ tipo: 'ok', texto: `${filasConNombre.length} prueba(s) registrada(s) sin correo.` });
      setFilas([{ nombre: '', link: '' }]);
      setInstrucciones('');
    } catch (e) {
      setMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'No se pudo registrar.' });
    } finally {
      setRegistrando(false);
    }
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
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Enviar pruebas · paso 7
            </p>
          </div>
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value as 'psicotecnica' | 'tecnica' | 'conocimiento')
            }
            className={cn(inputClass, 'w-auto')}
          >
            <option value="psicotecnica">Psicotécnica</option>
            <option value="tecnica">Técnica</option>
            <option value="conocimiento">Conocimiento</option>
          </select>
        </div>

        <div className="space-y-3">
          {/* Filas de pruebas: varios links en un solo correo */}
          {filas.map((f, i) => (
            <div key={i} className="flex gap-2 flex-wrap items-start">
              <input
                value={f.nombre}
                onChange={(e) => setFila(i, { nombre: e.target.value })}
                placeholder="Nombre de la prueba"
                className={cn(inputClass, 'w-full md:w-[220px]')}
              />
              <input
                value={f.link}
                onChange={(e) => setFila(i, { link: e.target.value })}
                placeholder="Link (Magneto, formulario…) — https://…"
                className={cn(inputClass, 'flex-1 min-w-[200px]')}
              />
              {filas.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarFila(i)}
                  className="px-2 py-2 text-text-subtle hover:text-danger-600"
                  title="Quitar"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={agregarFila}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800"
            >
              + Agregar otra prueba
            </button>
            {pruebasSugeridas.length > 0 && (
              <button
                type="button"
                onClick={cargarDelCargo}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800"
              >
                Cargar pruebas del cargo ({pruebasSugeridas.length})
              </button>
            )}
          </div>

          <textarea
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            rows={2}
            placeholder="Instrucciones para el candidato (opcional): plazo, duración, recomendaciones…"
            className={textareaClass}
          />

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button
              onClick={enviarPorCorreo}
              variant="brand-primary"
              loading={enviandoCorreo}
              disabled={enviandoCorreo || registrando || filasCompletas.length === 0 || !emailCandidato}
              icon={<Mail size={13} strokeWidth={1.75} />}
            >
              {enviandoCorreo
                ? 'Enviando…'
                : `Enviar al candidato${filasCompletas.length > 1 ? ` (${filasCompletas.length})` : ''}`}
            </Button>
            <Button
              onClick={registrarSolo}
              variant="neutral-secondary"
              loading={registrando}
              disabled={enviandoCorreo || registrando || filasConNombre.length === 0}
            >
              Solo registrar (sin correo)
            </Button>
            {!emailCandidato && (
              <span className="text-[11px] text-warning-700">
                El candidato no tiene correo — agrégalo en Datos Básicos para poder enviarle la prueba.
              </span>
            )}
          </div>

          {msg && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-[12px]',
                msg.tipo === 'ok'
                  ? 'border-success-500/20 bg-success-50 text-success-700'
                  : 'border-danger-500/20 bg-danger-50 text-danger-700',
              )}
            >
              {msg.texto}
            </div>
          )}
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
function EntrevistasTab({
  postulacion,
  liderUid,
  liderNombre,
}: SubProps & { liderUid?: string | null; liderNombre?: string | null }) {
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
  const [hora, setHora] = useState('10:00');
  const [tipo, setTipo] = useState<'analista' | 'lider'>('analista');
  const [modalidad, setModalidad] = useState<'presencial' | 'virtual' | 'telefonica'>('virtual');
  const [link, setLink] = useState('');
  const [sedeDireccion, setSedeDireccion] = useState('');
  const [agendando, setAgendando] = useState(false);

  // Sedes para el dropdown de dirección cuando la entrevista es presencial.
  const { docs: sedes } = useColeccion<{
    id: string;
    nombre: string;
    ciudad: string;
    direccion: string;
    activo: boolean;
  }>('sedes', {});

  // Una sola opción por ubicación: las sedes están duplicadas por empresa
  // (p. ej. Mosquera existe en EQT/CUM/ING/Silap). Se dedupe por ciudad para
  // el dropdown de la entrevista presencial.
  const sedesUnicas = useMemo(() => {
    const porUbicacion = new Map<string, (typeof sedes)[number]>();
    for (const s of sedes) {
      if (s.activo === false) continue;
      // Por ciudad + dirección: colapsa los duplicados por empresa (misma sede
      // física) pero conserva direcciones genuinamente distintas en una ciudad.
      const clave = `${(s.ciudad || s.nombre).trim().toLowerCase()}|${(s.direccion || '')
        .trim()
        .toLowerCase()}`;
      const prev = porUbicacion.get(clave);
      if (!prev || (!prev.direccion && s.direccion)) porUbicacion.set(clave, s);
    }
    return Array.from(porUbicacion.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [sedes]);

  async function agendar() {
    // Guard anti doble-submit: agendar dos veces creaba 2 entrevistas (2 correos).
    if (agendando || !fecha || !user || !perfil) return;
    setAgendando(true);
    try {
    const salaOLink =
      modalidad === 'virtual'
        ? link.trim() || null
        : modalidad === 'presencial'
          ? sedeDireccion.trim() || null
          : null;
    // Para entrevista con el líder (paso 13), el entrevistador es el LÍDER de la
    // vacante (no quien agenda). Así le llega la notificación y puede registrar
    // el feedback. Para la de analista (paso 8), el entrevistador es quien agenda.
    const esLider = tipo === 'lider';
    const entrevistadorUid = esLider && liderUid ? liderUid : user.uid;
    const entrevistadorNombre =
      esLider && liderNombre ? liderNombre : `${perfil.nombre} ${perfil.apellido}`;
    await crear('entrevistas', {
      postulacion_id: postulacion.id,
      candidato_id: postulacion.candidato_id,
      proceso_id: postulacion.proceso_id,
      tipo,
      modalidad,
      programada_para: Timestamp.fromDate(new Date(`${fecha}T${hora || '10:00'}:00`)),
      duracion_min: 45,
      sala_o_link: salaOLink,
      entrevistador_uid: entrevistadorUid,
      entrevistador_nombre: entrevistadorNombre,
      google_calendar_event_id: null,
      estado: 'programada',
      realizada_en: null,
      feedback: null,
    });
    setFecha('');
    setLink('');
    setSedeDireccion('');
    } finally {
      setAgendando(false);
    }
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
        <div className="space-y-3">
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
              <span className="block text-[11px] font-medium text-text-strong mb-1">Hora</span>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
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
          </div>

          {modalidad === 'virtual' && (
            <label className="block">
              <span className="block text-[11px] font-medium text-text-strong mb-1">
                Link de la videollamada{' '}
                <span className="text-text-subtle font-normal">(se lo enviamos al candidato)</span>
              </span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://meet.google.com/… o el link de la reunión"
                className={inputClass}
              />
            </label>
          )}

          {modalidad === 'presencial' && (
            <label className="block">
              <span className="block text-[11px] font-medium text-text-strong mb-1">
                Sede / dirección
              </span>
              <select
                value={sedeDireccion}
                onChange={(e) => setSedeDireccion(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecciona la sede…</option>
                {sedesUnicas.map((s) => {
                    const dir = [s.direccion, s.ciudad].filter(Boolean).join(', ');
                    const valor = dir ? `${dir} (${s.nombre})` : `${s.nombre}`;
                    return (
                      <option key={s.id} value={valor}>
                        {s.nombre}
                        {s.ciudad ? ` · ${s.ciudad}` : ''}
                        {s.direccion ? ` · ${s.direccion}` : ' · (sin dirección)'}
                      </option>
                    );
                  })}
              </select>
            </label>
          )}

          <div className="flex justify-end">
            <Button
              onClick={agendar}
              variant="brand-primary"
              disabled={!fecha || agendando}
              loading={agendando}
            >
              Agendar
            </Button>
          </div>
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
                        Pasar a terna · paso 12
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
