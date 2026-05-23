import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, ExternalLink, Check, Sparkles } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import { BuscarCandidatosIAModal } from '../../components/vacantes/BuscarCandidatosIAModal';
import type { VacanteDoc } from '../../schemas';

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

const CANALES = [
  { valor: 'magneto', label: 'Magneto' },
  { valor: 'linkedin_pagina', label: 'LinkedIn página empresarial' },
  { valor: 'caja_compensacion', label: 'Caja de compensación' },
  { valor: 'institucion', label: 'Institución / universidad' },
  { valor: 'equitel_reclutamiento', label: 'Equitel Reclutamiento (landing propia)' },
  { valor: 'otro', label: 'Otro' },
];

export default function PublicacionPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { rol } = useAuth();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { docs: publicaciones, cargando } = useColeccion<PublicacionDoc>('publicaciones', {
    filtros: id ? [['vacante_id', '==', id]] : [],
  });
  const { crear, actualizar } = useMutacion();

  const [canal, setCanal] = useState('magneto');
  const [detalle, setDetalle] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [modalIAAbierto, setModalIAAbierto] = useState(false);

  const puedeBuscarConIA = rol === 'analista' || rol === 'coordinador' || rol === 'admin';

  const linkPublico = vacante
    ? `${window.location.origin}/carreras/${vacante.id}`
    : '';

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

  if (!vacante) return <div className="px-6 py-10 text-sm text-navy-500">Cargando vacante…</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <Link to={`/vacantes/${vacante.id}`} className="text-xs text-navy-500 hover:text-navy-800">
          ← Volver a detalle
        </Link>
        <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">Paso 4 · Analista</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">Publicación y divulgación</h1>
        <p className="text-sm text-navy-600 mt-1">
          Registra cada canal donde publicaste la oferta de {vacante.cargo_nombre}.
        </p>
      </div>

      <section className="rounded-xl border-2 border-gold-300 bg-gradient-to-br from-gold-50 to-cream-50 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-gold-700 font-bold">
              Canal propio
            </p>
            <h2 className="font-display text-xl font-semibold text-navy-900 mt-0.5">
              Equitel Reclutamiento · landing pública
            </h2>
            <p className="text-sm text-navy-700 mt-1 max-w-2xl">
              Un link propio para esta vacante. Pégalo en LinkedIn, WhatsApp, cajas de
              compensación o donde quieras. Los candidatos ven toda la info y postulan con CV
              directo al portal — sin pasar por Magneto ni correo.
            </p>
            {vacante.estado === 'lista_para_publicar' && (
              <p className="mt-2 text-xs text-navy-600">
                Al copiar el link por primera vez, se activa la publicación y la vacante pasa a
                estado <code>publicada</code>.
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <code className="flex-1 min-w-0 rounded-md bg-white border border-navy-200 px-3 py-2 text-xs text-navy-700 font-mono break-all">
            {linkPublico}
          </code>
          <button
            onClick={copiarLinkEquitel}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 whitespace-nowrap"
          >
            {copiado ? (
              <>
                <Check size={14} /> Copiado
              </>
            ) : (
              <>
                <Copy size={14} /> Copiar link
              </>
            )}
          </button>
          <a
            href={linkPublico}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-navy-200 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-cream-100 whitespace-nowrap"
          >
            <ExternalLink size={14} /> Abrir
          </a>
        </div>
        {yaPublicadoEnEquitel && (
          <p className="mt-3 text-xs text-emerald-700 font-medium">
            ✓ Landing activa recibiendo postulaciones.
          </p>
        )}
      </section>

      {puedeBuscarConIA && (
        <section className="rounded-xl border border-navy-100 bg-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-widest text-gold-700 font-bold">
                Paso 4.5 · Búsqueda activa con IA
              </p>
              <h2 className="font-display text-xl font-semibold text-navy-900 mt-0.5">
                ¿No están llegando suficientes postulados?
              </h2>
              <p className="text-sm text-navy-700 mt-1 max-w-2xl">
                Lanza una búsqueda con Gemini sobre perfiles públicos en internet (LinkedIn,
                GitHub, sitios profesionales). La IA encuentra hasta 15 personas que coinciden con
                la vacante — tú las revisas y decides cuáles avanzan al paso 5.
              </p>
            </div>
            <button
              onClick={() => setModalIAAbierto(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 text-white px-4 py-2.5 text-sm font-semibold hover:bg-navy-800 whitespace-nowrap"
            >
              <Sparkles size={14} /> Buscar candidatos con IA
            </button>
          </div>
        </section>
      )}

      <form onSubmit={agregar} className="rounded-xl border border-navy-100 bg-white p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Registrar otra publicación externa
        </h2>
        <p className="text-xs text-navy-500 -mt-2">
          Usa esto para dejar constancia de canales externos: Magneto, caja de compensación,
          LinkedIn post, institución, etc.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Canal</span>
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            >
              {CANALES.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-navy-700">Detalle (ej. "Compensar Bogotá")</span>
            <input
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-navy-700">URL externa (opcional)</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800"
          >
            Registrar publicación
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Canal</th>
              <th className="px-4 py-2 font-medium">Detalle</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Publicada</th>
              <th className="px-4 py-2 font-medium">URL</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-navy-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && publicaciones.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-navy-500">
                  Aún no hay publicaciones.
                </td>
              </tr>
            )}
            {publicaciones.map((p) => (
              <tr key={p.id} className="border-t border-navy-50">
                <td className="px-4 py-2 font-medium">{p.canal}</td>
                <td className="px-4 py-2 text-navy-600">{p.canal_detalle ?? '—'}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.estado === 'publicada'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-navy-50 text-navy-600'
                    }`}
                  >
                    {p.estado}
                  </span>
                </td>
                <td className="px-4 py-2 text-navy-600 text-xs">
                  {p.publicada_en ? formatearFecha(p.publicada_en.toDate()) : '—'}
                </td>
                <td className="px-4 py-2">
                  {p.url_externa ? (
                    <a
                      href={p.url_externa}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gold-700 hover:underline text-xs"
                    >
                      Abrir ↗
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {p.estado === 'publicada' && (
                    <button
                      onClick={() => retirar(p)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Retirar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 flex-wrap">
        {puedeBuscarConIA && (
          <Link
            to={`/vacantes/${vacante.id}/sourcing`}
            className="rounded-md border border-navy-200 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-cream-100"
          >
            Ver candidatos sourceados →
          </Link>
        )}
        <Link
          to={`/vacantes/${vacante.id}/postulaciones`}
          className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800"
        >
          Pasar a postulaciones →
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
    </div>
  );
}
