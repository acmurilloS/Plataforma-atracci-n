import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  ArrowUpRight,
  Database,
  ExternalLink as ExtIcon,
  Files,
  HardDrive,
  LayoutGrid,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * PanelAdminPage · sistema brand.
 *
 * Hub central de admin: cambio de rol express (solo emulador), navegación
 * a todas las vistas, accesos directos al emulador y credenciales de prueba.
 */

const USUARIOS_PRUEBA = [
  {
    email: 'admin@equitel.test',
    password: 'Admin1234!',
    rol: 'admin',
    nombre: 'Admin Plataforma',
    descripcion: 'Ve todo, edita catálogos, corre seed.',
  },
  {
    email: 'lider@equitel.test',
    password: 'Lider1234!',
    rol: 'lider',
    nombre: 'Juan Carlos Pineda',
    descripcion: 'Crea vacantes para su unidad.',
  },
  {
    email: 'coordinador@equitel.test',
    password: 'Coord1234!',
    rol: 'coordinador',
    nombre: 'Karen Bonilla',
    descripcion: 'Asigna procesos, supervisa ANS global.',
  },
  {
    email: 'analista@equitel.test',
    password: 'Anal1234!',
    rol: 'analista',
    nombre: 'Génesis Analista',
    descripcion: 'Perfila, publica, recluta, pre-entrevista.',
  },
  {
    email: 'gh@equitel.test',
    password: 'GH1234!',
    rol: 'gh',
    nombre: 'Maribel González',
    descripcion: 'Valida salarios fuera de banda, exámenes, contratación.',
  },
];

const ROL_TONO: Record<string, PillTono> = {
  admin: 'danger',
  lider: 'brand',
  coordinador: 'info',
  analista: 'warning',
  gh: 'success',
};

