import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Check, Upload } from 'lucide-react';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Card, Pill } from '../../components/brand';
import { TIPO_SOLICITUD_LABEL } from '../../schemas';
import { auth, db, functions, storage } from '../../lib/firebase';
import { formatearCOP } from '../../utils/moneda';
import { cn } from '../../utils/cn';
import type { VacanteDoc } from '../../schemas';

interface ReferidoResuelto {
  cedula_tecnico: string;
  nombre_tecnico: string;
  generacion_id: string;
}

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

// Consentimiento de tratamiento de datos (Ley 1581 / Habeas Data). La versión y
// la URL de la política son CONFIGURABLES sin deploy desde
// configuracion_global/consentimiento_registro; esto es solo el respaldo.
const CONSENT_DEFAULT = {
  version: 'v1-2026-07',
  politica_url: 'https://equitel.com.co/tratamiento-de-datos-personales',
};

export default function CarreraPublicaPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const refSlug = searchParams.get('ref');
  const [vacante, setVacante] = useState<VacanteDoc | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [postulado, setPostulado] = useState<{ ok: boolean; id: string } | null>(null);
  const [referido, setReferido] = useState<ReferidoResuelto | null>(null);
  // Contexto del cargo para el candidato (lo que ve quien quiere postularse):
  // criterios del perfilamiento, o la descripción del cargo. NUNCA la
  // justificación (campo interno de por qué se abrió la vacante).
  const [contextoCargo, setContextoCargo] = useState('');

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

  // Habeas Data: aceptación obligatoria + política configurable.
  const [habeasAceptado, setHabeasAceptado] = useState(false);
  const [consent, setConsent] = useState(CONSENT_DEFAULT);
  useEffect(() => {
    getDoc(doc(db, 'configuracion_global', 'consentimiento_registro'))
      .then((s) => {
        if (!s.exists()) return;
        const d = s.data() as Record<string, unknown>;
        setConsent({
          version: String(d.version ?? CONSENT_DEFAULT.version),
          politica_url: String(d.politica_url ?? CONSENT_DEFAULT.politica_url),
        });
      })
      .catch(() => {
        /* usa el respaldo */
      });
  }, []);

  // Referencias laborales: el candidato registra 2 contactos de empleos
  // anteriores, o marca "no aplica" si no tiene experiencia.
  const [refsNoAplica, setRefsNoAplica] = useState(false);
  const [refs, setRefs] = useState([
    { nombre: '', empresa: '', cargo: '', telefono: '' },
    { nombre: '', empresa: '', cargo: '', telefono: '' },
  ]);
  function setRef(i: number, patch: Partial<{ nombre: string; empresa: string; cargo: string; telefono: string }>) {
    setRefs((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

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

  // Resolver el slug del ?ref= a {cedula, nombre} del técnico referidor.
  // Si el slug es inválido o no existe, dejamos `referido` en null y la
  // postulación sigue su flujo normal sin marca de referido.
  useEffect(() => {
    if (!refSlug || !authReady) return;
    (async () => {
      try {
        const fn = httpsCallable<
          { slug: string },
          | { encontrado: false }
          | {
              encontrado: true;
              cedula_tecnico: string;
              nombre_tecnico: string;
              generacion_id: string;
            }
        >(functions, 'resolverRefSlug');
        const res = await fn({ slug: refSlug });
        if (res.data.encontrado) {
          setReferido({
            cedula_tecnico: res.data.cedula_tecnico,
            nombre_tecnico: res.data.nombre_tecnico,
            generacion_id: res.data.generacion_id,
          });
        }
      } catch (e) {
        // El candidato no debe ver errores por un slug malo.
        console.warn('No se pudo resolver ?ref=', e);
      }
    })();
  }, [refSlug, authReady]);

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
        // La landing pública SIEMPRE muestra la vacante si existe, sin
        // importar su estado. Así Karen puede compartir el link desde el
        // momento que se crea la solicitud y los candidatos ven la oferta
        // aunque aún no se haya pasado el aval. Si la vacante está cerrada,
        // desierta o cancelada, el formulario de postular se deshabilita
        // arriba — pero el detalle queda visible.
        setVacante({ id: snap.id, ...data });
        setCargando(false);

        // Contexto del cargo para el candidato: primero los criterios del
        // perfilamiento (lo que el líder definió para esta vacante), si no, la
        // descripción del cargo del catálogo. Se deja la justificación FUERA
        // de la landing — es interna.
        try {
          let contexto = '';
          if (data.proceso_activo_id) {
            const ps = await getDoc(doc(db, 'procesos', data.proceso_activo_id));
            const perf = ps.exists()
              ? (ps.data() as { perfilamiento?: { criterios_texto?: string } }).perfilamiento
              : null;
            contexto = (perf?.criterios_texto ?? '').trim();
          }
          if (!contexto && data.cargo_id) {
            const cs = await getDoc(doc(db, 'cargos_catalogo', data.cargo_id));
            contexto = cs.exists()
              ? String((cs.data() as { descripcion?: string }).descripcion ?? '').trim()
              : '';
          }
          setContextoCargo(contexto);
        } catch (e) {
          console.warn('No se pudo cargar el contexto del cargo', e);
        }
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
    // Referencias: si no marcó "no aplica", debe registrar 2 contactos con
    // nombre y teléfono. Si no tiene experiencia, marca "no aplica".
    const refsLimpias = refs
      .map((r) => ({
        nombre: r.nombre.trim(),
        empresa: r.empresa.trim(),
        cargo: r.cargo.trim(),
        telefono: r.telefono.trim(),
      }))
      .filter((r) => r.nombre || r.empresa || r.cargo || r.telefono);
    if (!refsNoAplica) {
      const completas = refsLimpias.filter((r) => r.nombre && r.telefono);
      if (completas.length < 2) {
        setErrSubmit(
          'Registra 2 contactos de referencia (nombre y teléfono) de tus últimos empleos, o marca "No tengo experiencia / no aplica".',
        );
        return;
      }
    }
    if (!habeasAceptado) {
      setErrSubmit('Debes autorizar el tratamiento de tus datos personales para continuar.');
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
      // Evidencia auditable del consentimiento Habeas Data: versión + política
      // aceptada + fecha de servidor + id de sesión (el uid anónimo = creado_por).
      const habeasData = {
        aceptado: true,
        version: consent.version,
        politica_url: consent.politica_url,
        aceptado_en: serverTimestamp(),
      };
      const candRef = await addDoc(collection(db, 'candidatos'), {
        habeas_data: habeasData,
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
        habeas_data: habeasData,
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
        // Si llegó por ?ref= y resolvimos el slug → fuente='referido'. Si no,
        // sigue siendo postulación directa.
        fuente: referido ? 'referido' : 'postulacion_directa',
        marcas: { postulado_en: ahora },
        fecha_postulacion: ahora,
        ultima_transicion_estado: ahora,
        origen_publicacion_id: null,
        razon_descarte: null,
        descarte_etapa: null,
        analista_uid: vacante.analista_uid ?? null,
        referido_por_cedula: referido?.cedula_tecnico ?? null,
        referido_por_nombre: referido?.nombre_tecnico ?? null,
        referido_generacion_id: referido?.generacion_id ?? null,
        referencias_no_aplica: refsNoAplica,
        referencias_aportadas: refsNoAplica ? [] : refsLimpias,
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
          {contextoCargo && (
            <Card padding="lg">
              <Pill tono="brand">Sobre esta vacante</Pill>
              <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.012em] text-text-strong mb-3">
                Lo que buscamos
              </h2>
              <p className="text-[14px] text-text-body whitespace-pre-line leading-[1.65]">
                {contextoCargo}
              </p>
            </Card>
          )}

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
                      required
                      inputMode="numeric"
                      placeholder="Sin puntos ni espacios"
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

              {/* Referencias laborales */}
              <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3.5 space-y-3">
                <div>
                  <p className="text-[12px] font-semibold text-text-strong">
                    Referencias laborales
                  </p>
                  <p className="text-[11px] text-text-muted leading-[1.5] mt-0.5">
                    Registra 2 contactos de referencia de tus últimos empleos (nombre y
                    teléfono). Si no tienes experiencia, marca la casilla.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-text-body cursor-pointer">
                  <input
                    type="checkbox"
                    checked={refsNoAplica}
                    onChange={(e) => setRefsNoAplica(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-300/40"
                  />
                  No tengo experiencia laboral / no aplica
                </label>

                {!refsNoAplica &&
                  refs.map((r, i) => (
                    <div
                      key={i}
                      className="space-y-2 rounded-md border border-slate-200 bg-white p-3"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-muted">
                        Referencia {i + 1}
                      </p>
                      <input
                        placeholder="Nombre del contacto"
                        value={r.nombre}
                        onChange={(e) => setRef(i, { nombre: e.target.value })}
                        className={inputClass}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Empresa"
                          value={r.empresa}
                          onChange={(e) => setRef(i, { empresa: e.target.value })}
                          className={inputClass}
                        />
                        <input
                          placeholder="Cargo (opcional)"
                          value={r.cargo}
                          onChange={(e) => setRef(i, { cargo: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <input
                        placeholder="Teléfono"
                        value={r.telefono}
                        onChange={(e) => setRef(i, { telefono: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  ))}
              </div>

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

              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={habeasAceptado}
                  onChange={(e) => setHabeasAceptado(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-[11.5px] text-text-muted leading-[1.5]">
                  Autorizo de manera libre y expresa el tratamiento de mis datos personales por la
                  Organización Equitel, conforme a la{' '}
                  <a
                    href={consent.politica_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 underline hover:text-brand-800"
                  >
                    Política de Tratamiento de Datos Personales
                  </a>{' '}
                  (Ley 1581 de 2012). <span className="text-danger-600">*</span>
                </span>
              </label>

              <Button
                type="submit"
                variant="brand-primary"
                size="large"
                fullWidth
                loading={enviando}
                disabled={enviando || !habeasAceptado}
              >
                {enviando ? 'Enviando…' : 'Enviar postulación'}
              </Button>
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
