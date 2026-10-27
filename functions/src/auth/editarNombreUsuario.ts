import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { puedeGestionarUsuarios } from './permisos';

/**
 * editarNombreUsuario · tabla de Analistas en /admin/usuarios (Karen, 27-oct:
 * "que se pueda editar, agregar o quitar").
 *
 * Cambia nombre y apellido de una cuenta (doc `usuarios` + displayName de Auth).
 * El CORREO no se edita: el ingreso es con Google y el correo ES la cuenta; para
 * cambiarlo se agrega la cuenta nueva y se quita la anterior.
 *
 * Si es analista, también corrige `analista_nombre` en sus vacantes ABIERTAS
 * (las cerradas guardan quién trabajó el proceso). Caso que lo originó: la cuenta
 * dbarbosa@ figuraba como "Camila Agudelo" mientras Camila cubría la licencia de
 * Catalina Barbosa.
 */
const TERMINADAS = ['cerrada', 'desierta', 'cancelada'];

export const editarNombreUsuario = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  if (!puedeGestionarUsuarios(req.auth.token as Record<string, unknown>)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para editar usuarios.');
  }
  const uid = String(req.data?.uid ?? '').trim();
  const nombre = String(req.data?.nombre ?? '').trim().replace(/\s+/g, ' ');
  const apellido = String(req.data?.apellido ?? '').trim().replace(/\s+/g, ' ');
  if (!uid || uid.includes('/')) throw new HttpsError('invalid-argument', 'Falta el usuario.');
  if (!nombre || nombre.length > 60 || apellido.length > 60) {
    throw new HttpsError('invalid-argument', 'Escribe el nombre (y el apellido) de la persona.');
  }

  const ref = db.collection('usuarios').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ese usuario no existe.');
  const u = snap.data() ?? {};
  const completo = `${nombre} ${apellido}`.trim();

  await ref.update({
    nombre,
    apellido,
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: req.auth.uid,
  });
  try {
    await getAuth().updateUser(uid, { displayName: completo });
  } catch (e) {
    logger.warn('[editarNombreUsuario] no se pudo actualizar el displayName', { uid, e: String(e) });
  }

  let vacantes = 0;
  if (String(u.rol ?? '') === 'analista') {
    const vs = await db.collection('vacantes').where('analista_uid', '==', uid).get();
    const batch = db.batch();
    for (const d of vs.docs) {
      if (TERMINADAS.includes(String(d.data().estado ?? ''))) continue;
      if (String(d.data().analista_nombre ?? '') === completo) continue;
      batch.update(d.ref, { analista_nombre: completo });
      vacantes++;
    }
    if (vacantes) await batch.commit();
  }

  await db.collection('eventos').add({
    tipo: 'usuario.nombre_editado',
    entidad_tipo: 'usuario',
    entidad_id: uid,
    antes: `${String(u.nombre ?? '')} ${String(u.apellido ?? '')}`.trim(),
    despues: completo,
    vacantes_actualizadas: vacantes,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: req.auth.uid,
  });
  logger.info('[editarNombreUsuario]', { uid, completo, vacantes });
  return { ok: true as const, vacantes_actualizadas: vacantes };
});