export default function PanelAdminPage() {
  const { perfil } = useAuth();
  const nav = useNavigate();
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const esEmulador = import.meta.env.VITE_USE_EMULATORS === 'true';

  async function entrarComo(email: string, password: string, rol: string) {
    setCambiando(email);
    setErr(null);
    setOk(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setOk(`Sesión abierta como ${email} (rol ${rol}).`);
      const destino = rol === 'lider' ? '/vacantes/nueva' : '/vacantes';
      setTimeout(() => nav(destino, { replace: true }), 300);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cambiar de usuario.');
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Admin
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Panel de admin
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Hub central para navegar todas las vistas sin hacer logout/login. Cambia de rol con un
          click, accede al emulador o copia credenciales para abrir en otra ventana.
        </p>
      </div>

      {/* Cambiar usuario */}
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <Users size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.012em] text-text-strong">
                Cambiar usuario activo
              </h2>
              <p className="text-[13px] text-text-muted mt-0.5">
                Click en <span className="font-semibold text-text-body">Entrar como</span> cambia
                la sesión sin formulario. Solo funciona en emulador.
              </p>
            </div>
          </div>
          {!esEmulador && (
            <Pill tono="warning" dot>
              Deshabilitado en producción
            </Pill>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-slate-100">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Nombre
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Email
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Rol
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Qué hace
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {USUARIOS_PRUEBA.map((u) => {
                const activo = perfil?.email === u.email;
                return (
                  <tr
                    key={u.email}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-text-strong font-medium">{u.nombre}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tono={ROL_TONO[u.rol] ?? 'neutral'}>{u.rol}</Pill>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-body">{u.descripcion}</td>
                    <td className="px-4 py-3 text-right">
                      {activo ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-success-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
                          Activo
                        </span>
                      ) : (
                        <Button
                          variant="neutral-secondary"
                          size="small"
                          onClick={() => entrarComo(u.email, u.password, u.rol)}
                          disabled={!esEmulador || cambiando != null}
                          loading={cambiando === u.email}
                        >
                          {cambiando === u.email ? 'Entrando…' : 'Entrar como'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {err && (
          <div className="mt-4 rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
            {err}
          </div>
        )}
        {ok && (
          <div className="mt-4 rounded-md border border-success-500/20 bg-success-50 px-3.5 py-2.5 text-[13px] text-success-700">
            {ok}
          </div>
        )}
      </Card>

      {/* Vistas disponibles */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Vistas disponibles
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <LinkCard
            to="/vacantes/nueva"
            titulo="Nueva solicitud de vacante"
            descripcion="Flujo del líder · pasos 1-2 del flujograma."
            badge="líder"
            tono="brand"
          />
          <LinkCard
            to="/vacantes"
            titulo="Lista de vacantes"
            descripcion="Tablero de coordinación con filtros por estado y empresa."
            badge="coord / gh"
            tono="info"
          />
          <LinkCard
            to="/dashboard"
            titulo="Dashboard coordinación"
            descripcion="Hero numbers + distribuciones por estado, criticidad y empresa."
            badge="coord"
            tono="info"
          />
          <LinkCard
            to="/seguimiento"
            titulo="Seguimiento"
            descripcion="Vista cross-vacante con ANS y semáforos por etapa."
            badge="coord"
            tono="info"
          />
          <LinkCard
            to="/pool"
            titulo="Pool de candidatos"
            descripcion="Base cross-vacante para reciclar talento."
            badge="analista"
            tono="warning"
          />
          <LinkCard
            to="/admin/catalogos"
            titulo="Catálogos"
            descripcion="Empresas, sedes, unidades, cargos y seed inicial."
            badge="admin"
            tono="danger"
          />
        </div>
      </div>

      {/* Emulador Firebase */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Database size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Emulador Firebase
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <EmulatorLink
            href="http://127.0.0.1:4000/"
            label="Hub"
            hint="Overview general"
            icono={<LayoutGrid size={16} strokeWidth={1.75} />}
          />
          <EmulatorLink
            href="http://127.0.0.1:4000/firestore"
            label="Firestore"
            hint="Colecciones y docs"
            icono={<Database size={16} strokeWidth={1.75} />}
          />
          <EmulatorLink
            href="http://127.0.0.1:4000/auth"
            label="Auth"
            hint="Usuarios + claims"
            icono={<ShieldCheck size={16} strokeWidth={1.75} />}
          />
          <EmulatorLink
            href="http://127.0.0.1:4000/functions"
            label="Functions"
            hint="Logs en vivo"
            icono={<Zap size={16} strokeWidth={1.75} />}
          />
          <EmulatorLink
            href="http://127.0.0.1:4000/storage"
            label="Storage"
            hint="PDFs de aval"
            icono={<HardDrive size={16} strokeWidth={1.75} />}
          />
        </div>
      </div>

      {/* Credenciales */}
      <Card padding="lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-md bg-slate-100 text-text-muted flex items-center justify-center shrink-0">
            <Files size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.012em] text-text-strong">
              Credenciales de prueba
            </h2>
            <p className="text-[13px] text-text-muted mt-0.5">
              Por si necesitas loguear en otra pestaña o ventana.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-4 space-y-1.5 font-mono text-[12px] text-text-body">
          {USUARIOS_PRUEBA.map((u) => (
            <div key={u.email} className="flex items-center gap-3">
              <span className="text-text-subtle w-24 shrink-0">{u.rol}</span>
              <span className="text-text-strong">{u.email}</span>
              <span className="text-text-subtle">/</span>
              <span className="text-brand-700">{u.password}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function LinkCard({
  to,
  titulo,
  descripcion,
  badge,
  tono = 'brand',
}: {
  to: string;
  titulo: string;
  descripcion: string;
  badge?: string;
  tono?: PillTono;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative rounded-md border border-slate-200 bg-white p-4 block',
        'hover:border-brand-300 hover:shadow-brand-card transition-all duration-200 ease-cult',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[14px] font-semibold text-text-strong group-hover:text-brand-700 transition-colors">
          {titulo}
        </p>
        <ArrowUpRight
          size={14}
          strokeWidth={1.75}
          className="text-text-subtle group-hover:text-brand-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
        />
      </div>
      <p className="text-[12px] text-text-muted leading-[1.5] mb-3">{descripcion}</p>
      {badge && <Pill tono={tono}>{badge}</Pill>}
    </Link>
  );
}

function EmulatorLink({
  href,
  label,
  hint,
  icono,
}: {
  href: string;
  label: string;
  hint: string;
  icono: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group rounded-md border border-slate-200 bg-white p-3.5 block',
        'hover:border-brand-300 hover:shadow-brand-card transition-all duration-200 ease-cult',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="w-8 h-8 rounded-md bg-slate-100 text-text-muted group-hover:bg-brand-50 group-hover:text-brand-700 flex items-center justify-center transition-colors">
          {icono}
        </div>
        <ExtIcon
          size={12}
          strokeWidth={1.75}
          className="text-text-subtle group-hover:text-brand-600 transition-colors"
        />
      </div>
      <p className="text-[13px] font-semibold text-text-strong group-hover:text-brand-700 transition-colors">
        {label}
      </p>
      <p className="text-[11px] text-text-muted mt-0.5">{hint}</p>
    </a>
  );
}

