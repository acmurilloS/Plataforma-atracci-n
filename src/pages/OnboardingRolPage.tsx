import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Briefcase, ClipboardList, type LucideIcon } from 'lucide-react';
import { auth, functions } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/brand';
import { EquitelLogo } from '../components/EquitelLogo';
import { cn } from '../utils/cn';

/**
 * OnboardingRolPage · primer ingreso (sin rol).
 *
 * Al montar consulta `autoasignarRol`: si el correo fue PRE-ASIGNADO por el staff
 * (p.ej. GH), se aplica ese rol solo y entra directo. Si no, muestra la selección
 * de AUTOSERVICIO, que solo permite `lider` o `analista`. Los roles sensibles
 * (gh, coordinador, apoyo, admin) NO se ofrecen aquí — los asigna el staff.
 */

interface OpcionRol {
  rol: 'lider' | 'analista';
  titulo: string;
  descripcion: string;
  icono: LucideIcon;
}

const ROLES: OpcionRol[] = [
  {
    rol: 'analista',
    titulo: 'Analista de atracción',
    descripcion: 'Llevo los procesos: reclutamiento, entrevistas, referencias y terna.',
    icono: ClipboardList,
  },
  {
    rol: 'lider',
    titulo: 'Líder de área',
    descripcion: 'Solicito vacantes de mi equipo y decido en las entrevistas.',
    icono: Briefcase,
  },
];

export default function OnboardingRolPage() {
  const { user } = useAuth();
  const [rol, setRol] = useState<OpcionRol['rol'] | ''>('');
  const [guardando, setGuardando] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [error, setError] = useState('');
  const yaVerifico = useRef(false);

  const primerNombre = (user?.displayName ?? '').split(/\s+/)[0] || '';

  // Al montar: ¿este correo tiene un rol PRE-ASIGNADO por el staff (p.ej. GH)?
  // Si sí, se aplica solo y entra directo; si no, se muestra la selección.
  useEffect(() => {
    if (yaVerifico.current) return;
    yaVerifico.current = true;
    (async () => {
      try {
        const fn = httpsCallable(functions, 'autoasignarRol');
        const res = (await fn({})) as { data?: { rol?: string } };
        if (res.data?.rol) {
          await auth.currentUser?.getIdToken(true);
          window.location.reload();
          return;
        }
        setVerificando(false);
      } catch {
        // Si algo falla (p.ej. ya tenía rol), mostramos la selección igualmente.
        setVerificando(false);
      }
    })();
  }, []);

  async function continuar() {
    if (!rol) return;
    setError('');
    setGuardando(true);
    try {
      const fn = httpsCallable(functions, 'autoasignarRol');
      await fn({ rol });
      // Refrescar el token para que el nuevo claim (rol) surta efecto en las
      // reglas Firestore, y recargar para entrar ya con el perfil.
      await auth.currentUser?.getIdToken(true);
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar tu rol. Intenta de nuevo.';
      setError(msg.replace(/^.*?:\s*/, ''));
      setGuardando(false);
    }
  }

  if (verificando) {
    return (
      <div className="brand-page font-brand min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <EquitelLogo size={30} />
          <p className="text-[13px]">Preparando tu acceso…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-page font-brand min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="flex justify-center mb-8">
          <EquitelLogo size={34} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-brand-card p-6 sm:p-8">
          <h1 className="text-[26px] font-light tracking-[-0.02em] text-text-strong">
            {primerNombre ? `Hola, ${primerNombre} 👋` : 'Hola 👋'}
          </h1>
          <p className="mt-2 text-[14px] text-text-muted leading-[1.55]">
            Para mostrarte tu espacio, cuéntanos cuál es tu rol en el proceso de atracción.
          </p>

          <div className="mt-6 space-y-2.5">
            {ROLES.map((o) => {
              const Icono = o.icono;
              const activo = rol === o.rol;
              return (
                <button
                  key={o.rol}
                  type="button"
                  onClick={() => setRol(o.rol)}
                  className={cn(
                    'w-full text-left rounded-xl border p-3.5 flex items-start gap-3 transition-colors',
                    'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                    activo
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-300'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      activo ? 'bg-brand-600 text-white' : 'bg-slate-100 text-text-muted',
                    )}
                  >
                    <Icono size={18} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-text-strong">
                      {o.titulo}
                    </span>
                    <span className="block text-[12.5px] text-text-muted leading-[1.45] mt-0.5">
                      {o.descripcion}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {error && <p className="mt-4 text-[12.5px] text-danger-700">{error}</p>}

          <div className="mt-6">
            <Button
              variant="brand-primary"
              size="large"
              fullWidth
              onClick={continuar}
              disabled={rol === ''}
              loading={guardando}
            >
              Continuar
            </Button>
            <p className="mt-3 text-[11.5px] text-text-subtle text-center leading-[1.5]">
              ¿Eres de Gestión Humana, coordinación o un área de apoyo? Tu perfil lo crea el equipo;
              escríbele a tu contacto para que te habilite.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
