import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * notificarCarpetaListaValidar · C.1 (lote GH 16-jun).
 *
 * Cuando TODOS los documentos obligatorios de la carpeta del candidato ya están
 * cargados (lo detecta el tab Documentos), avisa a Gestión Humana (rol gh) que la
 * carpeta está completa y lista para validar: notificación in-app + correo (vía
 * onNotificacionCreate). Idempotente con el flag carpeta_lista_validar_notificada_en
 * en la postulación, para no spamear si se siguen tocando documentos.
 *
 * No manda correo directamente (lo hace onNotificacionCreate), así que no
 * necesita los secrets de Gmail.
 */
export const notificarCarpetaListaValidar = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
    throw new HttpsError('permission-denied', 'Rol no autorizado.');
  }
  const postulacionId = String(req.data?.postulacion_id ?? '').trim();
  if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');

  const postRef = db.collection('postulaciones').doc(postulacionId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
  const post = postSnap.data() as Record<string, unknown>;

  // Idempotencia: solo se avisa una vez.
  if (post.carpeta_lista_validar_notificada_en) {
    return { ok: true as const, yaNotificado: true, notificados: 0 };
  }
  await postRef.update({ carpeta_lista_validar_notificada_en: FieldValue.serverTimestamp() });

  const nombre = String(post.candidato_nombre ?? 'el candidato').trim();
  const cargo = String(post.cargo_nombre ?? '').trim();

  const ghs = await db
    .collection('usuarios')
    .where('rol', '==', 'gh')
    .where('activo', '==', true)
    .get();

  let notificados = 0;
  for (const g of ghs.docs) {
    await db.collection('notificaciones').add({
      destinatario_uid: g.id,
      tipo: 'generica',
      titulo: 'Carpeta lista para validar',
      mensaje: `La carpeta de ${nombre}${
        cargo ? ` (${cargo})` : ''
      } ya tiene todos los documentos cargados. Entra a Carpetas para revisarla y validarla.`,
      link: '/carpetas',
      leida: false,
      leida_en: null,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });
    notificados++;
  }

  await db.collection('eventos').add({
    tipo: 'carpeta_lista_validar',
    postulacion_id: postulacionId,
    gh_notificados: notificados,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: req.auth.uid,
  });

  logger.info('[carpeta] GH notificado · carpeta lista para validar', {
    postulacionId,
    notificados,
  });
  return { ok: true as const, notificados };
});
