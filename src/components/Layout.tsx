import { LogOut, Settings } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import type { RolUsuario } from '../schemas';
import { EquitelLogo } from './EquitelLogo';

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
  { to: '/admin/catalogos', label: 'Catálogos', roles: ['admin'] },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'text-sm transition whitespace-nowrap',
    isActive ? 'text-navy-900 font-semibold' : 'text-navy-600 hover:text-navy-900',
  );
}

export function Layout() {
  const { perfil, rol, cerrarSesion } = useAuth();
  const visibles = rol ? ITEMS.filter((i) => i.roles.includes(rol)) : [];
  const esAdmin = rol === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-surface-low text-navy-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur shadow-ambient">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-5 shrink-0">
            <EquitelLogo size={32} />
            <span className="font-display text-sm font-bold text-navy-900 leading-tight tracking-tight">
              Plataforma<br />de Atracción
            </span>
          </Link>
          <nav className="flex items-center gap-5 flex-wrap">
            {visibles.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={linkClass}>
                {i.label}
              </NavLink>
            ))}
            {esAdmin && (
              <NavLink
                to="/admin"
                end
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 text-sm transition whitespace-nowrap',
                    isActive ? 'text-navy-900 font-semibold' : 'text-navy-600 hover:text-navy-900',
                  )
                }
              >
                <Settings size={14} />
                Panel admin
              </NavLink>
            )}
            <div className="flex items-center gap-3 pl-6 ml-2 text-sm">
              <span className="text-navy-700">
                {perfil?.nombre ?? ''} <span className="text-navy-400">· {rol ?? '—'}</span>
              </span>
              <button
                onClick={cerrarSesion}
                className="text-navy-500 hover:text-navy-800"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut size={16} />
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
