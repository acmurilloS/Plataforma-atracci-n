import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * autoasignarRol · resuelve el rol del usuario en su PRIMER ingreso.
 *
 * Dos caminos, en este orden:
 *  1. PRE-ASIGNACIÓN del staff: si su correo fue marcado en `preasignaciones_rol`
 *     (p.ej. GH), se le aplica ESE rol automáticamente — no ve pantalla de
 *     selección. Roles sensibles (gh, apoyo) van solo por aquí.
 *  2. AUTOSERVICIO: si no hay pre-asignación, solo puede elegir `lider` o
 *     `analista`. Cualquier otro rol (gh, coordinador, apoyo, admin) se rechaza
 *     en el servidor — no por la UI.
 *
 * Validaciones: correo @equitel.com.co; solo PRIMERA vez (con rol ya asignado no
 * se puede auto-cambiar → lo hace un admin con setearRolUsuario). Tras asignar,
 * el cliente refresca el token (getIdToken(true)) para que el claim surta efecto.
 */

const DOMINIO = '@equitel.com.co';
/** Lo único que un usuario puede ELEGIR por sí mismo en el primer ingreso. */
const ROLES_AUTOSERVICIO = ['lider', 'analista'];
/** Roles válidos que el staff puede dejar PRE-ASIGNADOS (se honran al ingresar). */
const ROLES_PREASIGNABLES = ['gh', 'apoyo'];

export const autoasignarRol = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');

  const uid = req.auth.uid;
  const token = req.auth.token as Record<string, unknown>;
  const email = String(token.email ?? '').trim().toLowerCase();
  const nombreGoogle = String(token.name ?? '').trim();

  // Dominio corporativo (el hint `hd` del login no es garantía → se valida aquí).
  if (!email.endsWith(DOMINIO)) {
    throw new HttpsError(
      'permission-denied',
      `Debes ingresar con tu correo corporativo (${DOMINIO}).`,
    );
  }

  // Primera vez: si ya tiene rol (claim o doc), no puede auto-reasignarse.
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

  // Nombre/apellido del displayName de Google (si no vienen).
  const partes = nombreGoogle.split(/\s+/).filter(Boolean);
  const nombre = String(req.data?.nombre ?? '').trim() || partes[0] || email.split('@')[0];
  const apellido = String(req.data?.apellido ?? '').trim() || partes.slice(1).join(' ') || '—';

  async function asignar(
    rol: string,
    areaApoyo: string | null,
    fuente: 'preasignado' | 'autoservicio',
    asignadoPor: string | null,
  ) {
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
        fuente_rol: fuente,
        asignado_por: asignadoPor,
        creado_en: FieldValue.serverTimestamp(),
        creado_por: asignadoPor ?? uid,
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: asignadoPor ?? uid,
      },
      { merge: true },
    );
    await db.collection('eventos').add({
      tipo: 'usuario_rol_asignado',
      uid,
      email,
      rol,
      area_apoyo: areaApoyo,
      fuente,
      asignado_por: asignadoPor,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: asignadoPor ?? uid,
    });
    logger.info('autoasignarRol · asignado', { uid, email, rol, areaApoyo, fuente });
  }

  // 1) PRE-ASIGNACIÓN del staff (p.ej. GH). Gana sobre cualquier elección.
  const preRef = db.collection('preasignaciones_rol').doc(email);
  const preSnap = await preRef.get();
  if (preSnap.exists) {
    const pre = preSnap.data() ?? {};
    const rolPre = String(pre.rol ?? '').trim();
    const areaPre = pre.area_apoyo ? String(pre.area_apoyo) : null;
    if (ROLES_PREASIGNABLES.includes(rolPre)) {
      await asignar(rolPre, areaPre, 'preasignado', String(pre.creado_por ?? '') || null);
      await preRef.update({ usado_en: FieldValue.serverTimestamp(), usado_por_uid: uid });
      return { ok: true as const, rol: rolPre, fuente: 'preasignado' as const };
    }
  }

  // 2) AUTOSERVICIO: solo lider/analista. Sin elección → pedir selección.
  const rol = String(req.data?.rol ?? '').trim();
  if (!rol) {
    return { ok: false as const, requiere_seleccion: true as const };
  }
  if (!ROLES_AUTOSERVICIO.includes(rol)) {
    throw new HttpsError(
      'permission-denied',
      'Ese rol no se puede autoasignar; lo asigna el equipo de Gestión Humana o un administrador.',
    );
  }
  await asignar(rol, null, 'autoservicio', null);
  return { ok: true as const, rol, fuente: 'autoservicio' as const };
});
