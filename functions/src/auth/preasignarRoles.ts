import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * preasignarRoles · el STAFF (admin/coordinador) marca uno o varios correos con
 * un rol sensible (gh, apoyo) que NO es autoseleccionable. Cuando esa persona
 * entra por primera vez con Google, `autoasignarRol` aplica el rol automáticamente
 * (sin pantalla de selección).
 *
 * Guarda un doc por correo en `preasignaciones_rol/{email}` (Admin SDK; las
 * reglas no permiten escritura directa del cliente). NUNCA pre-asigna admin ni
 * coordinador (esos van por crearUsuarioCorporativo/setearRolUsuario, admin-only).
 */

const STAFF = ['admin', 'coordinador'];
const ROLES_PERMITIDOS = ['gh', 'apoyo'];
const AREAS_APOYO = ['it', 'compras', 'bodega', 'contabilidad', 'administrativo', 'talentos'];
const RE_EMAIL = /^[^@\s]+@equitel\.com\.co$/;

export const preasignarRoles = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const rolCaller = String((req.auth.token as Record<string, unknown>).rol ?? '');
  if (!STAFF.includes(rolCaller)) {
    throw new HttpsError('permission-denied', 'Solo admin o coordinación pueden asignar roles.');
  }

  const rol = String(req.data?.rol ?? '').trim();
  if (!ROLES_PERMITIDOS.includes(rol)) {
    throw new HttpsError(
      'invalid-argument',
      'Solo puedes pre-asignar los roles gh o apoyo por esta vía.',
    );
  }

  let area: string | null = null;
  if (rol === 'apoyo') {
    area = String(req.data?.area_apoyo ?? '').trim();
    if (!AREAS_APOYO.includes(area)) {
      throw new HttpsError('invalid-argument', 'Para el rol de apoyo debes elegir un área válida.');
    }
  }

  // Normaliza, deduplica y valida dominio.
  const entrada: unknown[] = Array.isArray(req.data?.emails) ? req.data.emails : [];
  const normalizados = [
    ...new Set(entrada.map((e) => String(e ?? '').trim().toLowerCase()).filter(Boolean)),
  ];
  const validos = normalizados.filter((e) => RE_EMAIL.test(e));
  const invalidos = normalizados.filter((e) => !RE_EMAIL.test(e));

  if (validos.length === 0) {
    throw new HttpsError('invalid-argument', 'No hay correos @equitel.com.co válidos en la lista.');
  }

  const batch = db.batch();
  for (const email of validos) {
    const ref = db.collection('preasignaciones_rol').doc(email);
    // No tocamos usado_en/usado_por_uid: los escribe autoasignarRol al consumirla.
    batch.set(
      ref,
      {
        email,
        rol,
        area_apoyo: area,
        creado_por: req.auth.uid,
        creado_en: FieldValue.serverTimestamp(),
        actualizado_por: req.auth.uid,
        actualizado_en: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();

  logger.info('preasignarRoles', { por: req.auth.uid, rol, area, creados: validos.length });
  return { ok: true as const, rol, area_apoyo: area, creados: validos.length, emails: validos, invalidos };
});
