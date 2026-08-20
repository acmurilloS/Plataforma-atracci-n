import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * reconciliarExamenesDescartados · one-shot idempotente (reu Karen 19-ago). Antes
 * de sincronizar automáticamente (onPostulacionDescartada), varias postulaciones
 * se marcaron `descartado_examenes_medicos` desde el desplegable sin actualizar el
 * doc del examen → salían en "Revisión C&D" y no en "No aptos". Esto recorre todas
 * las postulaciones en ese estado y pone su examen en 'no_apto' (si no estaba ya
 * decidido). Seguro de correr varias veces. Solo admin.
 */
export const reconciliarExamenesDescartados = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  if (String(req.auth.token.rol ?? '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo admin.');
  }

  const pend = await db
    .collection('postulaciones')
    .where('estado', '==', 'descartado_examenes_medicos')
    .get();

  let revisadas = 0;
  let corregidas = 0;
  const detalle: { postulacion: string; candidato: string; estado_previo: string }[] = [];

  for (const p of pend.docs) {
    revisadas++;
    const ex = await db
      .collection('examenes_medicos')
      .where('postulacion_id', '==', p.id)
      .limit(1)
      .get();
    if (ex.empty) continue;
    const estadoEx = String(ex.docs[0].data()?.estado ?? '');
    if (estadoEx === 'no_apto' || estadoEx === 'apto') continue; // ya decidido
    await ex.docs[0].ref.update({
      estado: 'no_apto',
      decision_cd: 'no_continua',
      sincronizado_desde_descarte: true,
      decidido_en: FieldValue.serverTimestamp(),
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: req.auth.uid,
    });
    corregidas++;
    detalle.push({
      postulacion: p.id,
      candidato: String(p.data()?.candidato_nombre ?? ''),
      estado_previo: estadoEx,
    });
  }

  logger.info('[reconciliarExamenesDescartados]', { revisadas, corregidas, detalle });
  return { ok: true as const, revisadas, corregidas, detalle };
});
