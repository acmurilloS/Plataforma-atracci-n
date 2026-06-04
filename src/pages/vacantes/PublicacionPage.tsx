import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link as LinkIcon,
  Megaphone,
  Sparkles,
  Users2,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import { BuscarCandidatosIAModal } from '../../components/vacantes/BuscarCandidatosIAModal';
import { ActivarReferidosModal } from '../../components/vacantes/ActivarReferidosModal';
import { Button, Card, Pill } from '../../components/brand';
import type { VacanteDoc } from '../../schemas';

/**
 * PublicacionPage · sistema brand.
 *
 * Hero header + Card hero "link público" con CTA copiar/abrir.
 * Card destacada "Sourcing IA" (paso 4.5) en glass brand.
 * Form para registrar otras publicaciones externas.
 * Tabla brand de publicaciones existentes.
 */

interface PublicacionDoc {
  id: string;
  canal: string;
  canal_detalle: string | null;
  url_externa: string | null;
  estado: string;
  publicada_en: Timestamp | null;
  postulaciones_recibidas: number;
  [k: string]: unknown;
}

interface GeneracionReferidoDoc {
  id: string;
  generado_en: Timestamp | null;
  tecnicos_incluidos: number;
  marcada_como_enviada: boolean;
  modo: 'personal' | 'difusion';
  [k: string]: unknown;
}


const CANALES = [
  { valor: 'magneto', label: 'Magneto' },
  { valor: 'linkedin_pagina', label: 'LinkedIn página empresarial' },
  { valor: 'caja_compensacion', label: 'Caja de compensación' },
  { valor: 'institucion', label: 'Institución / universidad' },
  { valor: 'equitel_reclutamiento', label: 'Equitel Reclutamiento' },
  { valor: 'otro', label: 'Otro' },
];

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

