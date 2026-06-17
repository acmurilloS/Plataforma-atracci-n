import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * registrarFirmaDocumento · D.2 (slices 2-3, lote GH 16-jun).
 *
 * Registra que el candidato firmó (desde el portal) un documento del proceso:
 * 'datos_basicos' o 'debida_diligencia' (= SAGRILAFT, F-CAR-01). El PDF firmado
 * (constancia) ya se subió a Storage desde el cliente.
 *
 *  - Deja el PDF firmado en documentos_portal (lo ve el analista en Documentos).
 *  - Para debida_diligencia: enlaza la firma al doc existente
 *    (firma_integrante_url + fecha + estado 'firmado_integrante').
 */
export const registrarFirmaDocumento = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const tipo = String(req.data?.tipo ?? '').trim();
  const url = String(req.data?.url ?? '').trim();

  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');
  if (!['datos_basicos', 'debida_diligencia'].includes(tipo)) {
    throw new HttpsError('invalid-argument', 'Tipo de documento inválido.');
  }
  if (!/^https:\/\/firebasestorage\.googleapis\.com\//.test(url)) {
    throw new HttpsError('invalid-argument', 'URL de firma inválida.');
  }

  const tSnap = await db.collection('portal_candidato_tokens').doc(token).get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
  const postulacionId = String(t.postulacion_id ?? '');
  if (!postulacionId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  const titulo =
    tipo === 'datos_basicos'
      ? 'Datos básicos del integrante (firmado)'
      : 'Debida diligencia / SAGRILAFT (firmado)';

  await db.collection('documentos_portal').add({
    postulacion_id: postulacionId,
    candidato_id: t.candidato_id ?? null,
    nombre_archivo: titulo,
    url,
    via: 'firma_portal',
    subido_en: FieldValue.serverTimestamp(),
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  // Enlazar la firma al doc de debida diligencia existente, si lo hay.
  if (tipo === 'debida_diligencia') {
    try {
      const dd = await db
        .collection('debida_diligencia')
        .where('postulacion_id', '==', postulacionId)
        .limit(1)
        .get();
      if (!dd.empty) {
        await dd.docs[0].ref.update({
          firma_integrante_url: url,
          fecha_firma_integrante: FieldValue.serverTimestamp(),
          estado: 'firmado_integrante',
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: 'candidato_portal',
        });
      }
    } catch (e) {
      logger.warn('[firma] no se pudo enlazar a debida_diligencia', {
        postulacionId,
        e: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await db.collection('eventos').add({
    tipo: 'documento_firmado_portal',
    documento_tipo: tipo,
    postulacion_id: postulacionId,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  logger.info('[firma] documento firmado en portal', { postulacionId, tipo });
  return { ok: true as const };
});
