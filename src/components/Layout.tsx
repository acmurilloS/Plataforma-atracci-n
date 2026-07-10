import { useState } from 'react';
import {
  BarChart3,
  Briefcase,
  FolderCheck,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Ticket,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import type { RolUsuario } from '../schemas';
import { Campanita } from './Campanita';
import { BannerActualizacion } from './BannerActualizacion';
import { BuscadorGlobal } from './BuscadorGlobal';

/**
 * Layout · sistema brand con BARRA LATERAL izquierda (reu 03-jul).
 *
 * Sidebar fijo con la navegación agrupada (filtrada por rol) + topbar delgada
 * con el título de la sección y el usuario. Cada perfil ve solo lo suyo; el
 * saludo personalizado del home lo pone `SaludoInicio` dentro de cada página.
 */

type Grupo = 'Proceso' | 'Administración';

interface ItemNav {
  to: string;
  label: string;
  icon: LucideIcon;
  grupo: Grupo;
  roles: RolUsuario[];
  end?: boolean;
}

const ITEMS: ItemNav[] = [
  // GH (rol 'gh') NO ve dashboard/seguimiento/vacantes (reu Karen 09-jul,
  // validado con Mari): don Diego no debe ver la gestión interna del equipo de
  // atracción ni procesos confidenciales. GH solo ve Aprobaciones, Carpetas y
  // Exámenes.
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3, grupo: 'Proceso', roles: ['coordinador', 'admin'] },
  { to: '/seguimiento', label: 'Seguimiento', icon: ListChecks, grupo: 'Proceso', roles: ['lider', 'analista', 'coordinador', 'apoyo', 'admin', 'talentos'] },
  { to: '/mis-vacantes', label: 'Mis vacantes', icon: Briefcase, grupo: 'Proceso', roles: ['lider'] },
  { to: '/vacantes/nueva', label: 'Nueva vacante', icon: PlusCircle, grupo: 'Proceso', roles: ['lider', 'coordinador', 'admin'] },
  {
    // Sin 'lider' (reu Karen 02-jul) ni 'gh' (reu 09-jul): solicitudes confidenciales.
    to: '/vacantes-abiertas',
    label: 'Vacantes abiertas',
    icon: FolderOpen,
    grupo: 'Proceso',
    roles: ['analista', 'coordinador', 'apoyo', 'admin', 'talentos'],
  },
  { to: '/pool', label: 'Pool', icon: Users, grupo: 'Proceso', roles: ['analista', 'coordinador', 'admin'] },
  { to: '/carpetas', label: 'Carpetas', icon: FolderCheck, grupo: 'Proceso', roles: ['gh', 'documentacion', 'analista', 'coordinador', 'admin'] },
  { to: '/aprobaciones-aval', label: 'Aprobaciones', icon: ShieldCheck, grupo: 'Proceso', roles: ['gh', 'coordinador', 'admin'] },
  { to: '/examenes-medicos', label: 'Exámenes', icon: Stethoscope, grupo: 'Proceso', roles: ['gh', 'gestor', 'analista', 'coordinador', 'admin'] },
  { to: '/tickets', label: 'Tickets', icon: Ticket, grupo: 'Proceso', roles: ['apoyo', 'analista', 'coordinador', 'admin'] },
  { to: '/admin', label: 'Panel admin', icon: LayoutGrid, grupo: 'Administración', roles: ['admin'], end: true },
  { to: '/admin/usuarios', label: 'Usuarios', icon: UserCog, grupo: 'Administración', roles: ['admin'] },
  { to: '/admin/catalogos', label: 'Catálogos', icon: SlidersHorizontal, grupo: 'Administración', roles: ['admin'] },
];

const GRUPOS: Grupo[] = ['Proceso', 'Administración'];

const ROL_NOMBRE: Record<string, string> = {
  admin: 'Administrador',
  coordinador: 'Coordinación',
  gh: 'Gestión Humana',
  analista: 'Analista',
  lider: 'Líder',
  talentos: 'Conexión de Talentos',
  apoyo: 'Apoyo',
  gestor: 'Gestor SST',
  documentacion: 'Documentación',
};

function itemClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150',
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-text-muted hover:bg-slate-50 hover:text-text-strong',
  );
}

export function Layout() {
  const { perfil, rol, cerrarSesion } = useAuth();
  const location = useLocation();
  const [abierto, setAbierto] = useState(false);

  const visibles = rol ? ITEMS.filter((i) => i.roles.includes(rol)) : [];
  const gruposVisibles = GRUPOS.map((g) => ({
    grupo: g,
    items: visibles.filter((i) => i.grupo === g),
  })).filter((g) => g.items.length > 0);

  const tituloActivo =
    ITEMS.find((i) => location.pathname === i.to)?.label ?? 'Plataforma de Atracción';
  const inicial = (perfil?.nombre || '?').charAt(0).toUpperCase();

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <Link
        to="/"
        onClick={() => setAbierto(false)}
        className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-slate-100 group"
      >
        <img src="/equitel.png" alt="Equitel" className="h-8 w-auto object-contain" draggable={false} />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-text-strong tracking-[-0.005em] group-hover:text-brand-700 transition-colors">
            Atracción
          </p>
          <p className="text-[9.5px] uppercase tracking-[0.08em] text-text-subtle">Holding Equitel</p>
        </div>
      </Link>

      {/* Buscador global (⌘K) */}
      <div className="px-2.5 pt-3">
        <BuscadorGlobal />
      </div>

      {/* Nav agrupada */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-4">
        {gruposVisibles.map(({ grupo, items }) => (
          <div key={grupo}>
            <p className="px-3 mb-1 text-[9.5px] font-bold uppercase tracking-[0.10em] text-text-subtle">
              {grupo}
            </p>
            <div className="space-y-0.5">
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  onClick={() => setAbierto(false)}
                  className={itemClass}
                >
                  <i.icon size={16} strokeWidth={1.75} className="shrink-0" />
                  {i.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Powered by Steve */}
      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-50 transition-colors">
          <img src="/steve.png" alt="Steve" className="h-9 w-9 object-contain shrink-0" draggable={false} />
          <div className="leading-tight">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-subtle">Powered by</p>
            <p className="text-[13px] font-semibold text-text-strong">Doge</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="brand-page font-brand min-h-screen flex">
      {/* Sidebar fijo (desktop) */}
      <aside className="print:hidden hidden md:flex md:flex-col w-64 shrink-0 border-r border-slate-200 bg-white sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Sidebar deslizable (móvil) */}
      {abierto && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setAbierto(false)} />
          <aside className="relative w-64 max-w-[82%] bg-white border-r border-slate-200 h-full shadow-xl">
            <button
              onClick={() => setAbierto(false)}
              className="absolute top-4 right-3 text-text-muted p-1"
              aria-label="Cerrar menú"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Columna principal */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <BannerActualizacion />
        <header className="print:hidden sticky top-0 z-40 brand-glass-strong border-b border-slate-200/60">
          <div className="px-5 md:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setAbierto(true)}
                className="md:hidden text-text-muted hover:text-text-strong p-1 -ml-1"
                aria-label="Abrir menú"
              >
                <Menu size={20} strokeWidth={1.75} />
              </button>
              <h2 className="text-[15px] font-semibold text-text-strong tracking-[-0.01em] truncate">
                {tituloActivo}
              </h2>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Campanita />
              <div className="flex items-center gap-2 pl-2.5 border-l border-slate-200/80">
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-[12.5px] font-medium text-text-strong">{perfil?.nombre}</p>
                  <p className="text-[10.5px] text-text-subtle">{ROL_NOMBRE[rol ?? ''] ?? rol}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[13px] font-semibold">
                  {inicial}
                </div>
                <button
                  onClick={() => cerrarSesion()}
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                  className="text-text-muted hover:text-text-strong transition-colors p-1.5 rounded-md hover:bg-slate-100"
                >
                  <LogOut size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
