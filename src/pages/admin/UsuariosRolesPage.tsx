import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, Clock, UserPlus } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useColeccion } from '../../hooks/useColeccion';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * UsuariosRolesPage · /admin/usuarios (admin + coordinación).
 *
 * El staff marca correos con un rol sensible que NO es autoseleccionable (GH o
 * apoyo). Llama a la callable `preasignarRoles`; cuando la persona entra por
 * primera vez con Google, `autoasignarRol` le aplica el rol solo (sin pantalla
 * de selección). Lista las pre-asignaciones existentes con su estado.
 */

interface PreasignacionDoc {
  id: string;
  email: string;
  rol: string;
  area_apoyo?: string | null;
  usado_en?: { toDate?: () => Date } | null;
}

const AREAS: { area: string; label: string }[] = [
  { area: 'it', label: 'Sistemas / IT' },
  { area: 'compras', label: 'Compras' },
  { area: 'bodega', label: 'Bodega' },
  { area: 'contabilidad', label: 'Contabilidad' },
  { area: 'administrativo', label: 'Administrativo' },
  { area: 'talentos', label: 'Conexión / Talentos' },
];

const ROL_LABEL: Record<string, string> = { gh: 'Gestión Humana', apoyo: 'Apoyo' };

const controlClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

export default function UsuariosRolesPage() {
  const [rol, setRol] = useState<'gh' | 'apoyo'>('gh');
  const [area, setArea] = useState('');
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<{
    creados: number;
    emails: string[];
    invalidos: string[];
  } | null>(null);

  const { docs: preasignaciones } = useColeccion<PreasignacionDoc>('preasignaciones_rol', {
    limit: 500,
  });

  const correos = useMemo(
    () => [...new Set(texto.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))],
    [texto],
  );

  async function marcar() {
    setError('');
    setResultado(null);
    if (rol === 'apoyo' && !area) {
      setError('Elige el área de apoyo.');
      return;
    }
    if (correos.length === 0) {
      setError('Pega al menos un correo.');
      return;
    }
    setGuardando(true);
    try {
      const fn = httpsCallable(functions, 'preasignarRoles');
      const res = (await fn({
        emails: correos,
        rol,
        area_apoyo: rol === 'apoyo' ? area : undefined,
      })) as { data: { creados: number; emails: string[]; invalidos: string[] } };
      setResultado(res.data);
      setTexto('');
    } catch (e) {
      setError((e instanceof Error ? e.message : 'No se pudo guardar.').replace(/^.*?:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <div>
        <Pill tono="brand" dot>
          Administración
        </Pill>
        <h1 className="mt-4 text-[36px] font-light leading-[1.05] tracking-[-0.03em] text-text-strong">
          Usuarios y roles
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Marca los correos del equipo de <strong>Gestión Humana</strong> (o de apoyo). Cuando esa
          persona entre por primera vez con su cuenta de Google, ya le queda su perfil — sin pasar
          por la selección de rol. <strong>Admin</strong> y <strong>coordinación</strong> no se
          asignan por aquí.
        </p>
      </div>

      <Card padding="lg">
        <div className="flex items-center gap-2 mb-5 text-text-muted">
          <UserPlus size={14} strokeWidth={1.75} />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase">Marcar correos con un rol</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['gh', 'apoyo'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRol(r);
                  if (r !== 'apoyo') setArea('');
                }}
                className={cn(
                  'rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors',
                  rol === r
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-text-body hover:bg-slate-50',
                )}
              >
                {ROL_LABEL[r]}
              </button>
            ))}
          </div>

          {rol === 'apoyo' && (
            <div>
              <p className="text-[12px] font-medium text-text-muted mb-1.5">Área de apoyo</p>
              <select value={area} onChange={(e) => setArea(e.target.value)} className={controlClass}>
                <option value="">Elige un área…</option>
                {AREAS.map((a) => (
                  <option key={a.area} value={a.area}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block">
              <span className="text-[12px] font-medium text-text-muted">
                Correos @equitel.com.co (uno por línea o separados por coma)
              </span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={5}
                placeholder={'kmbonilla@equitel.com.co\nperson2@equitel.com.co'}
                className={cn(controlClass, 'mt-1 font-mono resize-y')}
              />
            </label>
            {correos.length > 0 && (
              <p className="mt-1.5 text-[11.5px] text-text-subtle">
                {correos.length} correo{correos.length === 1 ? '' : 's'} detectado
                {correos.length === 1 ? '' : 's'}.
              </p>
            )}
          </div>

          {error && <p className="text-[12.5px] text-danger-700">{error}</p>}

          {resultado && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12.5px] text-emerald-800">
              ✅ {resultado.creados} correo{resultado.creados === 1 ? '' : 's'} marcado
              {resultado.creados === 1 ? '' : 's'} como <strong>{ROL_LABEL[rol]}</strong>.
              {resultado.invalidos.length > 0 && (
                <span className="block mt-1 text-amber-700">
                  Ignorados (no @equitel.com.co): {resultado.invalidos.join(', ')}
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
            Marcar como {ROL_LABEL[rol]}
          </Button>
        </div>
      </Card>

      <Card padding="lg">
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted mb-4">
          Pre-asignaciones ({preasignaciones.length})
        </p>
        {preasignaciones.length === 0 && (
          <p className="text-[13px] text-text-subtle italic">Aún no hay correos marcados.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {preasignaciones.map((p) => {
            const usado = !!p.usado_en;
            return (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-text-strong truncate">{p.email}</p>
                  <p className="text-[11px] text-text-subtle">
                    {ROL_LABEL[p.rol] ?? p.rol}
                    {p.area_apoyo ? ` · ${p.area_apoyo}` : ''}
                  </p>
                </div>
                {usado ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 shrink-0">
                    <CheckCircle2 size={12} /> Ya ingresó
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted shrink-0">
                    <Clock size={12} /> Pendiente de ingreso
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