export default function PublicacionPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { rol } = useAuth();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { docs: publicaciones, cargando } = useColeccion<PublicacionDoc>('publicaciones', {
    filtros: id ? [['vacante_id', '==', id]] : [],
  });
  const { docs: generacionesReferidos } = useColeccion<GeneracionReferidoDoc>(
    'referidos_generaciones',
    { filtros: id ? [['vacante_id', '==', id]] : [] },
  );
  const { crear, actualizar } = useMutacion();

  const ultimaGeneracion = generacionesReferidos
    .slice()
    .sort((a, b) => {
      const ta = a.generado_en?.toMillis?.() ?? 0;
      const tb = b.generado_en?.toMillis?.() ?? 0;
      return tb - ta;
    })[0];

  const [canal, setCanal] = useState('magneto');
  const [detalle, setDetalle] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [modalIAAbierto, setModalIAAbierto] = useState(false);
  const [modalReferidosAbierto, setModalReferidosAbierto] = useState(false);

  const puedeBuscarConIA = rol === 'analista' || rol === 'coordinador' || rol === 'admin';

  const linkPublico = vacante ? `${window.location.origin}/carreras/${vacante.id}` : '';

  const yaPublicadoEnEquitel = publicaciones.some(
    (p) => p.canal === 'equitel_reclutamiento' && p.estado === 'publicada',
  );

  async function copiarLinkEquitel() {
    if (!vacante) return;
    try {
      await navigator.clipboard.writeText(linkPublico);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      if (!yaPublicadoEnEquitel) {
        await crear('publicaciones', {
          vacante_id: vacante.id,
          vacante_consecutivo: vacante.consecutivo,
          proceso_id: vacante.proceso_activo_id,
          canal: 'equitel_reclutamiento',
          canal_detalle: 'Landing pública · Equitel Reclutamiento',
          url_externa: linkPublico,
          id_externo: null,
          pieza_grafica_url: null,
          estado: 'publicada',
          publicada_en: Timestamp.now(),
          retirada_en: null,
          postulaciones_recibidas: 0,
        });
        if (vacante.estado === 'lista_para_publicar') {
          await actualizar('vacantes', vacante.id, { estado: 'publicada' });
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos copiar.');
    }
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!vacante) return;
    setErr(null);
    try {
      await crear('publicaciones', {
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        proceso_id: vacante.proceso_activo_id,
        canal,
        canal_detalle: detalle.trim() || null,
        url_externa: url.trim() || null,
        id_externo: null,
        pieza_grafica_url: null,
        estado: 'publicada',
        publicada_en: Timestamp.now(),
        retirada_en: null,
        postulaciones_recibidas: 0,
      });
      setDetalle('');
      setUrl('');
      if (vacante.estado === 'lista_para_publicar') {
        await actualizar('vacantes', vacante.id, { estado: 'publicada' });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos agregar.');
    }
  }

  async function retirar(pub: PublicacionDoc) {
    try {
      await actualizar('publicaciones', pub.id, {
        estado: 'retirada',
        retirada_en: Timestamp.now(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos retirar.');
    }
  }

  if (!vacante)
    return <div className="max-w-4xl mx-auto px-6 py-12 text-text-muted text-sm">Cargando vacante…</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      {/* Volver */}
      <Link
        to={`/vacantes/${vacante.id}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver al detalle
      </Link>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <div>
        <Pill tono="brand" dot>
          Paso 4 · Analista
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Publicación y divulgación
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Registra cada canal donde publicaste la oferta de{' '}
          <span className="font-semibold text-text-body">{vacante.cargo_nombre}</span>. El link
          propio del portal funciona como receptor único de las postulaciones.
        </p>
      </div>

      {/* ─── Link propio (hero card) ──────────────────────────── */}
      <div className="rounded-brand-card border border-brand-200 bg-gradient-to-br from-brand-50/60 via-white to-white p-7 shadow-brand-card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Globe size={20} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <Pill tono="brand">Canal propio</Pill>
            <h2 className="mt-2 text-[22px] font-medium tracking-[-0.02em] text-text-strong">
              Landing pública · Equitel Reclutamiento
            </h2>
            <p className="text-[13px] text-text-muted mt-1.5 max-w-2xl leading-relaxed">
              Un link propio para esta vacante. Pégalo en LinkedIn, WhatsApp, cajas de
              compensación o donde quieras. Los candidatos ven la info y postulan con CV
              directo al portal, sin pasar por Magneto ni correo.
            </p>
            {vacante.estado === 'lista_para_publicar' && (
              <p className="text-[11px] text-text-subtle mt-2 italic">
                Al copiar por primera vez se activa la publicación y la vacante pasa a{' '}
                <code className="font-mono text-text-body">publicada</code>.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3.5 py-2.5">
            <LinkIcon size={13} strokeWidth={1.75} className="text-text-subtle shrink-0" />
            <code className="text-[12px] text-text-body font-mono truncate flex-1">
              {linkPublico}
            </code>
          </div>
          <Button
            variant="brand-primary"
            onClick={copiarLinkEquitel}
            icon={
              copiado ? (
                <Check size={13} strokeWidth={2} />
              ) : (
                <Copy size={13} strokeWidth={1.75} />
              )
            }
          >
            {copiado ? 'Copiado' : 'Copiar link'}
          </Button>
          <a
            href={linkPublico}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white text-text-strong px-3 py-2 text-[13px] font-medium hover:bg-slate-50 transition-colors duration-150"
          >
            <ExternalLink size={13} strokeWidth={1.75} />
            Abrir
          </a>
        </div>

        {yaPublicadoEnEquitel && (
          <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-success-700">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
            <span className="font-medium">Landing activa recibiendo postulaciones</span>
          </div>
        )}
      </div>

      {/* ─── Sourcing IA (paso 4.5) ───────────────────────────── */}
      {puedeBuscarConIA && (
        <Card padding="lg">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-md bg-info-50 text-info-700 flex items-center justify-center shrink-0">
              <Sparkles size={20} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tono="info">Paso 4.5 · Sourcing IA</Pill>
                <Pill tono="neutral">Opcional</Pill>
              </div>
              <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.012em] text-text-strong">
                ¿No llegan suficientes postulados?
              </h2>
              <p className="text-[13px] text-text-muted mt-1.5 max-w-2xl">
                Lanza una búsqueda con Gemini sobre perfiles públicos en internet (LinkedIn,
                GitHub, sitios profesionales). Devuelve hasta 15 personas que coinciden con la
                vacante — tú validas cuáles avanzan al paso 5.
              </p>
            </div>
            <Button
              variant="brand-primary"
              onClick={() => setModalIAAbierto(true)}
              icon={<Sparkles size={13} strokeWidth={1.75} />}
            >
              Buscar candidatos con IA
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Referidos internos (paso 4.6) ────────────────────── */}
      {puedeBuscarConIA && (
        <Card padding="lg">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <Users2 size={20} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tono="brand">Paso 4.6 · Referidos internos</Pill>
                <Pill tono="neutral">Manual</Pill>
              </div>
              <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.012em] text-text-strong">
                Activa la red de técnicos de Equitel
              </h2>
              <p className="text-[13px] text-text-muted mt-1.5 max-w-2xl">
                Genera un mensaje listo con el link de la vacante para que lo compartas por
                WhatsApp con los técnicos de Equitel — uno por uno, en grupos o en lista de
                difusión. La plataforma no envía nada por sí sola.
              </p>
            </div>
            <Button
              variant="brand-primary"
              onClick={() => setModalReferidosAbierto(true)}
              icon={<Users2 size={13} strokeWidth={1.75} />}
            >
              {ultimaGeneracion ? 'Generar de nuevo' : 'Activar referidos'}
            </Button>
          </div>

          {ultimaGeneracion && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle">
                  Última activación
                </p>
                <p className="text-[14px] font-semibold text-text-strong mt-1">
                  {ultimaGeneracion.generado_en
                    ? formatearFecha(ultimaGeneracion.generado_en.toDate())
                    : '—'}
                </p>
                <p className="text-[11px] text-text-muted">
                  {ultimaGeneracion.marcada_como_enviada
                    ? 'Registrada como enviada'
                    : 'Sin marcar'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle">
                  Activaciones totales
                </p>
                <p className="text-[14px] font-semibold text-text-strong mt-1">
                  {generacionesReferidos.length}
                </p>
                <p className="text-[11px] text-text-muted">veces que se compartió la vacante</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── Registrar publicación ────────────────────────────── */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-5">
          <Megaphone size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Registrar otro canal externo
          </p>
        </div>

        <form onSubmit={agregar} className="space-y-4">
          <p className="text-[12px] text-text-muted">
            Deja constancia de canales adicionales: Magneto, post LinkedIn, caja de
            compensación, institución educativa, etc.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block">
              <span className="block text-[13px] font-medium text-text-strong mb-1.5">Canal</span>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className={inputClass}
              >
                {CANALES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="block text-[13px] font-medium text-text-strong mb-1.5">
                Detalle
              </span>
              <input
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder='ej. "Caja Compensar Bogotá" o "Post LinkedIn personal"'
                className={inputClass}
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-[13px] font-medium text-text-strong mb-1.5">
              URL externa <span className="text-text-subtle font-normal">(opcional)</span>
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className={inputClass}
            />
          </label>
          {err && (
            <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
              {err}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" variant="brand-primary">
              Registrar publicación
            </Button>
          </div>
        </form>
      </Card>

      {/* ─── Tabla de publicaciones ───────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Canales registrados ·{' '}
            <span className="tabular-nums text-text-strong">{publicaciones.length}</span>
          </p>
        </div>
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-text-muted">
              <tr>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                  Canal
                </th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                  Detalle
                </th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                  Estado
                </th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                  Publicada
                </th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                  URL
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && publicaciones.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-[13px]">
                    Aún no hay publicaciones. Empieza copiando el link propio arriba.
                  </td>
                </tr>
              )}
              {publicaciones.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-text-strong capitalize">
                    {p.canal.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{p.canal_detalle ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Pill tono={p.estado === 'publicada' ? 'success' : 'neutral'} dot>
                      {p.estado}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-text-muted text-[12px] tabular-nums">
                    {p.publicada_en ? formatearFecha(p.publicada_en.toDate()) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.url_externa ? (
                      <a
                        href={p.url_externa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 hover:underline text-[12px] font-medium"
                      >
                        Abrir
                        <ExternalLink size={11} strokeWidth={1.75} />
                      </a>
                    ) : (
                      <span className="text-text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.estado === 'publicada' && (
                      <button
                        onClick={() => retirar(p)}
                        className="text-[12px] text-danger-700 hover:text-danger-700 hover:underline font-medium"
                      >
                        Retirar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ─── CTAs siguiente paso ──────────────────────────────── */}
      <div className="flex justify-end gap-3 flex-wrap pt-2">
        {puedeBuscarConIA && (
          <Link to={`/vacantes/${vacante.id}/sourcing`}>
            <Button variant="neutral-secondary">Ver candidatos sourceados →</Button>
          </Link>
        )}
        <Link to={`/vacantes/${vacante.id}/postulaciones`}>
          <Button variant="brand-primary">Pasar a postulaciones →</Button>
        </Link>
      </div>

      <BuscarCandidatosIAModal
        open={modalIAAbierto}
        onClose={() => setModalIAAbierto(false)}
        onCompletado={() => {
          setModalIAAbierto(false);
          if (vacante) nav(`/vacantes/${vacante.id}/sourcing`);
        }}
        vacante={vacante}
      />

      <ActivarReferidosModal
        open={modalReferidosAbierto}
        onClose={() => setModalReferidosAbierto(false)}
        vacante={vacante}
      />
    </div>
  );
}
