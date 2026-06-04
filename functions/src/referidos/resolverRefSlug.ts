import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * Resuelve un slug `?ref=<slug>` de la landing pública a {cedula, nombre} del
 * técnico referidor.
 *
 * La callable acepta auth anónima — la landing pública la usa sin login real.
 * Si el slug no existe o está malformado, devuelve `null` y la postulación
 * sigue sin marca de referido (no rompemos el flujo del candidato).
 */
export const resolverRefSlug = onCall(
  { region: 'us-central1' },
  async (req) => {
    const slug = String(req.data?.slug ?? '').trim();
    if (!slug) {
      throw new HttpsError('invalid-argument', 'Falta slug.');
    }

    // Aceptamos cualquier slug bien formado: 8-12 chars alfanuméricos.
    // Si llega algo raro, devolvemos null silenciosamente para no exponer
    // detalles al frontend público.
    if (!/^[A-Za-z0-9]{8,12}$/.test(slug)) {
      return { encontrado: false as const };
    }

    const snap = await db.collection('referidos_links').doc(slug).get();
    if (!snap.exists) {
      logger.info('[referidos] slug no encontrado', { slug });
      return { encontrado: false as const };
    }

    const d = snap.data() as Record<string, unknown>;
    return {
      encontrado: true as const,
      cedula_tecnico: String(d.cedula_tecnico ?? ''),
      nombre_tecnico: String(d.nombre_tecnico ?? ''),
      generacion_id: String(d.generacion_id ?? ''),
    };
  },
);
