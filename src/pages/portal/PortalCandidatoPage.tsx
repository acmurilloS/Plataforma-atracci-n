import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  Check,
  ClipboardList,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { auth, functions, storage } from '../../lib/firebase';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Input } from '../../components/brand';
import {
  CuerpoConsentimiento,
  empresaConsentimiento,
  tituloConsentimiento,
} from '../../components/consentimientos/consentimientoLegal';
import { FirmaInput } from '../../components/firma/FirmaInput';
import { estamparFormatoOficial } from '../../utils/estamparFormatoOficial';
import { MENSAJE_FINALIZADO_DEFAULT, mensajeFase } from '../../portal/faseProceso';
import { PortalStepper } from '../../components/portal/PortalStepper';
import {
  PortalCitaciones,
  type CitaEntrevista,
  type CitaExamen,
} from '../../components/portal/PortalCitaciones';
import { PortalDocumentos, type PortalSlot } from '../../components/portal/PortalDocumentos';
import { PortalAyuda } from '../../components/portal/PortalAyuda';
import { TurnstileWidget } from '../../components/portal/TurnstileWidget';

const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

/**
 * PortalCandidatoPage · portal público del candidato (sin login).
 *
 * Se llega por `/portal/:token` desde el link que el analista le manda al
 * candidato por correo. Acceso en dos factores: el token abre el link, pero el
 * candidato debe confirmar su CÉDULA antes de ver cualquier dato (la cédula es
 * confirmación, no autorización por sí sola). Ya dentro, el portal está
 * organizado en PESTAÑAS (proceso, documentos, autorizaciones, ayuda) para no
 * ser un único scroll largo.
 *
 * No usa Firestore directo (el candidato no tiene permisos): todo va por las
 * callables del portal. El backend nunca envía el estado técnico: solo una
 * `fase` neutra (nunca revela la causa de un descarte).
 */

interface PortalData {
  candidato_nombre: string;
  documento_numero: string;
  cargo_nombre: string;
  empresa_codigo: string;
  fase: string;
  finalizado: boolean;
  contratado: boolean;
  consentimiento_datos_aceptado: boolean;
  consentimiento_imagen_aceptado: boolean;
  condiciones: Record<string, string> | null;
  condiciones_aceptadas: boolean;
  firma_datos_basicos: boolean;
  firma_debida_diligencia: boolean;
  documentos: { nombre: string; url: string }[];
  slots: PortalSlot[];
  citaciones: { entrevista: CitaEntrevista | null; examen: CitaExamen | null };
  mensaje_descarte: string;
  analista_email: string;
}

interface GateInfo {
  sin_cedula_registrada: boolean;
  captcha_fallido: boolean;
  cedula_incorrecta: boolean;
  bloqueado: boolean;
  bloqueado_segundos: number;
  intentos_restantes: number;
  empresa_codigo: string;
}

type ResolverResp =
  | { encontrado: false }
  | ({ encontrado: true; requiere_cedula: true } & GateInfo)
  | ({ encontrado: true; requiere_cedula: false } & PortalData);

type TabKey = 'proceso' | 'documentos' | 'autorizaciones' | 'ayuda';

