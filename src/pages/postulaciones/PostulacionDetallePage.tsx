import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
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
import type { PostulacionDoc, VacanteDoc, Criticidad } from '../../schemas';

const TABS = ['pruebas', 'entrevistas', 'referencias', 'documentos', 'informe', 'diligencia', 'datos básicos'] as const;
type Tab = (typeof TABS)[number];

/**
 * Mapeo tab → propiedad de la política. Las tabs sin entrada se asumen obligatorias.
 */
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

export default function PostulacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { doc: post } = useDoc<PostulacionDoc>('postulaciones', id);
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', post?.vacante_id ?? null);
  const [tab, setTab] = useState<Tab>('pruebas');

  if (!post) return <div className="px-6 py-10 text-sm text-navy-500">Cargando…</div>;

  const criticidad = vacante?.criticidad ?? null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <Link
          to={`/vacantes/${post.vacante_id}/postulaciones`}
          className="text-xs text-navy-500 hover:text-navy-800"
        >
          ← Volver a postulaciones
        </Link>
        <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">Pasos 7-12 · Analista</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">{post.candidato_nombre}</h1>
        <p className="text-sm text-navy-600 mt-1">
          {post.candidato_email} · {post.candidato_telefono} ·{' '}
          <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs">{post.estado}</span>
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Link
            to={`/postulaciones/${post.id}/autorizacion-datos`}
            className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-cream-100"
          >
            📄 Autorización tratamiento de datos
          </Link>
          <Link
            to={`/postulaciones/${post.id}/autorizacion-imagen`}
            className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-cream-100"
          >
            📄 Acuerdo de imagen y voz
          </Link>
        </div>
      </div>

      {criticidad && <PoliticaCriticidadBanner criticidad={criticidad} />}

      <div className="border-b border-navy-100 flex gap-6 flex-wrap">
        {TABS.map((t) => {
          const opcional = tabEsOpcional(t, criticidad);
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium capitalize transition flex items-center gap-1.5 ${
                tab === t
                  ? 'text-navy-900 border-b-2 border-gold-500'
                  : 'text-navy-500 hover:text-navy-800'
              }`}
            >
              {t}
              {opcional && (
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider normal-case">
                  opcional
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'pruebas' && <PruebasTab postulacion={post} />}
      {tab === 'entrevistas' && <EntrevistasTab postulacion={post} />}
      {tab === 'referencias' && <ReferenciasTab postulacion={post} />}
      {tab === 'documentos' && <DocumentosTab postulacion={post} />}
      {tab === 'informe' && <InformeTab postulacion={post} />}
      {tab === 'diligencia' && <DebidaDiligenciaTab postulacion={post} />}
      {tab === 'datos básicos' && <DatosBasicosTab postulacion={post} />}
    </div>
  );
}

interface SubProps {
  postulacion: PostulacionDoc;
}

function PruebasTab({ postulacion }: SubProps) {
  interface P { id: string; nombre: string; tipo: string; proveedor: string; enviada_en: Timestamp; realizada_en: Timestamp | null; resultado_resumen: string | null; cumple_expectativas: boolean | null; [k: string]: unknown; }
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
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-100 bg-white p-5">
        <h3 className="font-semibold text-navy-900 mb-3">Enviar prueba (paso 7)</h3>
        <div className="flex gap-2">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'psicotecnica' | 'tecnica' | 'conocimiento')}
            className="rounded-md border border-navy-200 px-3 py-2 text-sm"
          >
            <option value="psicotecnica">Psicotécnica</option>
            <option value="tecnica">Técnica</option>
            <option value="conocimiento">Conocimiento</option>
          </select>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la prueba"
            className="flex-1 rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          <button onClick={enviar} className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold">
            Enviar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Enviada</th>
              <th className="px-4 py-2">Realizada</th>
              <th className="px-4 py-2">Resultado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-center text-navy-500">Sin pruebas.</td></tr>
            )}
            {docs.map((p) => (
              <tr key={p.id} className="border-t border-navy-50">
                <td className="px-4 py-2">{p.nombre}</td>
                <td className="px-4 py-2 text-navy-600 capitalize">{p.tipo}</td>
                <td className="px-4 py-2 text-xs">{formatearFecha(p.enviada_en.toDate())}</td>
                <td className="px-4 py-2 text-xs">{p.realizada_en ? formatearFecha(p.realizada_en.toDate()) : '—'}</td>
                <td className="px-4 py-2 text-xs">{p.resultado_resumen ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {!p.realizada_en && (
                    <button onClick={() => registrarResultado(p)} className="text-xs text-gold-700 hover:underline">
                      Registrar resultado
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntrevistasTab({ postulacion }: SubProps) {
  interface E { id: string; tipo: string; modalidad: string; programada_para: Timestamp; entrevistador_nombre: string; estado: string; feedback: { notas: string } | null; [k: string]: unknown; }
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
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-100 bg-white p-5">
        <h3 className="font-semibold text-navy-900 mb-3">Agendar entrevista (pasos 8, 13)</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'analista' | 'lider')} className="rounded-md border border-navy-200 px-3 py-2 text-sm">
            <option value="analista">Con analista (paso 8)</option>
            <option value="lider">Con líder (paso 13)</option>
          </select>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value as 'presencial' | 'virtual' | 'telefonica')} className="rounded-md border border-navy-200 px-3 py-2 text-sm">
            <option value="virtual">Virtual</option>
            <option value="presencial">Presencial</option>
            <option value="telefonica">Telefónica</option>
          </select>
          <button onClick={agendar} className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold">
            Agendar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Modalidad</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Feedback</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-center text-navy-500">Sin entrevistas.</td></tr>
            )}
            {docs.map((e) => (
              <tr key={e.id} className="border-t border-navy-50">
                <td className="px-4 py-2 capitalize">{e.tipo}</td>
                <td className="px-4 py-2 text-xs">{formatearFecha(e.programada_para.toDate())}</td>
                <td className="px-4 py-2 capitalize">{e.modalidad}</td>
                <td className="px-4 py-2">{e.estado}</td>
                <td className="px-4 py-2 text-xs">{e.feedback?.notas ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {e.estado === 'programada' && (
                    <button onClick={() => registrarFeedback(e)} className="text-xs text-gold-700 hover:underline">
                      Marcar realizada
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ReferenciasTab vive ahora en ./ReferenciasTab.tsx (alineado a VIDA-F-12 v2).

// DocumentosTab vive ahora en ./DocumentosTab.tsx (alineado a DGH-F-04 v5).

function InformeTab({ postulacion }: SubProps) {
  interface I { id: string; resumen_ejecutivo: string; trayectoria: string; recomendacion_analista: string; version: number; enviado_al_lider_en: Timestamp | null; [k: string]: unknown; }
  const { docs } = useColeccion<I>('informes', {
    filtros: [['postulacion_id', '==', postulacion.id]],
  });
  const { crear, actualizar } = useMutacion();
  const [resumen, setResumen] = useState('');
  const [trayectoria, setTrayectoria] = useState('');
  const [recomendacion, setRecomendacion] = useState<'avanzar' | 'descartar' | 'con_reservas'>('avanzar');

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

  return (
    <div className="space-y-4">
      <form onSubmit={guardar} className="rounded-xl border border-navy-100 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-navy-900">Informe del analista (paso 11)</h3>
        <textarea value={resumen} onChange={(e) => setResumen(e.target.value)} placeholder="Resumen ejecutivo" rows={3} required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
        <textarea value={trayectoria} onChange={(e) => setTrayectoria(e.target.value)} placeholder="Trayectoria profesional" rows={3} required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
        <label className="block">
          <span className="text-xs font-medium text-navy-700">Recomendación</span>
          <select value={recomendacion} onChange={(e) => setRecomendacion(e.target.value as 'avanzar' | 'descartar' | 'con_reservas')} className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-sm">
            <option value="avanzar">Avanzar</option>
            <option value="con_reservas">Con reservas</option>
            <option value="descartar">Descartar</option>
          </select>
        </label>
        <div className="flex justify-end">
          <button className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold">Guardar versión</button>
        </div>
      </form>
      <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr><th className="px-4 py-2">v</th><th className="px-4 py-2">Recomendación</th><th className="px-4 py-2">Enviado al líder</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-navy-500">Sin informes.</td></tr>}
            {docs.map((i) => (
              <tr key={i.id} className="border-t border-navy-50">
                <td className="px-4 py-2 font-mono">{i.version}</td>
                <td className="px-4 py-2 capitalize">{i.recomendacion_analista.replace('_', ' ')}</td>
                <td className="px-4 py-2 text-xs">{i.enviado_al_lider_en ? formatearFecha(i.enviado_al_lider_en.toDate()) : '—'}</td>
                <td className="px-4 py-2 text-right">
                  {!i.enviado_al_lider_en && <button onClick={() => enviarAlLider(i)} className="text-xs text-gold-700 hover:underline">Enviar al líder (paso 12)</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

