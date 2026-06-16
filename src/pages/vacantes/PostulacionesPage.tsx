import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  ArrowLeft,
  Building2,
  FileText,
  FileUp,
  Search,
  UploadCloud,
  UserPlus,
  Users,
} from 'lucide-react';
import { storage } from '../../lib/firebase';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import type {
  EstadoPostulacion,
  FuentePostulacion,
  PostulacionDoc,
  VacanteDoc,
} from '../../schemas';
import { estadoPostulacion, fuentePostulacion } from '../../schemas';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * PostulacionesPage · sistema brand.
 *
 * Hero header + Card hero "Importar CVs en lote" con drop zone brand.
 * Card "Agregar candidato manual" con inputs sunken.
 * Filtros (busqueda + estado + toggle internos).
 * Tabla brand con pill por fuente (interno) + select compacto de estado.
 */

const ESTADOS = estadoPostulacion.options;
const FUENTES = fuentePostulacion.options;

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

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
    ciudad_residencia: string;
    especialidad_tecnica: string;
    anios_experiencia: string;
    fuente: FuentePostulacion;
    fuente_detalle: string;
  }>({
    nombres: '',
    apellidos: '',
    email: '',
    telefono: '',
    documento_tipo: 'CC',
    documento_numero: '',
    ciudad_residencia: '',
    especialidad_tecnica: '',
    anios_experiencia: '',
    fuente: 'magneto',
    fuente_detalle: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [soloInternos, setSoloInternos] = useState(false);
  const inputFilesRef = useRef<HTMLInputElement>(null);
  const [subiendoCVs, setSubiendoCVs] = useState(false);
  const [progresoCVs, setProgresoCVs] = useState<{ hechos: number; total: number } | null>(null);

  async function agregarPostulacion(e: FormEvent) {
    e.preventDefault();
    if (!vacante) return;
    setProcesando(true);
    setErr(null);
    try {
      const aniosNum = form.anios_experiencia ? parseInt(form.anios_experiencia, 10) : null;
      const candidatoId = await crear('candidatos', {
        nombres: form.nombres,
        apellidos: form.apellidos,
        email: form.email,
        telefono: form.telefono,
        documento_tipo: form.documento_tipo,
        documento_numero: form.documento_numero,
        provisional: !form.documento_numero,
        ciudad_residencia: form.ciudad_residencia || null,
        dominio_principal: 'sin_clasificar',
        especialidad_tecnica: form.especialidad_tecnica.trim(),
        skills_tags: [],
        anios_experiencia_aproximados: aniosNum,
        origen: form.fuente,
        magneto_id: null,
        linkedin_url: null,
        fuente_hv_url: null,
        observaciones: '',
        alertas: [],
        alertas_tipos: [],
        total_postulaciones: 1,
        resultado_ultima_postulacion: 'sin_resultado_aun',
        fecha_ultima_postulacion: Timestamp.now(),
        ultima_vacante_id: vacante.id,
        ultima_vacante_consecutivo: vacante.consecutivo,
        pruebas_historial: [],
        apto_para_pool_futuro: true,
        motivo_no_apto_pool: null,
        duplicado_de: null,
        duplicado_detectado_en: null,
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
        fuente_detalle: form.fuente_detalle.trim(),
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
        ciudad_residencia: '',
        especialidad_tecnica: '',
        anios_experiencia: '',
        fuente: 'magneto',
        fuente_detalle: '',
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
        const nombres =
          partes.slice(0, Math.max(1, Math.floor(partes.length / 2))).join(' ') || 'Candidato';
        const apellidos =
          partes.slice(Math.max(1, Math.floor(partes.length / 2))).join(' ') || 'sin apellido';

        const candidatoId = await crear('candidatos', {
          nombres,
          apellidos,
          email: '',
          telefono: '',
          documento_tipo: null,
          documento_numero: null,
          provisional: true,
          ciudad_residencia: null,
          dominio_principal: 'sin_clasificar',
          especialidad_tecnica: '',
          skills_tags: [],
          anios_experiencia_aproximados: null,
          origen: 'magneto',
          magneto_id: null,
          linkedin_url: null,
          fuente_hv_url: url,
          observaciones: `CV importado masivamente · archivo original: ${file.name}`,
          alertas: [],
          alertas_tipos: [],
          total_postulaciones: 1,
          resultado_ultima_postulacion: 'sin_resultado_aun',
          fecha_ultima_postulacion: Timestamp.now(),
          ultima_vacante_id: vacante.id,
          ultima_vacante_consecutivo: vacante.consecutivo,
          pruebas_historial: [],
          apto_para_pool_futuro: true,
          motivo_no_apto_pool: null,
          duplicado_de: null,
          duplicado_detectado_en: null,
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
    if (soloInternos && p.fuente !== 'base_interna') return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (
        p.candidato_nombre.toLowerCase().includes(q) ||
        p.candidato_email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = useMemo(() => {
    const total = postulaciones.length;
    const internos = postulaciones.filter((p) => p.fuente === 'base_interna').length;
    const enTerna = postulaciones.filter((p) => p.estado === 'en_terna').length;
    const filtrados = postulaciones.filter((p) =>
      ['filtrado_no_cumple', 'pre_entrevistado_no_interesado', 'desistio_candidato'].includes(
        p.estado,
      ),
    ).length;
    return { total, internos, enTerna, filtrados };
  }, [postulaciones]);

  if (!vacante)
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">
        Cargando vacante…
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Volver */}
      <Link
        to={`/vacantes/${vacante.id}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver al detalle
      </Link>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-6">
        <div className="max-w-2xl">
          <Pill tono="brand" dot>
            Pasos 5 – 11 · Analista
          </Pill>
          <h1
            className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            Postulaciones
          </h1>
          <p className="mt-3 flex items-center gap-1.5 text-[14px] text-text-muted">
            <Building2 size={13} strokeWidth={1.5} className="text-text-subtle" />
            {vacante.cargo_nombre} · {vacante.empresa_nombre} · {vacante.sede_nombre}
          </p>
        </div>
      </div>

      {/* ─── Stats inline ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Total" valor={stats.total} icono={<Users size={14} strokeWidth={1.75} />} />
        <MiniStat label="Internos" valor={stats.internos} tono="info" />
        <MiniStat label="En terna" valor={stats.enTerna} tono="brand" />
        <MiniStat label="Filtrados / desistieron" valor={stats.filtrados} tono="neutral" />
      </div>

      {/* ─── Importar CVs en lote ─────────────────────────────── */}
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <UploadCloud size={14} strokeWidth={1.75} className="text-text-muted" />
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                Importar CVs en lote
              </p>
            </div>
            <p className="text-[13px] text-text-muted mt-2 max-w-2xl leading-relaxed">
              Selecciona varios PDFs a la vez (Magneto, Drive). Cada archivo crea un candidato
              provisional + una postulación con el CV adjunto. Luego editas los datos en{' '}
              <span className="font-semibold text-text-body">Abrir →</span>.
            </p>
          </div>
          <Button
            type="button"
            variant="brand-primary"
            onClick={() => inputFilesRef.current?.click()}
            disabled={subiendoCVs}
            loading={subiendoCVs}
            icon={<FileUp size={13} strokeWidth={1.75} />}
          >
            {subiendoCVs ? 'Subiendo…' : 'Subir CVs (PDF)'}
          </Button>
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
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5">
            <div className="flex items-center justify-between text-[12px] mb-2">
              <span className="text-text-body font-medium tabular-nums">
                {progresoCVs.hechos} / {progresoCVs.total} archivos
              </span>
              {progresoCVs.hechos === progresoCVs.total && !subiendoCVs && (
                <Pill tono="success" dot>
                  Listo
                </Pill>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-brand-600 transition-all duration-200 ease-out"
                style={{
                  width: `${
                    progresoCVs.total > 0 ? (progresoCVs.hechos / progresoCVs.total) * 100 : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* ─── Agregar candidato manual ─────────────────────────── */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-5">
          <UserPlus size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Agregar candidato manual
          </p>
        </div>

        <form onSubmit={agregarPostulacion} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <BrandLabel label="Nombres" requerido>
              <input
                value={form.nombres}
                onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                required
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Apellidos" requerido>
              <input
                value={form.apellidos}
                onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                required
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Email" requerido>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Teléfono" requerido>
              <input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                required
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Doc. tipo">
              <select
                value={form.documento_tipo}
                onChange={(e) => setForm({ ...form, documento_tipo: e.target.value })}
                className={inputClass}
              >
                <option value="CC">CC</option>
                <option value="CE">CE</option>
                <option value="PEP">PEP</option>
                <option value="PA">PA</option>
              </select>
            </BrandLabel>
            <BrandLabel label="Doc. número">
              <input
                value={form.documento_numero}
                onChange={(e) => setForm({ ...form, documento_numero: e.target.value })}
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Ciudad">
              <input
                value={form.ciudad_residencia}
                onChange={(e) => setForm({ ...form, ciudad_residencia: e.target.value })}
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Especialidad">
              <input
                value={form.especialidad_tecnica}
                onChange={(e) => setForm({ ...form, especialidad_tecnica: e.target.value })}
                placeholder="ej. Backend Node.js"
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Años exp.">
              <input
                type="number"
                min={0}
                max={50}
                value={form.anios_experiencia}
                onChange={(e) => setForm({ ...form, anios_experiencia: e.target.value })}
                className={inputClass}
              />
            </BrandLabel>
            <BrandLabel label="Fuente">
              <select
                value={form.fuente}
                onChange={(e) =>
                  setForm({ ...form, fuente: e.target.value as FuentePostulacion })
                }
                className={inputClass}
              >
                {FUENTES.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </BrandLabel>
            <BrandLabel label="Detalle de la fuente (opcional)">
              <input
                value={form.fuente_detalle}
                onChange={(e) => setForm({ ...form, fuente_detalle: e.target.value })}
                placeholder='ej. "aviso Promotor en Magneto" o el cargo de la publicación'
                className={inputClass}
              />
            </BrandLabel>
          </div>
          {err && (
            <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
              {err}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="brand-primary"
              disabled={procesando}
              loading={procesando}
            >
              {procesando ? 'Guardando…' : 'Agregar candidato'}
            </Button>
          </div>
        </form>
      </Card>

      {/* ─── Filtros ──────────────────────────────────────────── */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex-1 min-w-[220px] relative">
          <Search
            size={15}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className={cn(inputClass, 'pl-9')}
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className={cn(inputClass, 'md:w-auto')}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <label
          className={cn(
            'inline-flex items-center gap-2 rounded-brand-input border px-3.5 py-2.5 text-[13px] cursor-pointer transition-colors duration-150 ease-out',
            soloInternos
              ? 'border-info-500 bg-info-50 text-info-700'
              : 'border-slate-200 bg-white text-text-body hover:bg-slate-50',
          )}
        >
          <input
            type="checkbox"
            checked={soloInternos}
            onChange={(e) => setSoloInternos(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-info-600 focus:ring-info-300/40"
          />
          <span className="font-medium">Solo internos</span>
          <span className="tabular-nums text-text-subtle">({stats.internos})</span>
        </label>
      </div>

      {/* ─── Tabla ────────────────────────────────────────────── */}
      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-text-muted">
            <tr>
              <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                Candidato
              </th>
              <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                Contacto
              </th>
              <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                CV
              </th>
              <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left">
                Estado
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-[13px]">
                  Sin postulaciones con esos filtros.
                </td>
              </tr>
            )}
            {filtradas.map((p) => (
              <tr
                key={p.id}
                className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-text-strong">{p.candidato_nombre}</span>
                    {p.fuente === 'base_interna' && (
                      <Pill tono="info">🏢 Interno</Pill>
                    )}
                  </div>
                  <p className="text-[11px] text-text-subtle mt-0.5">
                    {p.fuente?.replace(/_/g, ' ')}
                    {p.fuente_detalle ? ` · ${p.fuente_detalle}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-text-muted text-[12px]">
                  {p.candidato_email || (
                    <span className="italic text-text-subtle">sin email</span>
                  )}
                  <br />
                  {p.candidato_telefono || (
                    <span className="italic text-text-subtle">sin tel.</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.candidato_cv_url ? (
                    <a
                      href={p.candidato_cv_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-800 hover:underline text-[12px] font-medium"
                    >
                      <FileText size={12} strokeWidth={1.75} />
                      Ver PDF
                    </a>
                  ) : (
                    <span className="text-text-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={p.estado}
                    onChange={(e) => cambiarEstado(p, e.target.value as EstadoPostulacion)}
                    className="rounded-brand-input bg-white border border-slate-200 px-2 py-1 text-[12px] text-text-strong focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40"
                  >
                    {ESTADOS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/postulaciones/${p.id}`}
                    className="text-brand-700 hover:text-brand-800 hover:underline text-[12px] font-medium"
                  >
                    Abrir →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ─── CTAs siguiente paso ──────────────────────────────── */}
      <div className="flex justify-end gap-3 flex-wrap pt-2">
        <Link to={`/vacantes/${vacante.id}/concepto-atraccion`}>
          <Button variant="neutral-secondary">Generar concepto VIDA-F-03 →</Button>
        </Link>
        <Link to={`/vacantes/${vacante.id}/terna`}>
          <Button variant="brand-primary">Ir a terna →</Button>
        </Link>
      </div>
    </div>
  );
}

function BrandLabel({
  label,
  requerido,
  children,
}: {
  label: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-strong mb-1.5">
        {label} {requerido && <span className="text-brand-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function MiniStat({
  label,
  valor,
  tono = 'neutral',
  icono,
}: {
  label: string;
  valor: number;
  tono?: 'brand' | 'info' | 'success' | 'neutral';
  icono?: React.ReactNode;
}) {
  const claseValor =
    tono === 'brand'
      ? 'text-brand-700'
      : tono === 'info'
        ? 'text-info-700'
        : tono === 'success'
          ? 'text-success-700'
          : 'text-text-strong';
  return (
    <div className="bg-white rounded-md border border-slate-200 p-4 shadow-brand-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icono}
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase">{label}</p>
      </div>
      <p
        className={cn(
          'mt-2 text-[36px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums',
          claseValor,
        )}
      >
        {valor}
      </p>
    </div>
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
    en_examenes_medicos: 'en_examenes_medicos_en',
    descartado_por_lider: 'descartado_en',
    descartado_examenes_medicos: 'descartado_examenes_medicos_en',
    en_contratacion: 'en_contratacion_en',
    contratado: 'contratado_en',
    desistio_candidato: 'desistio_en',
  };
  return mapa[estado] ?? null;
}
