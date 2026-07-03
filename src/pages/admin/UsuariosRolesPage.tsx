import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, RefreshCw, Search, UserPlus, Users } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * UsuariosRolesPage · /admin/usuarios (admin).
 *
 * Gestión, permisos y trazabilidad de acceso (reu 03-jul): lista TODOS los
 * usuarios con su rol, área/empresa, estado y último login (de Auth); permite
 * cambiar el rol y ACTIVAR/DESACTIVAR la cuenta; y muestra los correos
 * pre-asignados que aún no han ingresado. Abajo, el formulario para pre-asignar
 * roles nuevos (gh / apoyo / talentos) por correo.
 */

interface UsuarioAdmin {
  uid: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  area_apoyo: string | null;
  empresa_codigo: string | null;
  activo: boolean;
  auth_deshabilitado: boolean;
  ultimo_login: string | null;
  creado_en: number | null;
  fuente_rol: string | null;
}
interface InvitadoAdmin {
  email: string;
  rol: string;
  area_apoyo: string | null;
  creado_en: number | null;
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  coordinador: 'Coordinación',
  gh: 'Gestión Humana',
  analista: 'Analista',
  lider: 'Líder',
  apoyo: 'Apoyo',
  talentos: 'Conexión de Talentos',
};
const ROLES_ASIGNABLES = ['admin', 'coordinador', 'gh', 'analista', 'lider', 'talentos'];

const SETEAR_ROL_URL = 'https://us-central1-ptm-atraccion.cloudfunctions.net/setearRolUsuario';

const controlClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

function haceTiempo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDistanceToNow(d, { locale: es, addSuffix: true });
}

type Tab = 'todos' | 'activos' | 'inactivos' | 'invitados';