export default function PortalCandidatoPage() {
  const { token } = useParams<{ token: string }>();
  const [authReady, setAuthReady] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [data, setData] = useState<PortalData | null>(null);
  const [noValido, setNoValido] = useState(false);
  const [gate, setGate] = useState<GateInfo | null>(null);
  // Cédula validada — se reenvía como 2º factor en cada escritura.
  const [cedula, setCedula] = useState('');
  const [tab, setTab] = useState<TabKey>('proceso');

  // Auth anónima (el candidato no tiene cuenta real).
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

  // Resolución inicial (solo token): decide si pide cédula o ya entrega datos.
  useEffect(() => {
    if (!authReady || !token) return;
    (async () => {
      try {
        const fn = httpsCallable<{ token: string; cedula?: string }, ResolverResp>(
          functions,
          'resolverPortalToken',
        );
        const res = await fn({ token });
        aplicarResolver(res.data, '');
      } catch (e) {
        console.error('resolverPortalToken falló:', e);
        setNoValido(true);
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, token]);

  function aplicarResolver(resp: ResolverResp, cedulaUsada: string) {
    if (!resp.encontrado) {
      setNoValido(true);
      return;
    }
    if (resp.requiere_cedula) {
      const { encontrado: _e, requiere_cedula: _r, ...info } = resp;
      void _e;
      void _r;
      setGate(info);
      setData(null);
      return;
    }
    const { encontrado: _e, requiere_cedula: _r, ...rest } = resp;
    void _e;
    void _r;
    setData(rest);
    setGate(null);
    if (cedulaUsada) setCedula(cedulaUsada);
  }

  async function verificarCedula(valor: string, captchaToken: string) {
    if (!token) return;
    const fn = httpsCallable<
      { token: string; cedula?: string; captcha_token?: string },
      ResolverResp
    >(functions, 'resolverPortalToken');
    const res = await fn({ token, cedula: valor, captcha_token: captchaToken });
    aplicarResolver(res.data, valor);
  }

  async function aceptar(tipo: 'datos' | 'imagen', firmaUrl: string, firmaImagenUrl: string) {
    if (!token) return;
    const fn = httpsCallable<
      { token: string; tipo: string; firma_url?: string; firma_imagen_url?: string },
      { ok: true }
    >(functions, 'registrarConsentimientoPortal');
    await fn({ token, tipo, firma_url: firmaUrl, firma_imagen_url: firmaImagenUrl });
    setData((d) =>
      d
        ? {
            ...d,
            ...(tipo === 'datos'
              ? { consentimiento_datos_aceptado: true }
              : { consentimiento_imagen_aceptado: true }),
          }
        : d,
    );
  }

  if (cargando) {
    return (
      <Centro>
        <Loader2 className="animate-spin text-brand-600" size={26} strokeWidth={1.75} />
        <p className="mt-3 text-[13px] text-text-muted">Cargando tu portal…</p>
      </Centro>
    );
  }

  if (noValido) {
    return (
      <Centro>
        <ShieldCheck className="text-text-subtle" size={28} strokeWidth={1.5} />
        <p className="mt-3 text-[15px] font-medium text-text-strong">Este enlace no es válido</p>
        <p className="mt-1 text-[13px] text-text-muted max-w-sm">
          El link pudo expirar o estar incompleto. Escríbele a la persona de Atracción que te
          contactó para que te reenvíe tu portal.
        </p>
      </Centro>
    );
  }

  // Gate de cédula (2º factor) — todavía sin entregar PII.
  if (gate && !data) {
    return <CedulaGate gate={gate} onSubmit={verificarCedula} />;
  }

  if (!data) {
    return (
      <Centro>
        <ShieldCheck className="text-text-subtle" size={28} strokeWidth={1.5} />
        <p className="mt-3 text-[15px] font-medium text-text-strong">Este enlace no es válido</p>
      </Centro>
    );
  }

  const empresa = empresaConsentimiento(data.empresa_codigo);
  const primerNombre = data.candidato_nombre.split(' ')[0] || data.candidato_nombre;

  // ── Proceso finalizado: solo mensaje amable + ayuda (NUNCA la causa) ────────
  if (data.finalizado) {
    const mensaje = data.mensaje_descarte || MENSAJE_FINALIZADO_DEFAULT;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14 space-y-7">
          <Encabezado />
          <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card px-5 sm:px-7 py-7">
            <h1 className="text-[22px] sm:text-[26px] font-light leading-[1.2] tracking-[-0.02em] text-text-strong">
              Hola {primerNombre}
            </h1>
            <p className="mt-3 text-[14px] text-text-body leading-[1.6] whitespace-pre-line">
              {mensaje}
            </p>
          </section>
          <PortalAyuda analistaEmail={data.analista_email} cargo={data.cargo_nombre} />
          <PieEmpresa empresa={empresa} />
        </div>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'proceso', label: 'Mi proceso', icon: <ClipboardList size={15} strokeWidth={1.9} /> },
    { key: 'documentos', label: 'Documentos', icon: <FileText size={15} strokeWidth={1.9} /> },
    { key: 'autorizaciones', label: 'Autorizaciones', icon: <ShieldCheck size={15} strokeWidth={1.9} /> },
    { key: 'ayuda', label: '¿Dudas?', icon: <HelpCircle size={15} strokeWidth={1.9} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-5 py-8 sm:py-12 space-y-6">
        <Encabezado />

        <div>
          <h1 className="text-[24px] sm:text-[30px] font-light leading-[1.15] tracking-[-0.02em] text-text-strong">
            Hola {primerNombre} 👋
          </h1>
          <p className="mt-1.5 text-[14px] text-text-muted leading-[1.55]">
            Tu proceso para el cargo <strong>{data.cargo_nombre}</strong>. Usa las pestañas para ver
            en qué va, tus citas, subir documentos y firmar las autorizaciones.
          </p>
        </div>

        {/* Navegación por pestañas (mobile-first, scroll horizontal si no caben) */}
        <nav className="sticky top-0 z-10 -mx-5 px-5 py-2 bg-slate-50/90 backdrop-blur supports-[backdrop-filter]:bg-slate-50/75">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const activo = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    activo
                      ? 'bg-brand-600 text-white'
                      : 'bg-white border border-slate-200 text-text-muted hover:text-text-strong'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {tab === 'proceso' && (
          <div className="space-y-6">
            {mensajeFase(data.fase) && (
              <div
                className={`rounded-lg border px-4 py-3.5 flex items-start gap-2.5 ${
                  data.contratado
                    ? 'border-success-500/25 bg-success-50'
                    : 'border-slate-200 bg-white shadow-brand-card'
                }`}
              >
                <Sparkles
                  size={16}
                  strokeWidth={1.9}
                  className={`mt-0.5 shrink-0 ${data.contratado ? 'text-success-700' : 'text-brand-600'}`}
                />
                <p
                  className={`text-[13.5px] leading-[1.55] ${
                    data.contratado ? 'text-success-700' : 'text-text-body'
                  }`}
                >
                  {mensajeFase(data.fase)}
                </p>
              </div>
            )}
            <PortalStepper fase={data.fase} />
            <PortalCitaciones
              entrevista={data.citaciones.entrevista}
              examen={data.citaciones.examen}
              cargo={data.cargo_nombre}
            />
          </div>
        )}

        {tab === 'documentos' && (
          <div className="space-y-6">
            <PortalDocumentos token={token ?? ''} cedula={cedula} slots={data.slots} />
            <SubirDocumentos token={token ?? ''} cedula={cedula} iniciales={data.documentos} />
          </div>
        )}

        {tab === 'autorizaciones' && (
          <div className="space-y-6">
            <ConsentimientoCard
              tipo="datos"
              token={token ?? ''}
              empresa={empresa}
              empresaCodigo={data.empresa_codigo}
              cargo={data.cargo_nombre}
              nombreCompleto={data.candidato_nombre}
              documentoNumero={data.documento_numero}
              aceptado={data.consentimiento_datos_aceptado}
              onAceptar={(url, img) => aceptar('datos', url, img)}
            />
            <ConsentimientoCard
              tipo="imagen"
              token={token ?? ''}
              empresa={empresa}
              empresaCodigo={data.empresa_codigo}
              cargo={data.cargo_nombre}
              nombreCompleto={data.candidato_nombre}
              documentoNumero={data.documento_numero}
              aceptado={data.consentimiento_imagen_aceptado}
              onAceptar={(url, img) => aceptar('imagen', url, img)}
            />
            {/* Datos básicos (DGH-F-05) y Debida diligencia (SAGRILAFT F-CAR-01)
                ya NO se firman aquí con un layout inventado: se diligencian sobre
                el FORMATO OFICIAL y se suben firmados a la carpeta (servir+subir). */}
            {data.condiciones && (
              <CondicionesCard
                token={token ?? ''}
                condiciones={data.condiciones}
                aceptadas={data.condiciones_aceptadas}
              />
            )}
          </div>
        )}

        {tab === 'ayuda' && (
          <PortalAyuda analistaEmail={data.analista_email} cargo={data.cargo_nombre} />
        )}

        <PieEmpresa empresa={empresa} />
      </div>
    </div>
  );
}

function Encabezado() {
  return (
    <header className="flex items-center gap-3">
      <EquitelLogo size={44} />
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-semibold">
          Portal del integrante
        </p>
        <p className="text-[13px] text-text-muted">Organización Equitel</p>
      </div>
    </header>
  );
}

function PieEmpresa({ empresa }: { empresa: ReturnType<typeof empresaConsentimiento> }) {
  return (
    <footer className="pt-2 text-center text-[11px] text-text-subtle">
      {empresa.nombre} · NIT {empresa.nit} · Plataforma de Atracción
    </footer>
  );
}

/** Gate de cédula (F1) — 2º factor antes de mostrar cualquier dato. */
function CedulaGate({
  gate,
  onSubmit,
}: {
  gate: GateInfo;
  onSubmit: (cedula: string, captchaToken: string) => Promise<void>;
}) {
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [bloqueoActivo, setBloqueoActivo] = useState(gate.bloqueado);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetCaptcha, setResetCaptcha] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const captchaRequerido = !!TURNSTILE_SITE_KEY;

  useEffect(() => {
    setBloqueoActivo(gate.bloqueado);
  }, [gate]);

  const minutosBloqueo = Math.max(1, Math.ceil(gate.bloqueado_segundos / 60));

  async function enviar() {
    const limpio = valor.replace(/\D/g, '');
    if (!limpio || enviando || bloqueoActivo) return;
    if (captchaRequerido && !captchaToken) return;
    setEnviando(true);
    try {
      await onSubmit(limpio, captchaToken ?? '');
    } finally {
      setEnviando(false);
      // El token de Turnstile es de un solo uso: pide uno fresco para el próximo intento.
      if (captchaRequerido) {
        setCaptchaToken(null);
        setResetCaptcha((n) => n + 1);
      }
    }
  }

  // Caso especial: el token aún no tiene cédula registrada → portal en preparación.
  if (gate.sin_cedula_registrada) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <header className="flex flex-col items-center text-center mb-7">
            <EquitelLogo size={48} />
            <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-text-subtle font-semibold">
              Portal del integrante
            </p>
          </header>
          <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card px-6 py-7 text-center">
            <Loader2 size={20} className="mx-auto text-brand-600" />
            <h1 className="mt-3 text-[16px] font-semibold text-text-strong">
              Estamos preparando tu portal
            </h1>
            <p className="mt-2 text-[13px] text-text-muted leading-[1.55]">
              Aún estamos terminando de registrar tus datos. Vuelve a abrir este enlace más tarde, o
              responde el correo con el que lo recibiste y con gusto te ayudamos.
            </p>
          </section>
        </div>
      </div>
    );
  }

  const error = bloqueoActivo
    ? `Demasiados intentos. Espera unos ${minutosBloqueo} minuto${
        minutosBloqueo === 1 ? '' : 's'
      } e inténtalo de nuevo.`
    : gate.captcha_fallido
      ? 'No pudimos verificar que no eres un robot. Vuelve a marcar la casilla e inténtalo de nuevo.'
      : gate.cedula_incorrecta
        ? `El número no coincide.${
            gate.intentos_restantes > 0
              ? ` Te queda${gate.intentos_restantes === 1 ? '' : 'n'} ${gate.intentos_restantes} intento${
                  gate.intentos_restantes === 1 ? '' : 's'
                }.`
              : ''
          }`
        : undefined;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <header className="flex flex-col items-center text-center mb-7">
          <EquitelLogo size={48} />
          <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-text-subtle font-semibold">
            Portal del integrante
          </p>
        </header>
        <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card px-6 py-7">
          <div className="flex items-center gap-2 text-text-strong">
            <Lock size={17} strokeWidth={1.9} className="text-brand-600" />
            <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Verifica tu identidad</h1>
          </div>
          <p className="mt-2 text-[13px] text-text-muted leading-[1.55]">
            Para proteger tu información, ingresa tu número de cédula (sin puntos ni espacios).
          </p>
          <div className="mt-4">
            <Input
              ref={inputRef}
              name="cedula"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Tu número de cédula"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void enviar();
              }}
              error={error}
              disabled={enviando || bloqueoActivo}
            />
          </div>
          {captchaRequerido && (
            <div className="mt-4 flex justify-center">
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                onToken={setCaptchaToken}
                resetTrigger={resetCaptcha}
              />
            </div>
          )}
          <div className="mt-4">
            <Button
              onClick={enviar}
              disabled={
                !valor.replace(/\D/g, '') ||
                enviando ||
                bloqueoActivo ||
                (captchaRequerido && !captchaToken)
              }
              loading={enviando}
              variant="brand-primary"
              fullWidth
            >
              {enviando ? 'Verificando…' : 'Ingresar'}
            </Button>
          </div>
        </section>
        <p className="mt-4 text-center text-[12px] text-text-subtle">
          ¿Problemas para ingresar? Responde el correo con el que recibiste este link.
        </p>
      </div>
    </div>
  );
}

