import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Check, Pencil, UserMinus, UserPlus, X } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { mensajeErrorFuncion } from '../../utils/errores';
import { esVacanteActiva, esVacanteSuspendida } from '../../utils/reportesVacantes';
import { cn } from '../../utils/cn';
import { Button } from '../brand';
import type { VacanteDoc } from '../../schemas';

/**
 * Analistas · pestaña de /admin/usuarios (Karen, 27-oct: "una tabla con las que
 * están, al frente su correo y que se pueda editar, o agregar o quitar").
 *
 *  - Editar: nombre y apellido (callable `editarNombreUsuario`, que también
 *    corrige el nombre en sus vacantes abiertas). El correo NO se edita: se entra
 *    con Google y el correo es la cuenta → se agrega la nueva y se quita la vieja.
 *  - Agregar: crea la cuenta con rol analista (`crearUsuarioCorporativo`); la
 *    persona entra con Google con ese correo.
 *  - Quitar: desactiva la cuenta (`cambiarEstadoUsuario`). No se deja quitar a
 *    quien tiene vacantes abiertas: sus avisos y respuestas de candidatos le
 *    seguirían llegando (pasó con Génesis en sep). Se reasignan primero.
 */

export interface UsuarioAnalista {
  uid: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  activo: boolean;
}

const CREAR_URL = 'https://us-central1-ptm-atraccion.cloudfunctions.net/crearUsuarioCorporativo';
const RE_EMAIL = /^[^@\s]+@equitel\.com\.co$/;

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