export default function UsuariosRolesPage() {
  const { user } = useAuth();

  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [invitados, setInvitados] = useState<InvitadoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errCarga, setErrCarga] = useState('');
  const [accionUid, setAccionUid] = useState('');
  const [aviso, setAviso] = useState('');

  const [tab, setTab] = useState<Tab>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');

  // Formulario de pre-asignación (invitar rol nuevo por correo).
  const [rolPre, setRolPre] = useState<'gh' | 'talentos'>('gh');
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorPre, setErrorPre] = useState('');
  const [resultadoPre, setResultadoPre] = useState<{
    creados: number;
    invalidos: string[];
  } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrCarga('');
    try {
      const fn = httpsCallable(functions, 'listarUsuariosAdmin');
      const res = (await fn({})) as { data: { usuarios: UsuarioAdmin[]; invitados: InvitadoAdmin[] } };
      setUsuarios(res.data.usuarios ?? []);
      setInvitados(res.data.invitados ?? []);
    } catch (e) {
      setErrCarga((e instanceof Error ? e.message : 'No se pudieron cargar los usuarios.').replace(/^.*?:\s*/, ''));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const correos = useMemo(
    () => [...new Set(texto.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))],
    [texto],
  );

  // El rol 'apoyo' no se usa en la plataforma (los gestores/IT no llevan usuario,
  // solo notificación) → se ocultan del listado y no se ofrece como opción.
  const usuariosVisibles = useMemo(() => usuarios.filter((u) => u.rol !== 'apoyo'), [usuarios]);

  const conteos = useMemo(
    () => ({
      todos: usuariosVisibles.length,
      activos: usuariosVisibles.filter((u) => u.activo).length,
      inactivos: usuariosVisibles.filter((u) => !u.activo).length,
      invitados: invitados.length,
    }),
    [usuariosVisibles, invitados],
  );

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuariosVisibles
      .filter((u) => (tab === 'activos' ? u.activo : tab === 'inactivos' ? !u.activo : true))
      .filter((u) => (filtroRol ? u.rol === filtroRol : true))
      .filter((u) =>
        !q
          ? true
          : `${u.nombre} ${u.apellido} ${u.email} ${u.empresa_codigo ?? ''}`.toLowerCase().includes(q),
      )
      .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'));
  }, [usuariosVisibles, tab, filtroRol, busqueda]);

  async function cambiarRol(u: UsuarioAdmin, nuevoRol: string) {
    if (nuevoRol === u.rol || !user) return;
    setAccionUid(u.uid);
    setAviso('');
    setErrCarga('');
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(SETEAR_ROL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: u.uid, rol: nuevoRol }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) throw new Error(json.error ?? 'No se pudo cambiar el rol.');
      setAviso(
        `Rol de ${u.nombre} cambiado a ${ROL_LABEL[nuevoRol] ?? nuevoRol}. La persona debe cerrar sesión y volver a entrar para que aplique.`,
      );
      await cargar();
    } catch (e) {
      setErrCarga(e instanceof Error ? e.message : 'No se pudo cambiar el rol.');
    } finally {
      setAccionUid('');
    }
  }

  async function toggleEstado(u: UsuarioAdmin) {
    if (!user) return;
    const activar = !u.activo;
    if (!activar && !window.confirm(`¿Desactivar a ${u.nombre} ${u.apellido}? No podrá volver a ingresar.`)) {
      return;
    }
    setAccionUid(u.uid);
    setAviso('');
    setErrCarga('');
    try {
      const fn = httpsCallable(functions, 'cambiarEstadoUsuario');
      await fn({ uid: u.uid, activo: activar });
      setAviso(`${u.nombre} ${u.apellido} quedó ${activar ? 'ACTIVO' : 'DESACTIVADO'}.`);
      await cargar();
    } catch (e) {
      setErrCarga((e instanceof Error ? e.message : 'No se pudo cambiar el estado.').replace(/^.*?:\s*/, ''));
    } finally {
      setAccionUid('');
    }
  }

  async function marcar() {
    setErrorPre('');
    setResultadoPre(null);
    if (correos.length === 0) {
      setErrorPre('Pega al menos un correo.');
      return;
    }
    setGuardando(true);
    try {
      const fn = httpsCallable(functions, 'preasignarRoles');
      const res = (await fn({
        emails: correos,
        rol: rolPre,
      })) as { data: { creados: number; invalidos: string[] } };
      setResultadoPre(res.data);
      setTexto('');
      await cargar();
    } catch (e) {
      setErrorPre((e instanceof Error ? e.message : 'No se pudo guardar.').replace(/^.*?:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'activos', label: 'Activos' },
    { key: 'inactivos', label: 'Inactivos' },
    { key: 'invitados', label: 'Invitados sin entrar' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-text-muted">
            <Users size={16} strokeWidth={1.75} />
            <Pill tono="brand" dot>
              Administración
            </Pill>
          </div>
          <h1 className="mt-3 text-[36px] font-light leading-[1.05] tracking-[-0.03em] text-text-strong">
            Usuarios
          </h1>
          <p className="mt-2 text-[14px] text-text-muted">Gestión, permisos y trazabilidad de acceso.</p>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={13} strokeWidth={1.75} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* ─── Tabs ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-brand-600 text-text-strong'
                : 'border-transparent text-text-muted hover:text-text-strong',
            )}
          >
            {t.label}{' '}
            <span className="ml-1 text-[11px] tabular-nums text-text-subtle">{conteos[t.key]}</span>
          </button>
        ))}
      </div>

      {aviso && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800">
          {aviso}
        </div>
      )}
      {errCarga && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {errCarga}
        </div>
      )}

      {tab !== 'invitados' && (
        <>
          {/* Búsqueda + filtro por rol */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={15}
                strokeWidth={1.75}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, correo o empresa…"
                className={cn(controlClass, 'pl-9')}
              />
            </div>
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              className={cn(controlClass, 'w-auto min-w-[160px]')}
            >
              <option value="">Todos los roles</option>
              {ROLES_ASIGNABLES.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>

          {/* Tabla de usuarios */}
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-text-muted">
                <tr>
                  {['Usuario', 'Rol', 'Área / Empresa', 'Estado', 'Último login', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-bold text-[10px] uppercase tracking-[0.06em] text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-subtle text-[13px]">
                      Cargando usuarios…
                    </td>
                  </tr>
                )}
                {!cargando && usuariosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-subtle text-[13px]">
                      No hay usuarios que coincidan.
                    </td>
                  </tr>
                )}
                {usuariosFiltrados.map((u) => {
                  const ocupado = accionUid === u.uid;
                  return (
                    <tr key={u.uid} className={cn('hover:bg-slate-50/60', !u.activo && 'opacity-60')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[12px] font-semibold shrink-0">
                            {(u.nombre || u.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-strong truncate">
                              {u.nombre} {u.apellido}
                            </p>
                            <p className="text-[11px] text-text-subtle truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.rol}
                          disabled={ocupado}
                          onChange={(e) => cambiarRol(u, e.target.value)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-text-strong focus:outline-none focus:border-brand-400 disabled:opacity-60"
                        >
                          {!ROLES_ASIGNABLES.includes(u.rol) && <option value={u.rol}>{u.rol}</option>}
                          {ROLES_ASIGNABLES.map((r) => (
                            <option key={r} value={r}>
                              {ROL_LABEL[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-text-body text-[12px]">
                        {u.area_apoyo ? ROL_LABEL[u.area_apoyo] ?? u.area_apoyo : ''}
                        {u.area_apoyo && u.empresa_codigo ? ' · ' : ''}
                        {u.empresa_codigo ?? (!u.area_apoyo ? '—' : '')}
                      </td>
                      <td className="px-4 py-3">
                        {u.activo ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-[12px] whitespace-nowrap">
                        {haceTiempo(u.ultimo_login)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleEstado(u)}
                          disabled={ocupado}
                          className={cn(
                            'text-[12px] font-medium hover:underline disabled:opacity-60',
                            u.activo ? 'text-danger-700' : 'text-emerald-700',
                          )}
                        >
                          {ocupado ? '…' : u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ─── Invitados sin entrar ───────────────────────────────── */}
      {tab === 'invitados' && (
        <Card padding="lg">
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted mb-4">
            Pre-asignados que aún no han ingresado ({invitados.length})
          </p>
          {invitados.length === 0 && (
            <p className="text-[13px] text-text-subtle italic">
              Todos los correos pre-asignados ya ingresaron.
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {invitados.map((p) => (
              <li key={p.email} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-text-strong truncate">{p.email}</p>
                  <p className="text-[11px] text-text-subtle">
                    {ROL_LABEL[p.rol] ?? p.rol}
                    {p.area_apoyo ? ` · ${p.area_apoyo}` : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 shrink-0">
                  <Clock size={12} /> Pendiente de ingreso
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ─── Invitar / pre-asignar rol ──────────────────────────── */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-1.5 text-text-muted">
          <UserPlus size={14} strokeWidth={1.75} />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase">Invitar / pre-asignar rol</p>
        </div>
        <p className="text-[12.5px] text-text-muted mb-4 max-w-2xl">
          Marca correos con <strong>Gestión Humana</strong> o <strong>Conexión de Talentos</strong>.
          Cuando la persona entre por primera vez con Google, ya le queda su perfil. Los{' '}
          <strong>analistas</strong> y <strong>líderes</strong> eligen su rol al entrar;{' '}
          <strong>admin</strong> y <strong>coordinación</strong> los asigna un administrador.
        </p>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['gh', 'talentos'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRolPre(r)}
                className={cn(
                  'rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors',
                  rolPre === r
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-text-body hover:bg-slate-50',
                )}
              >
                {ROL_LABEL[r]}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-[12px] font-medium text-text-muted">
              Correos @equitel.com.co (uno por línea o separados por coma)
            </span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder={'jhoyos@equitel.com.co\nperson2@equitel.com.co'}
              className={cn(controlClass, 'mt-1 font-mono resize-y')}
            />
          </label>
          {correos.length > 0 && (
            <p className="text-[11.5px] text-text-subtle">
              {correos.length} correo{correos.length === 1 ? '' : 's'} detectado
              {correos.length === 1 ? '' : 's'}.
            </p>
          )}

          {errorPre && <p className="text-[12.5px] text-danger-700">{errorPre}</p>}
          {resultadoPre && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12.5px] text-emerald-800">
              ✅ {resultadoPre.creados} correo{resultadoPre.creados === 1 ? '' : 's'} marcado
              {resultadoPre.creados === 1 ? '' : 's'} como <strong>{ROL_LABEL[rolPre]}</strong>.
              {resultadoPre.invalidos.length > 0 && (
                <span className="block mt-1 text-amber-700">
                  Ignorados (no @equitel.com.co): {resultadoPre.invalidos.join(', ')}
                </span>
              )}
            </div>
          )}

          <Button
            variant="brand-primary"
            size="medium"
            icon={<UserPlus size={14} strokeWidth={1.75} />}
            onClick={marcar}
            disabled={guardando || correos.length === 0}
            loading={guardando}
          >
            Marcar como {ROL_LABEL[rolPre]}
          </Button>
        </div>
      </Card>
    </div>
  );
}
