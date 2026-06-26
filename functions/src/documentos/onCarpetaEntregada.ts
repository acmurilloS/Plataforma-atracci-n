import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';

/**
 * onCarpetaEntregada · paso 19 (entrega formal de la carpeta a GH).
 *
 * Cuando la carpeta pasa a `entregada_gh`, avisa a todos los GH activos que la
 * carpeta de ese candidato ya está en sus manos para la validación final y la
 * aprobación. Es un momento DISTINTO del aviso "CyD completó su parte"
 * (notificarCarpetaListaValidarCore): aquí es el handoff formal (paso 18→19), así
 * que NO duplica — notifica otro evento.
 *
 * Idempotente con `entregada_gh_notificada_en` en la carpeta (transacción); el
 * guard before/after evita re-disparos al escribir ese flag.
 */
export const onCarpetaEntregada = onDocumentUpdated(
  { document: 'carpetas_digitales/{id}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    if (String(before?.estado ?? '') === 'entregada_gh') return; // ya estaba entregada
    if (String(after.estado ?? '') !== 'entregada_gh') return;

    const carpetaRef = db.collection('carpetas_digitales').doc(event.params.id);
    // Idempotencia bajo concurrencia: ganar el flag dentro de la transacción.
    const gano = await db.runTransaction(async (tx) => {
      const snap = await tx.get(carpetaRef);
      if (!snap.exists) return false;
      if (snap.data()?.entregada_gh_notificada_en) return false;
      tx.update(carpetaRef, { entregada_gh_notificada_en: FieldValue.serverTimestamp() });
      return true;
    });
    if (!gano) return;

    // Nombre/cargo del candidato desde la postulación (igual que el core de "lista").
    const postId = String(after.postulacion_id ?? '');
    let nombre = 'el candidato';
    let cargo = '';
    if (postId) {
      try {
        const p = await db.collection('postulaciones').doc(postId).get();
        if (p.exists) {
          const pd = p.data() ?? {};
          nombre = String(pd.candidato_nombre ?? '').trim() || 'el candidato';
          cargo = String(pd.cargo_nombre ?? '').trim();
        }
      } catch (e) {
        logger.warn('[carpeta] onCarpetaEntregada no pudo leer la postulación', {
          postId,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    }

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
        titulo: 'Carpeta entregada a GH para aprobación',
        mensaje: `La carpeta de ${nombre}${
          cargo ? ` (${cargo})` : ''
        } fue entregada formalmente a Gestión Humana (paso 19). Entra a Carpetas para la validación final y aprobarla.`,
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
      tipo: 'carpeta_entregada_gh',
      postulacion_id: postId || null,
      carpeta_id: event.params.id,
      gh_notificados: notificados,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
    });

    logger.info('[carpeta] GH notificado · carpeta entregada (paso 19)', {
      carpeta_id: event.params.id,
      notificados,
    });
  },
);
