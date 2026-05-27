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
import { Button, Card, Pill } from '../../components/brand';
import { TIPO_SOLICITUD_LABEL } from '../../schemas';
import { auth, db, storage } from '../../lib/firebase';
import { formatearCOP } from '../../utils/moneda';
import { cn } from '../../utils/cn';
import type { VacanteDoc } from '../../schemas';

/**
 * CarreraPublicaPage · sistema brand.
 *
 * Landing pública por vacante (paso 5 reclutamiento). Hero negro con
 * arco brand decorativo, contenido en cards brand, sidebar sticky con
 * formulario sunken. Primer punto de contacto con candidatos externos.
 */

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-text-muted text-sm">
        Cargando oferta…
      </div>
    );
  }

  if (errorCarga || !vacante) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full">
          <Card padding="lg">
            <h1 className="text-[22px] font-semibold tracking-[-0.012em] text-text-strong">
              Oferta no disponible
            </h1>
            <p className="mt-2 text-[13px] text-text-muted leading-[1.55]">
              {errorCarga ?? 'Esta oferta no existe o ya cerró su convocatoria.'}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (postulado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full">
          <Card padding="lg">
            <div className="text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-success-50 text-success-700 flex items-center justify-center">
                <Check size={26} strokeWidth={2} />
              </div>
              <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.012em] text-text-strong">
                ¡Gracias por postularte!
              </h1>
              <p className="mt-2 text-[13px] text-text-body leading-[1.55]">
                Recibimos tu información para la vacante{' '}
                <strong className="text-text-strong">{vacante.cargo_nombre}</strong>. Nuestro
                equipo la revisará y te contactará pronto por correo o WhatsApp.
              </p>
              <p className="mt-6 text-[11px] font-mono text-text-subtle tabular-nums">
                Ref: {postulado.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero · negro con arco brand */}
      <header className="relative overflow-hidden bg-text-strong text-white py-16 px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-48 h-96 w-[560px] rounded-full bg-brand-600 opacity-90 blur-[1px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-white/[0.03]"
        />
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <EquitelLogo size={36} />
            <span className="h-7 w-px bg-white/25" aria-hidden />
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/80 font-bold">
              Reclutamiento
            </span>
          </div>
          <h1
            className="text-[44px] md:text-[56px] font-light leading-[1.02] tracking-[-0.035em] max-w-3xl"
            style={{ textWrap: 'balance' }}
          >
            {vacante.cargo_nombre}
          </h1>
          <p className="text-white/75 mt-3 text-[17px] leading-[1.45]">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          <div className="mt-6 flex gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-text-strong px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
              Criticidad {vacante.criticidad}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/10 border border-white/20 text-white px-3 py-1 text-[11px] font-medium">
              {TIPO_SOLICITUD_LABEL[vacante.tipo_solicitud] ?? 'Reemplazo indefinido'}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/10 border border-white/20 text-white px-3 py-1 text-[11px] font-mono tabular-nums">
              {vacante.consecutivo}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card padding="lg">
            <Pill tono="brand">Sobre esta vacante</Pill>
            <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.012em] text-text-strong mb-3">
              Lo que buscamos
            </h2>
            <p className="text-[14px] text-text-body whitespace-pre-line leading-[1.65]">
              {vacante.justificacion}
            </p>
          </Card>

          <Card padding="lg">
            <Pill tono="info">Condiciones</Pill>
            <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.012em] text-text-strong mb-4">
              Qué ofrecemos
            </h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-1">
                  Salario base
                </dt>
                <dd className="text-[18px] font-semibold tracking-[-0.012em] text-text-strong tabular-nums">
                  {formatearCOP(vacante.salario_base)}
                </dd>
              </div>
              {vacante.comisiones_texto && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-1">
                    Comisiones
                  </dt>
                  <dd className="text-[13px] text-text-body leading-[1.5]">
                    {vacante.comisiones_texto}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-1">
                  Auxilio rodamiento
                </dt>
                <dd className="text-[13px] text-text-body">
                  {vacante.rodamiento ? 'Sí incluye' : 'No aplica'}
                </dd>
              </div>
              {vacante.garantizado_texto && (
                <div className="md:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted mb-1">
                    Garantizado
                  </dt>
                  <dd className="text-[13px] text-text-body whitespace-pre-line leading-[1.5]">
                    {vacante.garantizado_texto}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card padding="lg">
            <Pill tono="success">Proceso</Pill>
            <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.012em] text-text-strong mb-4">
              ¿Qué sigue después de postular?
            </h2>
            <ol className="space-y-3">
              {[
                'Nuestro equipo de reclutamiento revisa tu CV.',
                'Si tu perfil encaja, te contactamos para una preentrevista por WhatsApp o llamada.',
                'Avanzarás con pruebas, entrevista con analista y con el líder.',
                'Todo el proceso está pensado para tardar 10 días hábiles o menos.',
              ].map((paso, i) => (
                <li key={i} className="flex gap-3 text-[13px] text-text-body leading-[1.55]">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[11px] font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 pt-0.5">{paso}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside>
          <Card padding="lg" className="sticky top-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Pill tono="brand" dot>
                  Postularme
                </Pill>
                <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.012em] text-text-strong">
                  Aplicar ahora
                </h2>
                <p className="text-[12px] text-text-muted mt-1 leading-[1.5]">
                  Completa el formulario y adjunta tu CV en PDF.
                </p>
              </div>

              <Field label="Nombres">
                <input
                  required
                  value={form.nombres}
                  onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Apellidos">
                <input
                  required
                  value={form.apellidos}
                  onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Correo electrónico">
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Teléfono / WhatsApp">
                <input
                  required
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Doc.">
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
                </Field>
                <div className="col-span-2">
                  <Field label="Número">
                    <input
                      value={form.documento_numero}
                      onChange={(e) =>
                        setForm({ ...form, documento_numero: e.target.value })
                      }
                      className={cn(inputClass, 'font-mono tabular-nums')}
                    />
                  </Field>
                </div>
              </div>
              <Field label="Ciudad de residencia">
                <input
                  required
                  placeholder="Bogotá, Medellín, Cali…"
                  value={form.ciudad_residencia}
                  onChange={(e) => setForm({ ...form, ciudad_residencia: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Años exp.">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={form.anios_experiencia}
                    onChange={(e) =>
                      setForm({ ...form, anios_experiencia: e.target.value })
                    }
                    className={cn(inputClass, 'tabular-nums')}
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="Especialidad principal">
                    <input
                      placeholder="ej. Backend Node.js, Comercial B2B…"
                      value={form.especialidad_tecnica}
                      onChange={(e) =>
                        setForm({ ...form, especialidad_tecnica: e.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
              <Field label="LinkedIn (opcional)">
                <input
                  placeholder="https://linkedin.com/in/…"
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Experiencia breve">
                <textarea
                  rows={3}
                  placeholder="Resumen breve de tu trayectoria, logros relevantes"
                  value={form.experiencia_texto}
                  onChange={(e) =>
                    setForm({ ...form, experiencia_texto: e.target.value })
                  }
                  className={cn(inputClass, 'resize-y')}
                />
              </Field>

              <Field
                label={
                  <>
                    CV en PDF{' '}
                    <span className="text-text-subtle font-normal normal-case tracking-normal">
                      · máx 5 MB
                    </span>
                  </>
                }
              >
                <div
                  className={cn(
                    'rounded-md border border-dashed border-slate-300 bg-slate-50/60',
                    'px-4 py-4 text-center transition-colors hover:bg-slate-100/60',
                  )}
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setCv(e.target.files?.[0] ?? null)}
                    required
                    className="w-full text-[11px] cursor-pointer text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-brand-50 file:text-brand-700 file:text-[11px] file:font-semibold file:cursor-pointer hover:file:bg-brand-100"
                  />
                  {cv && (
                    <p className="mt-2 text-[11px] text-text-body font-medium flex items-center justify-center gap-1.5">
                      <Upload size={11} strokeWidth={1.75} />
                      {cv.name}
                    </p>
                  )}
                </div>
              </Field>

              {errSubmit && (
                <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-[12px] text-danger-700">
                  {errSubmit}
                </div>
              )}

              <Button
                type="submit"
                variant="brand-primary"
                size="large"
                fullWidth
                loading={enviando}
                disabled={enviando}
              >
                {enviando ? 'Enviando…' : 'Enviar postulación'}
              </Button>
              <p className="text-[10px] text-text-subtle text-center leading-[1.5] pt-1">
                Al enviar aceptas que tus datos sean tratados por Gestión Humana de EQUITEL con
                fines de selección.
              </p>
            </form>
          </Card>
        </aside>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-10 flex items-center justify-center gap-3 text-[11px] text-text-muted">
        <EquitelLogo size={18} />
        <span>· Plataforma de Atracción de Talento</span>
      </footer>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
