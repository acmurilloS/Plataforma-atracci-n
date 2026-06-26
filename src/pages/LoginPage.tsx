import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button, GlassPanel, Input } from '../components/brand';

/**
 * LoginPage · sistema brand (Apple-store light + glass minimal + accent corporativo).
 *
 * Layout: split 52/48 en desktop, stack vertical en mobile.
 *
 * Card derecho (glass) replica el portal Doge:
 *   - "Bienvenido" + dominio corporativo highlighted
 *   - CTA Google full-width (brand)
 *   - Separador discreto
 *   - Inputs corporativos (Correo + Contraseña)
 *   - CTA "Iniciar sesión"
 *   - Links secundarios (olvidaste contraseña, registro vía mailto)
 *   - Footer card con badge "Acceso restringido"
 *   - Help line · Powered by Doge
 */

const VALUE_PROPS = [
  {
    n: '01',
    titulo: 'Trazabilidad',
    detalle: 'Cada vacante, cada integrante, cada decisión auditada en línea.',
  },
  {
    n: '02',
    titulo: 'Tiempo a la mitad',
    detalle: 'De 15 a 10 días hábiles cubriendo cualquier perfil del holding.',
  },
  {
    n: '03',
    titulo: 'Ingreso día 1',
    detalle: 'Accesos, equipo y dotación listos cuando la persona empieza.',
  },
];

