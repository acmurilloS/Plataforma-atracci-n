import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Check, Upload } from 'lucide-react';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Card, Input, Select, Textarea } from '../../components/ui';
import { auth, db, storage } from '../../lib/firebase';
import { formatearCOP } from '../../utils/moneda';
import type { VacanteDoc } from '../../schemas';

export default function CarreraPublicaPage() {
  const { id } = useParams<{ id: string }>();
  const [vacante, setVacante] = useState<VacanteDoc | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [postulado, setPostulado] = useState<{ ok: boolean; id: string } | null>(null);

  const [form, setForm] = useState({
    nombres: '',
    apellidos: '',
    email: '',
    telefono: '',
    documento_tipo: 'CC',
    documento_numero: '',
    ciudad_residencia: '',
    especialidad_tecnica: '',
    anios_experiencia: '',
    experiencia_texto: '',
    linkedin_url: '',
  });
  const [cv, setCv] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error('Anon sign-in falló:', e);
        }
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!id || !authReady) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'vacantes', id));
        if (!snap.exists()) {
          setErrorCarga('Esta oferta no existe.');
          setCargando(false);
          return;
        }
        const data = snap.data() as Omit<VacanteDoc, 'id'>;
        if (!['publicada', 'en_proceso'].includes(data.estado)) {
          setErrorCarga('Esta vacante ya no está recibiendo postulaciones.');
          setCargando(false);
          return;
        }
        setVacante({ id: snap.id, ...data });
        setCargando(false);
      } catch (e) {
        console.error(e);
        setErrorCarga('No pudimos cargar la información. Intenta más tarde.');
        setCargando(false);
      }
    })();
  }, [id, authReady]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vacante || !auth.currentUser) return;
    if (!cv) {
      setErrSubmit('Adjunta tu CV en PDF.');
      return;
    }
    setEnviando(true);
    setErrSubmit(null);
    try {
      if (cv.type !== 'application/pdf') throw new Error('El CV debe ser PDF.');
      if (cv.size > 5 * 1024 * 1024) throw new Error('El CV no puede superar 5 MB.');

      const ts = Date.now();
      const safe = cv.name.replace(/[^\w.-]+/g, '_');
      const path = `cvs/${vacante.id}/${ts}_${safe}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, cv, { contentType: 'application/pdf' });
      const cv_url = await getDownloadURL(storageRef);

      const uid = auth.currentUser.uid;
      const aniosNum = form.anios_experiencia ? parseInt(form.anios_experiencia, 10) : null;
      const candRef = await addDoc(collection(db, 'candidatos'), {
        nombres: form.nombres,
        apellidos: form.apellidos,
        email: form.email,
        telefono: form.telefono,
        documento_tipo: form.documento_tipo,
        documento_numero: form.documento_numero || null,
        provisional: !form.documento_numero,
        // Pool-ready (ATR-11): capturamos desde día 1 para que el pool madure
        ciudad_residencia: form.ciudad_residencia || null,
        dominio_principal: 'sin_clasificar',
        especialidad_tecnica: form.especialidad_tecnica.trim(),
        skills_tags: [],
        anios_experiencia_aproximados: aniosNum,
        origen: 'equitel_reclutamiento',
        magneto_id: null,
        linkedin_url: form.linkedin_url || null,
        fuente_hv_url: cv_url,
        observaciones: form.experiencia_texto,
        alertas: [],
        alertas_tipos: [],
        // Estado consolidado del candidato (se actualiza con cada postulación)
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
        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });

      const nombreCompleto = `${form.nombres} ${form.apellidos}`.trim();
      const ahora = Timestamp.now();
      const postRef = await addDoc(collection(db, 'postulaciones'), {
        candidato_id: candRef.id,
        proceso_id: vacante.proceso_activo_id,
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        cargo_nombre: vacante.cargo_nombre,
        candidato_nombre: nombreCompleto,
        candidato_email: form.email,
        candidato_telefono: form.telefono,
        candidato_cv_url: cv_url,
        estado: 'postulado',
        cumple_criterios: null,
        fuente: 'postulacion_directa',
        marcas: { postulado_en: ahora },
        fecha_postulacion: ahora,
        ultima_transicion_estado: ahora,
        origen_publicacion_id: null,
        razon_descarte: null,
        descarte_etapa: null,
        analista_uid: vacante.analista_uid ?? null,
        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });

      setPostulado({ ok: true, id: postRef.id });
    } catch (e) {
      setErrSubmit(e instanceof Error ? e.message : 'No pudimos enviar la postulación.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 text-navy-500">
        Cargando oferta…
      </div>
    );
  }

  if (errorCarga || !vacante) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 p-6">
        <div className="max-w-md rounded-xl border border-navy-100 bg-white p-8 text-center shadow-sm">
          <h1 className="font-display text-2xl font-semibold text-navy-900">
            Oferta no disponible
          </h1>
          <p className="mt-2 text-sm text-navy-600">
            {errorCarga ?? 'Esta oferta no existe o ya cerró su convocatoria.'}
          </p>
        </div>
      </div>
    );
  }

  if (postulado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 p-6">
        <div className="max-w-md rounded-xl border border-navy-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Check size={28} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-navy-900 mt-4">
            ¡Gracias por postularte!
          </h1>
          <p className="mt-2 text-sm text-navy-600">
            Recibimos tu información para la vacante{' '}
            <strong className="text-navy-900">{vacante.cargo_nombre}</strong>. Nuestro equipo la
            revisará y te contactará pronto por correo o WhatsApp.
          </p>
          <p className="mt-6 text-xs font-mono text-navy-400">
            Ref: {postulado.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="relative overflow-hidden bg-navy-900 text-white py-14 px-6">
        {/* Arco rojo decorativo inspirado en la portada del brand book */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-48 h-96 w-[560px] rounded-full bg-equitel-rojo-600 opacity-95"
        />
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <EquitelLogo size={36} />
            <span className="h-7 w-px bg-white/30" aria-hidden />
            <span className="text-[11px] uppercase tracking-[0.22em] text-white/80 font-bold">
              Reclutamiento
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight max-w-3xl">
            {vacante.cargo_nombre}
          </h1>
          <p className="text-white/80 mt-3 text-lg">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          <div className="mt-6 flex gap-2 flex-wrap">
            <span className="rounded-full bg-white text-navy-900 px-3 py-1 text-xs font-bold uppercase">
              Criticidad {vacante.criticidad}
            </span>
            <span className="rounded-full bg-white/10 border border-white/20 text-white px-3 py-1 text-xs font-medium">
              {vacante.tipo_solicitud === 'aumento' ? 'Aumento de headcount' : 'Reemplazo'}
            </span>
            <span className="rounded-full bg-white/10 border border-white/20 text-white px-3 py-1 text-xs font-mono">
              {vacante.consecutivo}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card padding="lg">
            <h2 className="font-display text-xl font-bold text-navy-900 mb-3">
              Sobre esta vacante
            </h2>
            <p className="text-sm text-navy-700 whitespace-pre-line leading-relaxed">
              {vacante.justificacion}
            </p>
          </Card>

          <Card padding="lg">
            <h2 className="font-display text-xl font-bold text-navy-900 mb-3">Condiciones</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-navy-500 text-xs uppercase tracking-wide">Salario base</dt>
                <dd className="font-semibold text-navy-900 mt-1">
                  {formatearCOP(vacante.salario_base)}
                </dd>
              </div>
              {vacante.comisiones_texto && (
                <div>
                  <dt className="text-navy-500 text-xs uppercase tracking-wide">Comisiones</dt>
                  <dd className="text-navy-700 mt-1">{vacante.comisiones_texto}</dd>
                </div>
              )}
              <div>
                <dt className="text-navy-500 text-xs uppercase tracking-wide">Auxilio rodamiento</dt>
                <dd className="text-navy-700 mt-1">{vacante.rodamiento ? 'Sí incluye' : 'No aplica'}</dd>
              </div>
              {vacante.garantizado_texto && (
                <div className="md:col-span-2">
                  <dt className="text-navy-500 text-xs uppercase tracking-wide">Garantizado</dt>
                  <dd className="text-navy-700 mt-1 whitespace-pre-line">
                    {vacante.garantizado_texto}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card padding="lg">
            <h2 className="font-display text-xl font-bold text-navy-900 mb-3">
              ¿Qué sigue después de postular?
            </h2>
            <ol className="space-y-2 text-sm text-navy-700">
              <li>
                <strong>1.</strong> Nuestro equipo de reclutamiento revisa tu CV.
              </li>
              <li>
                <strong>2.</strong> Si tu perfil encaja, te contactamos para una preentrevista por
                WhatsApp o llamada.
              </li>
              <li>
                <strong>3.</strong> Avanzarás con pruebas, entrevista con analista y con el líder.
              </li>
              <li>
                <strong>4.</strong> Todo el proceso está pensado para tardar 10 días hábiles o menos.
              </li>
            </ol>
          </Card>
        </div>

        <aside>
          <Card padding="lg" elevation="elevated" className="sticky top-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-navy-900">Postularme</h2>
                <p className="text-sm text-navy-500 mt-1">
                  Completa el formulario y adjunta tu CV en PDF.
                </p>
              </div>
              <Input
                label="Nombres"
                required
                value={form.nombres}
                onChange={(e) => setForm({ ...form, nombres: e.target.value })}
              />
              <Input
                label="Apellidos"
                required
                value={form.apellidos}
                onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
              />
              <Input
                label="Correo electrónico"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="Teléfono / WhatsApp"
                required
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-3">
                <Select
                  label="Doc."
                  className="col-span-1"
                  value={form.documento_tipo}
                  onChange={(e) => setForm({ ...form, documento_tipo: e.target.value })}
                >
                  <option value="CC">CC</option>
                  <option value="CE">CE</option>
                  <option value="PEP">PEP</option>
                  <option value="PA">PA</option>
                </Select>
                <Input
                  label="Número"
                  className="col-span-2"
                  value={form.documento_numero}
                  onChange={(e) => setForm({ ...form, documento_numero: e.target.value })}
                />
              </div>
              <Input
                label="Ciudad de residencia"
                placeholder="Bogotá, Medellín, Cali…"
                required
                value={form.ciudad_residencia}
                onChange={(e) => setForm({ ...form, ciudad_residencia: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Años exp."
                  type="number"
                  min={0}
                  max={50}
                  className="col-span-1"
                  value={form.anios_experiencia}
                  onChange={(e) => setForm({ ...form, anios_experiencia: e.target.value })}
                />
                <Input
                  label="Especialidad principal"
                  className="col-span-2"
                  placeholder="ej. Backend Node.js, Comercial B2B…"
                  value={form.especialidad_tecnica}
                  onChange={(e) => setForm({ ...form, especialidad_tecnica: e.target.value })}
                />
              </div>
              <Input
                label="LinkedIn (opcional)"
                placeholder="https://linkedin.com/in/…"
                value={form.linkedin_url}
                onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
              />
              <Textarea
                label="Experiencia breve"
                placeholder="Resumen breve de tu trayectoria, logros relevantes"
                rows={3}
                value={form.experiencia_texto}
                onChange={(e) => setForm({ ...form, experiencia_texto: e.target.value })}
              />
              <div>
                <span className="block text-sm font-semibold text-navy-800 mb-1.5">
                  CV en PDF <span className="text-navy-400 font-normal">· máx 5 MB</span>
                </span>
                <div className="rounded-xl bg-surface-low px-4 py-5 text-center transition hover:bg-surface-mid">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setCv(e.target.files?.[0] ?? null)}
                    required
                    className="w-full text-xs cursor-pointer"
                  />
                  {cv && (
                    <p className="mt-2 text-xs text-navy-700 font-medium flex items-center justify-center gap-1.5">
                      <Upload size={12} /> {cv.name}
                    </p>
                  )}
                </div>
              </div>
              {errSubmit && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errSubmit}
                </div>
              )}
              <Button type="submit" variant="primary" size="lg" fullWidth loading={enviando}>
                {enviando ? 'Enviando…' : 'Enviar postulación'}
              </Button>
              <p className="text-[10px] text-navy-500 text-center leading-snug pt-1">
                Al enviar aceptas que tus datos sean tratados por Gestión Humana de EQUITEL con
                fines de selección.
              </p>
            </form>
          </Card>
        </aside>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-10 flex items-center justify-center gap-3 text-xs text-navy-500">
        <EquitelLogo size={18} />
        <span>· Plataforma de Atracción de Talento</span>
      </footer>
    </div>
  );
}
