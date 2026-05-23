import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { EquitelLogo } from '../components/EquitelLogo';
import { Button, Input } from '../components/ui';

const FEATURES = [
  'Solicitud de vacantes centralizada para 4 empresas',
  'Flujograma de 20 pasos trazable por vacante',
  'Dashboard en vivo por rol con ANS',
  'Landing pública de reclutamiento por cargo',
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
    };
    return mapa[code] ?? `No pudimos iniciar sesión (${code}).`;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'No pudimos iniciar sesión.';
}

export default function LoginPage() {
  const { user, iniciarSesion, cargando } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: { pathname?: string } } };

  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!cargando && user) {
    const to = loc.state?.from?.pathname ?? '/seguimiento';
    return <Navigate to={to} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await iniciarSesion(email, pwd);
      nav(loc.state?.from?.pathname ?? '/seguimiento', { replace: true });
    } catch (e) {
      setErr(mensajeAuth(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Panel izquierdo · brand */}
      <aside className="relative overflow-hidden bg-equitel-rojo-600 text-white flex flex-col justify-center px-10 lg:px-16 py-14">
        {/* Círculos decorativos inspirados en el brand book */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full border-[40px] border-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 bottom-10 h-72 w-72 rounded-full bg-white/10"
        />

        <div className="relative flex flex-col items-center text-center max-w-md mx-auto">
          <EquitelLogo size={160} />

          <h1 className="mt-8 font-display text-5xl font-bold leading-tight">
            Plataforma de Atracción
          </h1>
          <p className="mt-3 text-white/90 text-base leading-relaxed max-w-sm">
            Orquestamos el proceso completo de atracción de talento del holding Equitel.
          </p>

          <ul className="mt-10 space-y-4 text-left self-stretch max-w-sm mx-auto">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 h-5 w-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </span>
                <span className="text-white/95">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Panel derecho · login */}
      <main className="bg-white flex flex-col items-center justify-center px-8 py-14">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          <img
            src="/steve.png"
            alt="Steve · doge·ai"
            className="h-44 w-auto object-contain"
            draggable={false}
          />

          <p className="mt-6 text-2xl font-bold">
            <span className="text-navy-900">doge</span>
            <span className="text-navy-400"> · </span>
            <span className="text-emerald-500">ai</span>
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-navy-900">Bienvenido</h2>
          <p className="mt-2 text-sm text-navy-500 leading-relaxed">
            Accede con tu correo corporativo{' '}
            <span className="font-semibold text-navy-700">@equitel.com.co</span>
          </p>

          <form onSubmit={onSubmit} className="mt-8 w-full space-y-4 text-left">
            <Input
              label="Correo"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Contraseña"
              type="password"
              required
              autoComplete="current-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />

            {err && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {err}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" loading={loading} fullWidth>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>

          <p className="mt-6 text-xs text-navy-400">Acceso restringido al equipo Equitel</p>
        </div>
      </main>
    </div>
  );
}