function mensajeAuth(e: unknown): string {
  if (typeof e === 'object' && e && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    const mapa: Record<string, string> = {
      'auth/invalid-credential': 'Correo o contraseña inválidos.',
      'auth/invalid-email': 'Correo inválido.',
      'auth/user-disabled': 'Usuario deshabilitado.',
      'auth/user-not-found': 'Usuario no existe.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
      'auth/network-request-failed': 'Sin conexión.',
      'auth/popup-closed-by-user': 'Cerraste el popup antes de completar el ingreso.',
      'auth/popup-blocked': 'Tu navegador bloqueó el popup de Google.',
      'auth/missing-email': 'Escribe primero tu correo para enviar el reset.',
    };
    return mapa[code] ?? `No pudimos iniciar sesión (${code}).`;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'No pudimos iniciar sesión.';
}

// Logo "G" oficial de Google (multicolor) inline para no depender de assets.
function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { user, iniciarSesion, iniciarSesionGoogle, enviarResetPassword, cargando } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: { pathname?: string } } };

  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState<'pwd' | 'google' | 'reset' | null>(null);

  if (!cargando && user) {
    const to = loc.state?.from?.pathname ?? '/seguimiento';
    return <Navigate to={to} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setAviso(null);
    setLoading('pwd');
    try {
      await iniciarSesion(email, pwd);
      nav(loc.state?.from?.pathname ?? '/seguimiento', { replace: true });
    } catch (e) {
      setErr(mensajeAuth(e));
    } finally {
      setLoading(null);
    }
  }

  async function onGoogle() {
    setErr(null);
    setAviso(null);
    setLoading('google');
    try {
      await iniciarSesionGoogle();
      nav(loc.state?.from?.pathname ?? '/seguimiento', { replace: true });
    } catch (e) {
      setErr(mensajeAuth(e));
    } finally {
      setLoading(null);
    }
  }

  async function onResetPassword() {
    setErr(null);
    setAviso(null);
    if (!email) {
      setErr('Escribe tu correo arriba antes de pedir el reset.');
      return;
    }
    setLoading('reset');
    try {
      await enviarResetPassword(email);
      setAviso(`Te enviamos un correo a ${email} con los pasos para restablecer la contraseña.`);
    } catch (e) {
      setErr(mensajeAuth(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="brand-page relative min-h-screen overflow-hidden font-brand">
      {/* Ambient glows brand (decorativos, 6% opacidad) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(190,30,13,0.10) 0%, rgba(190,30,13,0) 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -right-32 w-[520px] h-[520px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(212,56,37,0.08) 0%, rgba(212,56,37,0) 70%)',
          filter: 'blur(100px)',
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[52fr_48fr] min-h-screen">
        {/* ─── Panel izquierdo · hero tipográfico ─────────────────────── */}
        <aside className="relative hidden lg:flex flex-col justify-between px-20 py-16 overflow-hidden">
          {/* Steve watermark — faded, decorativo, detrás del contenido */}
          <img
            src="/steve.png"
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none select-none absolute"
            style={{
              right: '-60px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '680px',
              opacity: 0.08,
              zIndex: 0,
            }}
          />

          <div className="relative z-10 flex items-center gap-3">
            <img
              src="/equitel.png"
              alt="Equitel"
              className="h-16 w-auto object-contain"
              draggable={false}
            />
            <div className="border-l border-slate-200 pl-3">
              <p className="text-[15px] font-semibold text-text-strong leading-tight">
                Plataforma de Atracción
              </p>
              <p className="text-[11px] text-text-subtle tracking-[0.02em] leading-tight">
                Atracción de talento · holding Equitel
              </p>
            </div>
          </div>

          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 brand-glass rounded-full px-3 py-1.5 shadow-brand-card">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-brand-700">
                Portal interno
              </span>
            </div>

            <h1
              className="mt-7 text-[64px] font-light leading-[1.02] tracking-[-0.045em] text-text-strong"
              style={{ textWrap: 'balance' }}
            >
              Cada vacante.
              <br />
              Cada integrante.
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(120deg, #D43825 0%, #BE1E0D 50%, #7A1605 100%)',
                }}
              >
                En un solo flujo.
              </span>
            </h1>

            <p className="mt-7 text-[16px] text-text-muted leading-[1.55] max-w-md">
              Orquestamos los 20 pasos del proceso de atracción del holding —
              desde la solicitud del líder hasta el ingreso del integrante — con
              trazabilidad por rol, ANS por etapa y disparadores automáticos a
              IT, compras y talentos.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-8 max-w-2xl">
            {VALUE_PROPS.map((vp) => (
              <div key={vp.n} className="border-t border-slate-200 pt-4">
                <p className="text-[11px] font-bold tracking-[0.10em] uppercase text-brand-700">
                  {vp.n}
                </p>
                <p className="text-[14px] font-medium text-text-strong mt-2">{vp.titulo}</p>
                <p className="text-[11px] text-text-subtle mt-1 leading-[1.5]">{vp.detalle}</p>
              </div>
            ))}
          </div>

          <p className="relative z-10 text-[11px] text-text-subtle">
            © {new Date().getFullYear()} Organización Equitel · Uso interno.
          </p>
        </aside>

        {/* ─── Panel derecho · glass card flotante (estilo Doge) ───── */}
        <main className="flex items-center justify-center px-6 py-12 lg:py-16">
          <GlassPanel
            tono="strong"
            radius="modal"
            className="w-full max-w-md p-10 shadow-brand-modal"
          >
            {/* Logo mobile */}
            <div className="lg:hidden flex items-center justify-center mb-6">
              <img src="/equitel.png" alt="Equitel" className="h-14 w-auto" />
            </div>

            <h2 className="text-[30px] font-medium tracking-[-0.02em] text-text-strong">
              Bienvenido
            </h2>
            <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
              Accede con tu cuenta{' '}
              <span className="font-semibold text-brand-700">@equitel.com.co</span>
            </p>

            {/* CTA Google */}
            <button
              type="button"
              onClick={onGoogle}
              disabled={loading !== null}
              className="mt-6 w-full inline-flex items-center justify-center gap-2.5 h-11 rounded-md bg-brand-600 text-white font-medium text-sm shadow-brand-cta hover:bg-brand-500 active:bg-brand-700 disabled:bg-brand-200 disabled:shadow-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="bg-white rounded-full p-0.5 flex items-center justify-center">
                <GoogleLogo size={16} />
              </span>
              {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
            </button>

            {/* Separador discreto */}
            <div className="my-6 flex items-center gap-3 text-[11px] text-text-subtle uppercase tracking-[0.12em]">
              <div className="flex-1 h-px bg-slate-200" />
              <span>o</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Form correo/contraseña */}
            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                label="Correo corporativo"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail size={16} strokeWidth={1.5} />}
                placeholder="tu.nombre@equitel.com.co"
              />
              <Input
                label="Contraseña"
                type="password"
                required
                autoComplete="current-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                icon={<Lock size={16} strokeWidth={1.5} />}
                placeholder="••••••••"
              />

              {err && (
                <div className="rounded-md bg-danger-50 border border-danger-100 px-3.5 py-2.5 text-[13px] text-danger-700">
                  {err}
                </div>
              )}
              {aviso && (
                <div className="rounded-md bg-success-50 border border-success-500/20 px-3.5 py-2.5 text-[13px] text-success-700">
                  {aviso}
                </div>
              )}

              <Button
                type="submit"
                variant="brand-primary"
                size="large"
                loading={loading === 'pwd'}
                disabled={loading !== null}
                fullWidth
                className="!h-11"
              >
                {loading === 'pwd' ? 'Ingresando…' : 'Iniciar sesión'}
              </Button>
            </form>

            {/* Links secundarios */}
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onResetPassword}
                disabled={loading !== null}
                className="text-[13px] font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2 disabled:opacity-50"
              >
                {loading === 'reset' ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
              </button>
              <a
                href="mailto:sistemas@equitel.com.co?subject=Solicitud%20de%20acceso%20a%20Plataforma%20de%20Atracci%C3%B3n&body=Hola%20Sistemas%2C%20quisiera%20solicitar%20acceso%20a%20la%20Plataforma%20de%20Atracci%C3%B3n.%0A%0ANombre%3A%20%0ACargo%3A%20%0AEmpresa%2Fsede%3A%20"
                className="text-[13px] font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2"
              >
                ¿No tienes cuenta? Solicita acceso
              </a>
            </div>

            {/* Footer acceso restringido */}
            <div className="mt-7 flex justify-center">
              <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
                <ShieldCheck size={13} strokeWidth={1.75} className="text-slate-600" />
                <span className="text-[11px] font-medium text-slate-600">
                  Acceso restringido · Solo cuentas corporativas
                </span>
              </div>
            </div>

            {/* Help line + Powered by Doge */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-3">
              <p className="text-[11px] text-text-muted text-center">
                ¿Problemas para ingresar? Contacta a{' '}
                <a
                  href="mailto:sistemas@equitel.com.co"
                  className="font-semibold text-text-strong hover:text-brand-700"
                >
                  Sistemas
                </a>
              </p>
              <a
                href="https://doge.ai"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-subtle">
                  Powered by
                </span>
                <img src="/steve.png" alt="Doge" className="h-4 w-auto opacity-90" />
                <span className="text-[11px] font-semibold text-text-body">Doge</span>
              </a>
            </div>
          </GlassPanel>
        </main>
      </div>
    </div>
  );
}
