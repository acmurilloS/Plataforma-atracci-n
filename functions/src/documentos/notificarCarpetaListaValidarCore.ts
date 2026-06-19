import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';

/**
 * notificarCarpetaListaValidarCore · C.1 / F5.
 *
 * Lógica pura (Admin SDK, sin auth) que avisa a Gestión Humana que la carpeta de
 * un candidato está completa y lista para validar: notificación in-app + correo
 * (vía onNotificacionCreate). Idempotente con `carpeta_lista_validar_notificada_en`
 * en la postulación.
 *
 * La comparte la callable `notificarCarpetaListaValidar` (disparada desde el tab
 * Documentos) y el trigger `onCarpetaCompletaCheck` (auto-armado de carpeta).
 */
export async function notificarCarpetaListaValidarCore(
  postulacionId: string,
  creadoPor: string,
): Promise<{ ok: true; notificados: number; yaNotificado: boolean }> {
  const postRef = db.collection('postulaciones').doc(postulacionId);

  // Idempotencia bajo concurrencia: ganar la carrera del flag dentro de una
  // transacción. Solo el ganador notifica (el trigger F5 puede dispararse en
  // paralelo por varias subidas casi simultáneas).
  const post = await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    if (data.carpeta_lista_validar_notificada_en) return null;
    tx.update(postRef, { carpeta_lista_validar_notificada_en: FieldValue.serverTimestamp() });
    return data;
  });
  if (!post) {
    return { ok: true, notificados: 0, yaNotificado: true };
  }

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
    creado_por: creadoPor,
  });

  logger.info('[carpeta] GH notificado · carpeta lista para validar', {
    postulacionId,
    notificados,
  });
  return { ok: true, notificados, yaNotificado: false };
}
