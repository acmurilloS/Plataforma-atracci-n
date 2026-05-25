import { LogOut, Settings } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import type { RolUsuario } from '../schemas';
import { Campanita } from './Campanita';

/**
 * Layout · sistema brand (Apple-store light + glass minimal).
 *
 * Wrapper `brand-page` activa Inter + letter-spacing + foco brand + body
 * gradient para TODAS las páginas internas. El topbar es glass strong con
 * shadow layered. Nav links cambian a Inter + slate, con underline brand
 * en la ruta activa.
 */

interface ItemNav {
  to: string;
  label: string;
  roles: RolUsuario[];
  end?: boolean;
}

const ITEMS: ItemNav[] = [
  { to: '/seguimiento', label: 'Seguimiento', roles: ['lider', 'analista', 'coordinador', 'gh', 'apoyo', 'admin'] },
  { to: '/mis-vacantes', label: 'Mis vacantes', roles: ['lider'] },
  { to: '/vacantes/nueva', label: 'Nueva', roles: ['lider', 'coordinador', 'admin'] },
  { to: '/dashboard', label: 'Dashboard', roles: ['coordinador', 'admin'] },
  { to: '/aprobaciones-aval', label: 'Aprobaciones', roles: ['gh', 'coordinador', 'admin'] },
  { to: '/examenes-medicos', label: 'Exámenes', roles: ['gh', 'coordinador', 'admin'] },
  { to: '/carpetas', label: 'Carpetas', roles: ['gh', 'analista', 'coordinador', 'admin'] },
  { to: '/tickets', label: 'Tickets', roles: ['apoyo', 'analista', 'coordinador', 'admin'] },
  { to: '/pool', label: 'Pool', roles: ['analista', 'coordinador', 'admin'] },
  {
    to: '/vacantes-abiertas',
    label: 'Vacantes abiertas',
    roles: ['lider', 'analista', 'coordinador', 'gh', 'apoyo', 'admin'],
  },
  { to: '/admin/catalogos', label: 'Catálogos', roles: ['admin'] },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'relative text-[13px] font-medium whitespace-nowrap py-1.5',
    'transition-colors duration-150 ease-out',
    isActive
      ? 'text-text-strong after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-brand-600 after:rounded-full'
      : 'text-text-muted hover:text-text-strong',
  );
}

export function Layout() {
  const { perfil, rol, cerrarSesion } = useAuth();
  const visibles = rol ? ITEMS.filter((i) => i.roles.includes(rol)) : [];
  const esAdmin = rol === 'admin';

  return (
    <div className="brand-page font-brand min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 brand-glass-strong border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Logo + producto */}
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <img
              src="/equitel.png"
              alt="Equitel"
              className="h-9 w-auto object-contain"
              draggable={false}
            />
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <p className="text-[13px] font-semibold text-text-strong leading-tight tracking-[-0.005em] group-hover:text-brand-700 transition-colors">
                Plataforma de Atracción
              </p>
              <p className="text-[10px] text-text-subtle tracking-[0.02em] leading-tight uppercase">
                Holding Equitel
              </p>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-6 flex-wrap">
            {visibles.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={navLinkClass}>
                {i.label}
              </NavLink>
            ))}
            {esAdmin && (
              <NavLink
                to="/admin"
                end
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap py-1.5',
                    'transition-colors duration-150 ease-out',
                    isActive
                      ? 'text-text-strong after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-brand-600 after:rounded-full'
                      : 'text-text-muted hover:text-text-strong',
                  )
                }
              >
                <Settings size={13} strokeWidth={1.75} />
                Admin
              </NavLink>
            )}

            {/* Profile cluster */}
            <div className="flex items-center gap-3 pl-5 ml-1 border-l border-slate-200/80">
              <Campanita />
              <div className="hidden md:flex items-center gap-1.5 text-[12px]">
                <span className="font-medium text-text-strong">
                  {perfil?.nombre ?? ''}
                </span>
                <span className="text-text-subtle">·</span>
                <span className="text-text-muted capitalize">{rol ?? '—'}</span>
              </div>
              <button
                onClick={cerrarSesion}
                className="text-text-muted hover:text-text-strong transition-colors p-1 rounded-md hover:bg-slate-100"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut size={15} strokeWidth={1.75} />
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