export function AnalistasPanel({
  usuarios,
  onCambio,
}: {
  usuarios: UsuarioAnalista[];
  onCambio: (aviso: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const { docs: vacantes } = useColeccion<VacanteDoc>('vacantes', { limit: 500 });
  const abiertasPor = useMemo(() => {
    const m = new Map<string, VacanteDoc[]>();
    for (const v of vacantes) {
      if (!v.analista_uid) continue;
      if (!esVacanteActiva(v.estado) && !esVacanteSuspendida(v.estado)) continue;
      m.set(v.analista_uid, [...(m.get(v.analista_uid) ?? []), v]);
    }
    return m;
  }, [vacantes]);

  const analistas = useMemo(
    () =>
      usuarios
        .filter((u) => u.rol === 'analista')
        .sort(
          (a, b) =>
            Number(b.activo) - Number(a.activo) ||
            `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'),
        ),
    [usuarios],
  );

  const [editando, setEditando] = useState<{ uid: string; nombre: string; apellido: string } | null>(null);
  const [procesando, setProcesando] = useState('');
  const [err, setErr] = useState('');
  const [nueva, setNueva] = useState({ email: '', nombre: '', apellido: '' });

  async function guardarNombre() {
    if (!editando) return;
    setProcesando(editando.uid);
    setErr('');
    try {
      const fn = httpsCallable<
        { uid: string; nombre: string; apellido: string },
        { ok: true; vacantes_actualizadas: number }
      >(functions, 'editarNombreUsuario');
      const r = await fn(editando);
      setEditando(null);
      await onCambio(
        `Nombre actualizado a ${editando.nombre} ${editando.apellido}` +
          (r.data.vacantes_actualizadas
            ? ` (también en ${r.data.vacantes_actualizadas} vacante(s) abierta(s)).`
            : '.'),
      );
    } catch (e) {
      setErr(mensajeErrorFuncion(e, 'No se pudo cambiar el nombre.'));
    } finally {
      setProcesando('');
    }
  }

  async function cambiarEstado(u: UsuarioAnalista, activo: boolean) {
    const abiertas = abiertasPor.get(u.uid) ?? [];
    if (!activo && abiertas.length > 0) {
      setErr(
        `${u.nombre} tiene ${abiertas.length} vacante(s) abierta(s) (${abiertas
          .map((v) => v.consecutivo)
          .join(', ')}). Reasígnalas a otra analista desde cada vacante y luego quítala.`,
      );
      return;
    }
    if (
      !window.confirm(
        activo
          ? `¿Volver a activar a ${u.nombre} ${u.apellido}?`
          : `¿Quitar a ${u.nombre} ${u.apellido}? Su cuenta queda desactivada y no podrá ingresar. Su historial se conserva.`,
      )
    )
      return;
    setProcesando(u.uid);
    setErr('');
    try {
      await httpsCallable(functions, 'cambiarEstadoUsuario')({ uid: u.uid, activo });
      await onCambio(`${u.nombre} ${u.apellido} quedó ${activo ? 'activa' : 'desactivada'}.`);
    } catch (e) {
      setErr(mensajeErrorFuncion(e, 'No se pudo cambiar el estado.'));
    } finally {
      setProcesando('');
    }
  }

  async function agregar() {
    setErr('');
    const email = nueva.email.trim().toLowerCase();
    const nombre = nueva.nombre.trim();
    const apellido = nueva.apellido.trim();
    if (!RE_EMAIL.test(email)) {
      setErr('El correo debe ser @equitel.com.co.');
      return;
    }
    if (!nombre || !apellido) {
      setErr('Escribe nombre y apellido.');
      return;
    }
    const existente = usuarios.find((u) => u.email.toLowerCase() === email);
    if (existente?.rol === 'analista') {
      setErr(
        existente.activo
          ? 'Ese correo ya es analista.'
          : 'Ese correo ya es analista pero está desactivado: usa «Activar» en la tabla.',
      );
      return;
    }
    if (
      existente &&
      !window.confirm(
        `${email} ya tiene cuenta como «${existente.rol}». ¿Cambiarla a analista? Perderá su rol actual.`,
      )
    )
      return;
    if (!user) return;
    setProcesando('nueva');
    try {
      const resp = await fetch(CREAR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ email, nombre, apellido, rol: 'analista' }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) throw new Error(json.error ?? 'No se pudo agregar.');
      setNueva({ email: '', nombre: '', apellido: '' });
      await onCambio(
        `${nombre} ${apellido} quedó como analista. Ya puede entrar con Google con ${email}.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo agregar.');
    } finally {
      setProcesando('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-slate-200 bg-white overflow-x-auto shadow-brand-card">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.06em] text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Analista</th>
              <th className="px-4 py-2.5 font-semibold">Correo</th>
              <th className="px-4 py-2.5 font-semibold text-center">Vacantes abiertas</th>
              <th className="px-4 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {analistas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No hay analistas.
                </td>
              </tr>
            )}
            {analistas.map((u) => {
              const abiertas = abiertasPor.get(u.uid) ?? [];
              const enEdicion = editando?.uid === u.uid;
              return (
                <tr key={u.uid} className={cn(!u.activo && 'bg-slate-50/60 text-text-muted')}>
                  <td className="px-4 py-2.5">
                    {enEdicion ? (
                      <div className="flex gap-2 min-w-[260px]">
                        <input
                          value={editando.nombre}
                          onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                          placeholder="Nombre"
                          className={inputClass}
                          autoFocus
                        />
                        <input
                          value={editando.apellido}
                          onChange={(e) => setEditando({ ...editando, apellido: e.target.value })}
                          placeholder="Apellido"
                          className={inputClass}
                        />
                      </div>
                    ) : (
                      <span className="font-medium text-text-strong">
                        {u.nombre} {u.apellido}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text-body">{u.email}</td>
                  <td
                    className="px-4 py-2.5 text-center tabular-nums"
                    title={abiertas.map((v) => v.consecutivo).join(', ')}
                  >
                    {abiertas.length}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'text-[11px] font-semibold rounded-full px-2 py-0.5',
                        u.activo ? 'bg-success-50 text-success-700' : 'bg-slate-100 text-text-muted',
                      )}
                    >
                      {u.activo ? 'Activa' : 'Desactivada'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      {enEdicion ? (
                        <>
                          <button
                            type="button"
                            onClick={guardarNombre}
                            disabled={procesando === u.uid}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-success-700 hover:underline disabled:opacity-50"
                          >
                            <Check size={13} strokeWidth={2} /> Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditando(null)}
                            className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:underline"
                          >
                            <X size={13} strokeWidth={2} /> Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEditando({ uid: u.uid, nombre: u.nombre, apellido: u.apellido })
                            }
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
                          >
                            <Pencil size={12} strokeWidth={1.75} /> Editar
                          </button>
                          {u.uid !== user?.uid && (
                            <button
                              type="button"
                              onClick={() => cambiarEstado(u, !u.activo)}
                              disabled={procesando === u.uid}
                              className={cn(
                                'inline-flex items-center gap-1 text-[12px] font-medium hover:underline disabled:opacity-50',
                                u.activo ? 'text-danger-700' : 'text-success-700',
                              )}
                            >
                              {u.activo ? (
                                <>
                                  <UserMinus size={12} strokeWidth={1.75} /> Quitar
                                </>
                              ) : (
                                <>
                                  <UserPlus size={12} strokeWidth={1.75} /> Activar
                                </>
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-brand-card">
        <p className="text-[13px] font-semibold text-text-strong">Agregar analista</p>
        <p className="text-[12px] text-text-muted mt-0.5 mb-3">
          Entra con Google con este correo. ¿Cambió el correo de alguien? Agrega el nuevo y quita el
          anterior (el correo es su cuenta y no se puede editar).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start">
          <input
            value={nueva.email}
            onChange={(e) => setNueva({ ...nueva, email: e.target.value })}
            placeholder="correo@equitel.com.co"
            className={inputClass}
          />
          <input
            value={nueva.nombre}
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
            placeholder="Nombre"
            className={inputClass}
          />
          <input
            value={nueva.apellido}
            onChange={(e) => setNueva({ ...nueva, apellido: e.target.value })}
            placeholder="Apellido"
            className={inputClass}
          />
          <Button
            variant="brand-primary"
            onClick={agregar}
            loading={procesando === 'nueva'}
            disabled={procesando === 'nueva'}
            icon={<UserPlus size={13} strokeWidth={1.75} />}
          >
            Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}
