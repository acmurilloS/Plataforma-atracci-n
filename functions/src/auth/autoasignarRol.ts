import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * autoasignarRol · onboarding de AUTOSERVICIO en el primer ingreso.
 *
 * Cuando una persona entra por primera vez con su cuenta de Google y aún no
 * tiene rol, elige su rol desde la pantalla de onboarding y esta función:
 *  - valida que sea un correo @equitel.com.co,
 *  - que sea la PRIMERA vez (no tenga ya rol → no puede auto-escalar después),
 *  - que el rol pedido NO sea admin,
 *  - setea el custom claim (lo que usan las reglas Firestore) y crea su doc
 *    `usuarios/{uid}` (lo que usa la UI).
 *
 * Tras esto el cliente refresca su token (getIdToken(true)) para que el claim
 * surta efecto. Para CAMBIAR un rol ya asignado, lo hace un admin
 * (setearRolUsuario) — esta función solo aplica a cuentas sin rol.
 */

const DOMINIO = '@equitel.com.co';
const ROLES_AUTOSERVICIO = ['lider', 'analista', 'coordinador', 'gh', 'apoyo'];
const AREAS_APOYO = ['it', 'compras', 'bodega', 'contabilidad', 'administrativo', 'talentos'];

export const autoasignarRol = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');

  const uid = req.auth.uid;
  const token = req.auth.token as Record<string, unknown>;
  const email = String(token.email ?? '').trim().toLowerCase();
  const nombreGoogle = String(token.name ?? '').trim();

  // 1) Dominio corporativo (el hint `hd` del login no es garantía → se valida aquí).
  if (!email.endsWith(DOMINIO)) {
    throw new HttpsError(
      'permission-denied',
      `Debes ingresar con tu correo corporativo (${DOMINIO}).`,
    );
  }

  // 2) Primera vez: si ya tiene rol (claim o doc), no puede auto-reasignarse.
  const yaTieneClaim = typeof token.rol === 'string' && (token.rol as string).length > 0;
  const docRef = db.collection('usuarios').doc(uid);
  const snap = await docRef.get();
  const yaTieneDoc = snap.exists && String(snap.data()?.rol ?? '').trim().length > 0;
  if (yaTieneClaim || yaTieneDoc) {
    throw new HttpsError(
      'failed-precondition',
      'Tu cuenta ya tiene un rol asignado. Si necesitas cambiarlo, pídeselo a un administrador.',
    );
  }

  // 3) Rol válido y NUNCA admin por autoservicio.
  const rol = String(req.data?.rol ?? '').trim();
  if (rol === 'admin') {
    throw new HttpsError('permission-denied', 'El rol de administrador no se puede autoasignar.');
  }
  if (!ROLES_AUTOSERVICIO.includes(rol)) {
    throw new HttpsError('invalid-argument', 'Selecciona un rol válido.');
  }

  // 4) Área obligatoria solo si es apoyo.
  let areaApoyo: string | null = null;
  if (rol === 'apoyo') {
    areaApoyo = String(req.data?.area_apoyo ?? '').trim();
    if (!AREAS_APOYO.includes(areaApoyo)) {
      throw new HttpsError('invalid-argument', 'Para el rol de apoyo debes elegir tu área.');
    }
  }

  // 5) Nombre/apellido desde el displayName de Google si no vienen.
  const partes = nombreGoogle.split(/\s+/).filter(Boolean);
  const nombre = String(req.data?.nombre ?? '').trim() || partes[0] || email.split('@')[0];
  const apellido = String(req.data?.apellido ?? '').trim() || partes.slice(1).join(' ') || '—';

  // 6) Custom claim (reglas) + doc usuarios (UI).
  const claims: Record<string, unknown> = { rol };
  if (areaApoyo) claims.area_apoyo = areaApoyo;
  await getAuth().setCustomUserClaims(uid, claims);

  await docRef.set(
    {
      id: uid,
      email,
      nombre,
      apellido,
      rol,
      area_apoyo: areaApoyo,
      empresa_codigo: null,
      sede_codigo: null,
      unidad_id: null,
      activo: true,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: uid,
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: uid,
    },
    { merge: true },
  );

  await db.collection('eventos').add({
    tipo: 'usuario_autoasigno_rol',
    uid,
    email,
    rol,
    area_apoyo: areaApoyo,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: uid,
  });

  logger.info('autoasignarRol', { uid, email, rol, areaApoyo });
  return { ok: true as const, rol, area_apoyo: areaApoyo };
});
