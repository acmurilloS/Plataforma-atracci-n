import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  Briefcase,
  Building2,
  ClipboardList,
  HeartHandshake,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { auth, functions } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/brand';
import { EquitelLogo } from '../components/EquitelLogo';
import { cn } from '../utils/cn';

/**
 * OnboardingRolPage · selección de rol en el PRIMER ingreso (autoservicio).
 *
 * Se muestra cuando el usuario entró con Google pero aún no tiene rol. Elige su
 * rol (todos menos admin; si es apoyo, también su área) → la callable
 * `autoasignarRol` setea el claim + crea su doc → se refresca el token y se
 * recarga para entrar ya con su perfil. Cambiar un rol asignado lo hace un admin.
 */

interface OpcionRol {
  rol: 'lider' | 'analista' | 'coordinador' | 'gh' | 'apoyo';
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
  {
    rol: 'coordinador',
    titulo: 'Coordinación de atracción',
    descripcion: 'Superviso el holding: dashboard, ANS y aprobaciones.',
    icono: Building2,
  },
  {
    rol: 'gh',
    titulo: 'Gestión Humana',
    descripcion: 'Valido avales, exámenes médicos y armo las carpetas de vinculación.',
    icono: HeartHandshake,
  },
  {
    rol: 'apoyo',
    titulo: 'Apoyo / áreas de servicio',
    descripcion: 'Atiendo los tickets de conexión de mi área.',
    icono: Wrench,
  },
];

const AREAS: { area: string; label: string }[] = [
  { area: 'it', label: 'Sistemas / IT' },
  { area: 'compras', label: 'Compras' },
  { area: 'bodega', label: 'Bodega' },
  { area: 'contabilidad', label: 'Contabilidad' },
  { area: 'administrativo', label: 'Administrativo' },
  { area: 'talentos', label: 'Conexión / Talentos' },
];

export default function OnboardingRolPage() {
  const { user } = useAuth();
  const [rol, setRol] = useState<OpcionRol['rol'] | ''>('');
  const [area, setArea] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const primerNombre = (user?.displayName ?? '').split(/\s+/)[0] || '';

  const puedeContinuar = rol !== '' && (rol !== 'apoyo' || area !== '');

  async function continuar() {
    if (!puedeContinuar) return;
    setError('');
    setGuardando(true);
    try {
      const fn = httpsCallable(functions, 'autoasignarRol');
      await fn({ rol, area_apoyo: rol === 'apoyo' ? area : undefined });
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
                  onClick={() => {
                    setRol(o.rol);
                    if (o.rol !== 'apoyo') setArea('');
                  }}
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

          {rol === 'apoyo' && (
            <div className="mt-4">
              <p className="text-[12px] font-medium text-text-muted mb-1.5">¿Cuál es tu área?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AREAS.map((a) => (
                  <button
                    key={a.area}
                    type="button"
                    onClick={() => setArea(a.area)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                      'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                      area === a.area
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-text-body hover:bg-slate-50',
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-[12.5px] text-danger-700">{error}</p>}

          <div className="mt-6">
            <Button
              variant="brand-primary"
              size="large"
              fullWidth
              onClick={continuar}
              disabled={!puedeContinuar}
              loading={guardando}
            >
              Continuar
            </Button>
            <p className="mt-3 text-[11.5px] text-text-subtle text-center leading-[1.5]">
              Si te equivocas de rol, un administrador podrá ajustarlo. El rol de administrador no
              se asigna por aquí.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
