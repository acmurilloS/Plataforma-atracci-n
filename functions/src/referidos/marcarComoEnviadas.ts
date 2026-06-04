import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * Versión simplificada v1 (decisión JC 2026-06-04):
 *
 * Karen abre el modal de Referidos, copia el mensaje, lo manda manualmente,
 * y al terminar le da "Marcar como enviadas". Este callable solo registra
 * QUE pasó, con qué plantilla, en qué vacante y cuándo. No hay lista de
 * técnicos individuales en esta fase (no leemos Sheet, no hay slug por
 * persona). La tracking individual queda pendiente para v2 cuando se
 * integre WhatsApp Business / Twilio.
 *
 * Crea siempre un doc nuevo en `referidos_generaciones/` — no es idempotente
 * por diseño porque Karen puede activar referidos para la misma vacante
 * varias veces (digest semanal, refresh, etc).
 */
export const marcarComoEnviadasReferidos = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const vacanteId = String(req.data?.vacante_id ?? '');
    const plantilla = String(req.data?.plantilla ?? 'v1');
    const mensajeUsado = String(req.data?.mensaje_usado ?? '');
    const linkLanding = String(req.data?.link_landing ?? '');

    if (!vacanteId) {
      throw new HttpsError('invalid-argument', 'Falta vacante_id.');
    }
    if (!mensajeUsado) {
      throw new HttpsError('invalid-argument', 'Falta el mensaje.');
    }

    const vacSnap = await db.collection('vacantes').doc(vacanteId).get();
    if (!vacSnap.exists) {
      throw new HttpsError('not-found', 'Vacante no existe.');
    }
    const vac = vacSnap.data() as Record<string, unknown>;

    const ahora = Timestamp.now();
    const generacionRef = db.collection('referidos_generaciones').doc();
    const generacionId = generacionRef.id;

    await generacionRef.set({
      id: generacionId,
      vacante_id: vacanteId,
      vacante_consecutivo: String(vac.consecutivo ?? ''),
      cargo_nombre: String(vac.cargo_nombre ?? ''),
      sede_nombre: String(vac.sede_nombre ?? ''),
      generado_por_uid: req.auth.uid,
      generado_en: ahora,
      modo: 'difusion', // v1 simple: el mensaje es genérico, no personal
      mensaje_template: plantilla,
      mensaje_usado: mensajeUsado,
      link_landing: linkLanding,
      // Estos contadores no aplican en v1 simple — quedan en 0 para no
      // romper el dashboard de la vacante que ya lee este campo.
      tecnicos_incluidos: 0,
      tecnicos_excluidos: {
        opt_out: 0,
        sin_celular: 0,
        antiguedad: 0,
        manual: 0,
        otra_sede: 0,
      },
      marcada_como_enviada: true,
      marcada_enviada_en: ahora,
      marcada_enviada_por_uid: req.auth.uid,
      creado_en: ahora,
      creado_por: req.auth.uid,
      actualizado_en: ahora,
      actualizado_por: req.auth.uid,
    });

    await db.collection('eventos').add({
      tipo: 'referidos_marcadas_enviadas',
      generacion_id: generacionId,
      vacante_id: vacanteId,
      plantilla,
      marcada_por_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[referidos] generación marcada como enviada (v1 simple)', {
      vacante_id: vacanteId,
      generacion_id: generacionId,
      plantilla,
    });

    return { ok: true as const, generacion_id: generacionId };
  },
);
