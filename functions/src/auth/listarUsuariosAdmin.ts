import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { puedeGestionarUsuarios } from './permisos';

/**
 * listarUsuariosAdmin · admin-only. Devuelve todo lo que la pestaña de Usuarios
 * necesita para gestión y trazabilidad de acceso (reu 03-jul):
 *  - `usuarios`: los que ya ENTRARON (tienen doc), con rol, área/empresa, estado
 *    (activo) y ÚLTIMO LOGIN (de Firebase Auth, que sí lo registra).
 *  - `invitados`: pre-asignaciones de rol que TODAVÍA no se usan (correos
 *    marcados por el staff que aún no han ingresado).
 *
 * Los timestamps salen en milisegundos (o ISO para los de Auth) para el cliente.
 */
export const listarUsuariosAdmin = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  if (!puedeGestionarUsuarios(req.auth.token as Record<string, unknown>)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para ver la gestión de usuarios.');
  }

  const toMs = (ts: unknown): number | null => {
    const m = (ts as { toMillis?: () => number })?.toMillis?.();
    return typeof m === 'number' ? m : null;
  };

  const snap = await db.collection('usuarios').get();

  // Metadata de Auth (último login + si está deshabilitada) SOLO de los usuarios
  // reales (los que tienen doc). Antes se paginaba por TODAS las cuentas de Auth
  // con listUsers — desde que hay auth anónima, eso recorre miles de cuentas de
  // candidatos sin necesidad (revisión 16-jul). getUsers va en lotes de 100.
  const authMeta = new Map<
    string,
    { ultimo_login: string | null; deshabilitado: boolean; creado: string | null }
  >();
  const uids = snap.docs.map((d) => ({ uid: d.id }));
  for (let i = 0; i < uids.length; i += 100) {
    const res = await getAuth().getUsers(uids.slice(i, i + 100));
    res.users.forEach((u) => {
      authMeta.set(u.uid, {
        ultimo_login: u.metadata.lastSignInTime || null,
        deshabilitado: u.disabled,
        creado: u.metadata.creationTime || null,
      });
    });
  }
  const usuarios = snap.docs.map((d) => {
    const data = d.data();
    const meta = authMeta.get(d.id);
    return {
      uid: d.id,
      email: String(data.email ?? ''),
      nombre: String(data.nombre ?? ''),
      apellido: String(data.apellido ?? ''),
      rol: String(data.rol ?? ''),
      area_apoyo: data.area_apoyo ? String(data.area_apoyo) : null,
      unidades_gerente: Array.isArray(data.unidades_gerente)
        ? data.unidades_gerente.map((u: unknown) => String(u ?? ''))
        : null,
      empresa_codigo: data.empresa_codigo ? String(data.empresa_codigo) : null,
      activo: data.activo !== false,
      auth_deshabilitado: meta?.deshabilitado ?? false,
      ultimo_login: meta?.ultimo_login ?? null,
      creado_en: toMs(data.creado_en),
      fuente_rol: data.fuente_rol ? String(data.fuente_rol) : null,
    };
  });

  // Pre-asignaciones que aún NO se han usado (invitados que no han entrado).
  const preSnap = await db.collection('preasignaciones_rol').get();
  const invitados = preSnap.docs
    .filter((d) => !d.data().usado_en)
    .map((d) => {
      const data = d.data();
      return {
        email: String(data.email ?? d.id),
        rol: String(data.rol ?? ''),
        area_apoyo: data.area_apoyo ? String(data.area_apoyo) : null,
        unidades_gerente: Array.isArray(data.unidades_gerente)
          ? data.unidades_gerente.map((u: unknown) => String(u ?? ''))
          : null,
        creado_en: toMs(data.creado_en),
        creado_por: data.creado_por ? String(data.creado_por) : null,
      };
    });

  return { usuarios, invitados };
});