function ConsentimientoCard({
  tipo,
  token,
  empresa,
  empresaCodigo,
  cargo,
  nombreCompleto,
  documentoNumero,
  aceptado,
  onAceptar,
}: {
  tipo: 'datos' | 'imagen';
  token: string;
  empresa: ReturnType<typeof empresaConsentimiento>;
  empresaCodigo: string;
  cargo: string;
  nombreCompleto: string;
  documentoNumero: string;
  aceptado: boolean;
  onAceptar: (firmaUrl: string, firmaImagenUrl: string) => Promise<void>;
}) {
  const [chk, setChk] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmar() {
    if (!firma || !token) return;
    setEnviando(true);
    setErr(null);
    try {
      const ts = Date.now();
      // Estampa los datos + la firma sobre el PDF OFICIAL de la empresa (Calidad),
      // sin alterar el layout — reemplaza la "constancia" inventada.
      const blob = await estamparFormatoOficial(
        tipo,
        empresaCodigo,
        {
          nombre: nombreCompleto || 'Candidato',
          cedula: documentoNumero || '',
          cargo: cargo || '',
          fechaTexto: new Date().toLocaleDateString('es-CO'),
        },
        firma,
      );
      const r = storageRef(storage, `portal_docs/${token}/firma_${tipo}_${ts}.pdf`);
      await uploadBytes(r, blob, { contentType: 'application/pdf' });
      const url = await getDownloadURL(r);
      // Imagen de la firma (PNG) para incrustarla en el documento del staff.
      const imgBlob = await (await fetch(firma)).blob();
      const ri = storageRef(storage, `portal_docs/${token}/firma_img_${tipo}_${ts}.png`);
      await uploadBytes(ri, imgBlob, { contentType: 'image/png' });
      const imgUrl = await getDownloadURL(ri);
      await onAceptar(url, imgUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar. Reintenta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
            {tituloConsentimiento(tipo)}
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">Ley 1581 de 2012 · Decreto 1377 de 2013</p>
        </div>
        {aceptado && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success-700 bg-success-50 border border-success-500/25 rounded-full px-2.5 py-1">
            <Check size={13} strokeWidth={2} />
            Aceptado
          </span>
        )}
      </div>

      <div className="px-5 sm:px-7 py-5 text-[13px] leading-relaxed text-text-strong max-h-[340px] overflow-y-auto">
        <CuerpoConsentimiento
          tipo={tipo}
          empresa={empresa}
          nombreCompleto={nombreCompleto}
          documentoNumero={documentoNumero}
          documentoCiudad=""
        />
      </div>

      {!aceptado && (
        <div className="px-5 sm:px-7 py-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={chk}
              onChange={(e) => setChk(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-[13px] text-text-body leading-[1.5]">
              He leído y <strong>acepto</strong> este documento.
            </span>
          </label>
          <div>
            <p className="text-[12px] font-medium text-text-body mb-1">Tu firma</p>
            <FirmaInput onChange={setFirma} />
          </div>
          {err && <p className="text-[12px] text-danger-700">{err}</p>}
          <Button
            onClick={confirmar}
            disabled={!chk || !firma || enviando}
            loading={enviando}
            variant="brand-primary"
            icon={<Check size={14} strokeWidth={2} />}
          >
            {enviando ? 'Firmando…' : 'Aceptar y firmar'}
          </Button>
        </div>
      )}
    </section>
  );
}

function CondicionesCard({
  token,
  condiciones,
  aceptadas,
}: {
  token: string;
  condiciones: Record<string, string>;
  aceptadas: boolean;
}) {
  const [aceptado, setAceptado] = useState(aceptadas);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filas: [string, string][] = (
    [
      ['Cargo', condiciones.cargo],
      ['Empresa', condiciones.empresa],
      ['Unidad', condiciones.unidad],
      ['Sede', condiciones.sede],
      ['Salario', condiciones.salario],
      ['Comisiones', condiciones.comisiones],
      ['Rodamiento', condiciones.rodamiento],
      ['Horario', condiciones.horario],
      ['Tipo de contrato', condiciones.tipo_contrato],
    ] as [string, string | undefined][]
  )
    .filter((f): f is [string, string] => !!f[1])
    .map((f) => f);

  async function aceptar() {
    if (!token) return;
    setEnviando(true);
    setErr(null);
    try {
      const fn = httpsCallable<{ token: string }, { ok: true }>(
        functions,
        'aceptarCondicionesLaborales',
      );
      await fn({ token });
      setAceptado(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar. Reintenta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
            Condiciones laborales
          </h2>
          <p className="text-[12px] text-text-muted mt-0.5">Revisa tus condiciones y acéptalas.</p>
        </div>
        {aceptado && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success-700 bg-success-50 border border-success-500/25 rounded-full px-2.5 py-1">
            <Check size={13} strokeWidth={2} />
            Aceptadas
          </span>
        )}
      </div>
      <div className="px-5 sm:px-7 py-5 space-y-3">
        <dl className="space-y-2">
          {filas.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-2 text-[13px]">
              <dt className="font-medium text-text-muted">{k}</dt>
              <dd className="text-text-strong break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {!aceptado && (
          <>
            {err && <p className="text-[12px] text-danger-700">{err}</p>}
            <Button
              onClick={aceptar}
              disabled={enviando}
              loading={enviando}
              variant="brand-primary"
              icon={<Check size={14} strokeWidth={2} />}
            >
              {enviando ? 'Registrando…' : 'Acepto las condiciones'}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}

/** Subida libre de "otros documentos" → documentos_portal (catch-all opcional). */
function SubirDocumentos({
  token,
  cedula,
  iniciales,
}: {
  token: string;
  cedula: string;
  iniciales: { nombre: string; url: string }[];
}) {
  const [docs, setDocs] = useState(iniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr('El archivo supera 10 MB. Comprímelo o súbelo en partes.');
      return;
    }
    setSubiendo(true);
    setErr(null);
    try {
      const ts = Date.now();
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const r = storageRef(storage, `portal_docs/${token}/${ts}_${safe}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const fn = httpsCallable<
        { token: string; cedula: string; nombre_archivo: string; url: string },
        { ok: true }
      >(functions, 'registrarDocumentoPortal');
      await fn({ token, cedula, nombre_archivo: file.name, url });
      setDocs((prev) => [...prev, { nombre: file.name, url }]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo subir el archivo. Reintenta.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
          Otros documentos
        </h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          ¿Te pidieron algo que no está en las casillas de arriba? Súbelo aquí (PDF o foto legible).
        </p>
      </div>
      <div className="px-5 sm:px-7 py-5 space-y-3">
        {docs.length > 0 && (
          <ul className="space-y-1.5">
            {docs.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-text-body">
                <FileText size={13} strokeWidth={1.75} className="text-text-subtle shrink-0" />
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-700 hover:underline truncate"
                >
                  {d.nombre}
                </a>
                <span className="text-[11px] text-text-subtle shrink-0">· enviado</span>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="text-[12px] text-danger-700">{err}</p>}
        <label
          className={`inline-flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-medium cursor-pointer hover:bg-slate-50 ${
            subiendo ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          {subiendo ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} strokeWidth={1.75} />
          )}
          {subiendo ? 'Subiendo…' : 'Subir un documento'}
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={onFile}
            className="hidden"
            disabled={subiendo}
          />
        </label>
      </div>
    </section>
  );
}
