import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';

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

function LinkCard({
  to,
  titulo,
  descripcion,
  badge,
}: {
  to: string;
  titulo: string;
  descripcion: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-navy-100 bg-cream-50 p-4 hover:border-navy-400 transition block"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium text-navy-900">{titulo}</p>
        {badge && (
          <span className="rounded-full bg-gold-100 text-gold-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-navy-600 mt-1">{descripcion}</p>
    </Link>
  );
}

function ExternalLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-navy-100 bg-cream-50 px-3 py-2.5 text-sm text-navy-700 hover:border-navy-400 block"
    >
      <p className="font-medium">{label} ↗</p>
      <p className="text-xs text-navy-500 mt-0.5">{hint}</p>
    </a>
  );
}

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
      // Los líderes van al formulario, el resto al tablero.
      const destino = rol === 'lider' ? '/vacantes/nueva' : '/vacantes';
      setTimeout(() => nav(destino, { replace: true }), 300);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cambiar de usuario.');
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-equitel-rojo-700">
          Admin
        </p>
        <h1 className="font-display text-3xl font-bold text-navy-900 mt-1">Panel de admin</h1>
        <p className="text-sm text-navy-600 mt-1.5">
          Hub central para navegar por todas las vistas sin hacer logout/login. Cambia de rol con
          un click.
        </p>
      </div>

      <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-navy-900">
              Cambiar usuario activo
            </h2>
            <p className="text-sm text-navy-600 mt-1">
              Click en <span className="font-semibold">Entrar como</span> cambia la sesión sin
              formulario. Solo funciona en emulador.
            </p>
          </div>
          {!esEmulador && (
            <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-semibold">
              Deshabilitado en producción
            </span>
          )}
        </div>
        <div className="mt-4 rounded-md border border-navy-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Qué hace</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {USUARIOS_PRUEBA.map((u) => {
                const activo = perfil?.email === u.email;
                return (
                  <tr key={u.email} className="border-t border-navy-50">
                    <td className="px-4 py-2">{u.nombre}</td>
                    <td className="px-4 py-2 font-mono text-navy-600 text-xs">{u.email}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-xs">
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-navy-600">{u.descripcion}</td>
                    <td className="px-4 py-2 text-right">
                      {activo ? (
                        <span className="text-xs font-semibold text-emerald-700">● Activo</span>
                      ) : (
                        <button
                          onClick={() => entrarComo(u.email, u.password, u.rol)}
                          disabled={!esEmulador || cambiando != null}
                          className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-cream-100 disabled:opacity-50"
                        >
                          {cambiando === u.email ? 'Entrando…' : 'Entrar como'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        {ok && <p className="mt-3 text-sm text-emerald-700">{ok}</p>}
      </section>

      <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-navy-900">Vistas disponibles</h2>
        <p className="text-sm text-navy-600 mt-1">
          Todas las rutas de la plataforma. Puedes entrar aquí como admin sin cambiar de usuario.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <LinkCard
            to="/vacantes/nueva"
            titulo="Nueva solicitud de vacante"
            descripcion="Flujo del líder · pasos 1-2 del flujograma."
            badge="líder"
          />
          <LinkCard
            to="/vacantes"
            titulo="Lista de vacantes"
            descripcion="Tablero de coordinación con filtros por estado y empresa."
            badge="coord / gh"
          />
          <LinkCard
            to="/admin/catalogos"
            titulo="Catálogos"
            descripcion="Empresas, sedes, unidades, cargos y seed inicial."
            badge="admin"
          />
        </div>
      </section>

      <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-navy-900">
          Emulador Firebase (datos, auth, logs)
        </h2>
        <p className="text-sm text-navy-600 mt-1">
          Abre en pestaña aparte para inspeccionar datos directamente.
        </p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ExternalLink
            href="http://127.0.0.1:4000/"
            label="Hub"
            hint="Overview general del emulador."
          />
          <ExternalLink
            href="http://127.0.0.1:4000/firestore"
            label="Firestore"
            hint="Explora colecciones y documentos."
          />
          <ExternalLink
            href="http://127.0.0.1:4000/auth"
            label="Auth"
            hint="Usuarios de prueba + claims."
          />
          <ExternalLink
            href="http://127.0.0.1:4000/functions"
            label="Functions"
            hint="Logs en vivo de Cloud Functions."
          />
          <ExternalLink
            href="http://127.0.0.1:4000/storage"
            label="Storage"
            hint="PDFs de aval subidos."
          />
        </div>
      </section>

      <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-navy-900">
          Credenciales de prueba (emulador)
        </h2>
        <p className="text-sm text-navy-600 mt-1">
          Por si necesitas loguear en otra pestaña o ventana.
        </p>
        <div className="mt-3 rounded-md bg-cream-100 p-4 text-xs text-navy-800 space-y-1 font-mono">
          {USUARIOS_PRUEBA.map((u) => (
            <p key={u.email}>
              <span className="text-navy-500">{u.rol.padEnd(12)}</span> {u.email} / {u.password}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
