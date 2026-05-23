import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FileUp, Loader2 } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import type { VacanteDoc, PostulacionDoc, EstadoPostulacion, FuentePostulacion } from '../../schemas';
import { estadoPostulacion, fuentePostulacion } from '../../schemas';

const ESTADOS = estadoPostulacion.options;
const FUENTES = fuentePostulacion.options;

export default function PostulacionesPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { docs: postulaciones, cargando } = useColeccion<PostulacionDoc>('postulaciones', {
    filtros: id ? [['vacante_id', '==', id]] : [],
  });
  const { crear, actualizar } = useMutacion();

  const [form, setForm] = useState<{
    nombres: string;
    apellidos: string;
    email: string;
    telefono: string;
    documento_tipo: string;
    documento_numero: string;
    fuente: FuentePostulacion;
  }>({
    nombres: '',
    apellidos: '',
    email: '',
    telefono: '',
    documento_tipo: 'CC',
    documento_numero: '',
    fuente: 'magneto',
  });
  const [err, setErr] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const inputFilesRef = useRef<HTMLInputElement>(null);
  const [subiendoCVs, setSubiendoCVs] = useState(false);
  const [progresoCVs, setProgresoCVs] = useState<{ hechos: number; total: number } | null>(null);

  async function agregarPostulacion(e: FormEvent) {
    e.preventDefault();
    if (!vacante) return;
    setProcesando(true);
    setErr(null);
    try {
      const candidatoId = await crear('candidatos', {
        nombres: form.nombres,
        apellidos: form.apellidos,
        email: form.email,
        telefono: form.telefono,
        documento_tipo: form.documento_tipo,
        documento_numero: form.documento_numero,
        provisional: !form.documento_numero,
        ciudad_residencia: null,
        origen: form.fuente,
        magneto_id: null,
        linkedin_url: null,
        fuente_hv_url: null,
        observaciones: '',
        alertas: [],
        alertas_tipos: [],
      });
      const nombreCompleto = `${form.nombres} ${form.apellidos}`.trim();
      const ahora = Timestamp.now();
      await crear('postulaciones', {
        candidato_id: candidatoId,
        proceso_id: vacante.proceso_activo_id,
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        cargo_nombre: vacante.cargo_nombre,
        candidato_nombre: nombreCompleto,
        candidato_email: form.email,
        candidato_telefono: form.telefono,
        candidato_cv_url: null,
        estado: 'postulado',
        cumple_criterios: null,
        fuente: form.fuente,
        marcas: { postulado_en: ahora },
        fecha_postulacion: ahora,
        ultima_transicion_estado: ahora,
        origen_publicacion_id: null,
        razon_descarte: null,
        descarte_etapa: null,
        analista_uid: vacante.analista_uid ?? null,
      });
      if (vacante.estado === 'publicada') {
        await actualizar('vacantes', vacante.id, { estado: 'en_proceso' });
      }
      setForm({
        nombres: '',
        apellidos: '',
        email: '',
        telefono: '',
        documento_tipo: 'CC',
        documento_numero: '',
        fuente: 'magneto',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos agregar.');
    } finally {
      setProcesando(false);
    }
  }

  async function subirMultiplesCVs(files: FileList) {
    if (!vacante) return;
    const validos = Array.from(files).filter((f) => f.type === 'application/pdf');
    if (validos.length === 0) {
      setErr('Selecciona al menos un PDF.');
      return;
    }
    setSubiendoCVs(true);
    setErr(null);
    setProgresoCVs({ hechos: 0, total: validos.length });
    try {
      for (let i = 0; i < validos.length; i++) {
        const file = validos[i];
        if (file.size > 5 * 1024 * 1024) {
          console.warn(`${file.name} supera 5 MB, se omite`);
          setProgresoCVs({ hechos: i + 1, total: validos.length });
          continue;
        }
        const ts = Date.now();
        const safe = file.name.replace(/[^\w.-]+/g, '_');
        const path = `cvs/${vacante.id}/${ts}_${safe}`;
        const sref = storageRef(storage, path);
        await uploadBytes(sref, file, { contentType: 'application/pdf' });
        const url = await getDownloadURL(sref);

        const nombreBase = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        const partes = nombreBase.split(/\s+/).filter(Boolean);
        const nombres = partes.slice(0, Math.max(1, Math.floor(partes.length / 2))).join(' ') || 'Candidato';
        const apellidos = partes.slice(Math.max(1, Math.floor(partes.length / 2))).join(' ') || 'sin apellido';

        const candidatoId = await crear('candidatos', {
          nombres,
          apellidos,
          email: '',
          telefono: '',
          documento_tipo: null,
          documento_numero: null,
          provisional: true,
          ciudad_residencia: null,
          origen: 'magneto',
          magneto_id: null,
          linkedin_url: null,
          fuente_hv_url: url,
          observaciones: `CV importado masivamente · archivo original: ${file.name}`,
          alertas: [],
          alertas_tipos: [],
        });
        const ahora = Timestamp.now();
        await crear('postulaciones', {
          candidato_id: candidatoId,
          proceso_id: vacante.proceso_activo_id,
          vacante_id: vacante.id,
          vacante_consecutivo: vacante.consecutivo,
          cargo_nombre: vacante.cargo_nombre,
          candidato_nombre: `${nombres} ${apellidos}`.trim(),
          candidato_email: '',
          candidato_telefono: '',
          candidato_cv_url: url,
          estado: 'postulado',
          cumple_criterios: null,
          fuente: 'magneto',
          marcas: { postulado_en: ahora },
          fecha_postulacion: ahora,
          ultima_transicion_estado: ahora,
          origen_publicacion_id: null,
          razon_descarte: null,
          descarte_etapa: null,
          analista_uid: vacante.analista_uid ?? null,
        });
        setProgresoCVs({ hechos: i + 1, total: validos.length });
      }
      if (vacante.estado === 'publicada') {
        await actualizar('vacantes', vacante.id, { estado: 'en_proceso' });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos subir los CVs.');
    } finally {
      setSubiendoCVs(false);
      setTimeout(() => setProgresoCVs(null), 3000);
      if (inputFilesRef.current) inputFilesRef.current.value = '';
    }
  }

  async function cambiarEstado(p: PostulacionDoc, nuevo: EstadoPostulacion) {
    try {
      const marcaCampo = marcaParaEstado(nuevo);
      const ahora = Timestamp.now();
      const patch: Record<string, unknown> = {
        estado: nuevo,
        ultima_transicion_estado: ahora,
      };
      if (marcaCampo) patch[`marcas.${marcaCampo}`] = ahora;
      await actualizar('postulaciones', p.id, patch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos actualizar estado.');
    }
  }

  const filtradas = postulaciones.filter((p) => {
    if (filtroEstado && p.estado !== filtroEstado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (
        p.candidato_nombre.toLowerCase().includes(q) ||
        p.candidato_email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!vacante) return <div className="px-6 py-10 text-sm text-navy-500">Cargando vacante…</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <Link to={`/vacantes/${vacante.id}`} className="text-xs text-navy-500 hover:text-navy-800">
          ← Volver a detalle
        </Link>
        <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">
          Pasos 5-11 · Analista
        </p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">Postulaciones</h1>
        <p className="text-sm text-navy-600 mt-1">
          {vacante.cargo_nombre} · {filtradas.length} / {postulaciones.length} candidatos
        </p>
      </div>

      <section className="rounded-xl border-2 border-dashed border-navy-200 bg-cream-50 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-navy-900">
              Importar CVs en lote (Magneto, Drive, etc.)
            </h2>
            <p className="text-sm text-navy-600 mt-1">
              Selecciona varios PDFs a la vez. Cada archivo crea un candidato provisional + una
              postulación con el CV adjunto. Luego editas sus datos en{' '}
              <span className="font-medium">Abrir →</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputFilesRef.current?.click()}
            disabled={subiendoCVs}
            className="inline-flex items-center gap-1.5 rounded-md bg-gold-500 text-navy-900 px-4 py-2.5 text-sm font-bold hover:bg-gold-400 disabled:opacity-50 whitespace-nowrap"
          >
            {subiendoCVs ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Subiendo…
              </>
            ) : (
              <>
                <FileUp size={14} /> Subir CVs (PDF)
              </>
            )}
          </button>
          <input
            ref={inputFilesRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && subirMultiplesCVs(e.target.files)}
          />
        </div>
        {progresoCVs && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-navy-600 mb-1">
              <span>
                {progresoCVs.hechos} / {progresoCVs.total} archivos
              </span>
              {progresoCVs.hechos === progresoCVs.total && !subiendoCVs && (
                <span className="text-emerald-700 font-semibold">✓ Listo</span>
              )}
            </div>
            <div className="h-1.5 rounded bg-navy-100 overflow-hidden">
              <div
                className="h-full bg-gold-500 transition-all"
                style={{
                  width: `${progresoCVs.total > 0 ? (progresoCVs.hechos / progresoCVs.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      <form onSubmit={agregarPostulacion} className="rounded-xl border border-navy-100 bg-white p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold text-navy-900">Agregar candidato manual</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input label="Nombres" v={form.nombres} onChange={(v) => setForm({ ...form, nombres: v })} required />
          <Input label="Apellidos" v={form.apellidos} onChange={(v) => setForm({ ...form, apellidos: v })} required />
          <Input label="Email" type="email" v={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          <Input label="Teléfono" v={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} required />
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Doc. tipo</span>
            <select
              value={form.documento_tipo}
              onChange={(e) => setForm({ ...form, documento_tipo: e.target.value })}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="PEP">PEP</option>
              <option value="PA">PA</option>
            </select>
          </label>
          <Input label="Doc. número" v={form.documento_numero} onChange={(v) => setForm({ ...form, documento_numero: v })} />
          <label className="block">
            <span className="text-xs font-medium text-navy-700">Fuente</span>
            <select
              value={form.fuente}
              onChange={(e) => setForm({ ...form, fuente: e.target.value as FuentePostulacion })}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            >
              {FUENTES.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={procesando}
            className="rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
          >
            {procesando ? 'Guardando…' : 'Agregar candidato'}
          </button>
        </div>
      </form>

      <div className="flex gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="flex-1 rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Candidato</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 font-medium">CV</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                  Sin postulaciones.
                </td>
              </tr>
            )}
            {filtradas.map((p) => (
              <tr key={p.id} className="border-t border-navy-50">
                <td className="px-4 py-2 font-medium">{p.candidato_nombre}</td>
                <td className="px-4 py-2 text-xs text-navy-600">
                  {p.candidato_email || <span className="italic text-navy-400">sin email</span>}
                  <br />
                  {p.candidato_telefono || <span className="italic text-navy-400">sin tel.</span>}
                </td>
                <td className="px-4 py-2 text-xs">
                  {p.candidato_cv_url ? (
                    <a
                      href={p.candidato_cv_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gold-700 hover:underline font-medium"
                    >
                      Ver PDF ↗
                    </a>
                  ) : (
                    <span className="text-navy-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={p.estado}
                    onChange={(e) => cambiarEstado(p, e.target.value as EstadoPostulacion)}
                    className="rounded-md border border-navy-200 px-2 py-1 text-xs"
                  >
                    {ESTADOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/postulaciones/${p.id}`}
                    className="text-gold-700 hover:underline text-xs"
                  >
                    Abrir →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 flex-wrap">
        <Link
          to={`/vacantes/${vacante.id}/concepto-atraccion`}
          className="rounded-md border border-navy-200 bg-white text-navy-700 px-4 py-2 text-sm font-medium hover:bg-cream-100"
        >
          Generar concepto VIDA-F-03 →
        </Link>
        <Link
          to={`/vacantes/${vacante.id}/terna`}
          className="rounded-md border border-navy-200 text-navy-700 px-4 py-2 text-sm font-medium hover:bg-cream-100"
        >
          Ir a terna →
        </Link>
      </div>
    </div>
  );
}

function Input({
  label,
  v,
  onChange,
  type,
  required,
}: {
  label: string;
  v: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-navy-700">{label}</span>
      <input
        type={type ?? 'text'}
        value={v}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
      />
    </label>
  );
}

function marcaParaEstado(estado: EstadoPostulacion): string | null {
  const mapa: Partial<Record<EstadoPostulacion, string>> = {
    sourceado_por_ia: 'sourceado_en',
    postulado: 'postulado_en',
    pre_entrevistado_pendiente: 'pre_entrevistado_pendiente_en',
    pre_entrevistado_ok: 'pre_entrevistado_ok_en',
    pre_entrevistado_no_interesado: 'pre_entrevistado_no_interesado_en',
    filtrado_no_cumple: 'filtrado_no_cumple_en',
    pruebas_enviadas: 'pruebas_enviadas_en',
    pruebas_completadas: 'pruebas_completadas_en',
    entrevistado_analista: 'entrevistado_analista_en',
    referencias_validadas: 'referencias_validadas_en',
    en_terna: 'en_terna_en',
    seleccionado_por_lider: 'decidido_en',
    descartado_por_lider: 'descartado_en',
    descartado_examenes_medicos: 'descartado_examenes_medicos_en',
    en_contratacion: 'en_contratacion_en',
    contratado: 'contratado_en',
    desistio_candidato: 'desistio_en',
  };
  return mapa[estado] ?? null;
}
