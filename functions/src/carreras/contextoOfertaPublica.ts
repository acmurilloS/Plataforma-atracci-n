import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * Contexto público de una oferta para la landing (`/carreras/:id`).
 *
 * Por qué existe: la landing corre con Auth ANÓNIMA, y antes leía tres
 * colecciones directo del cliente para pintar la oferta:
 *   - `configuracion_global/consentimiento_registro` (versión + link de la política)
 *   - `procesos/{proceso_activo_id}` (criterios del perfilamiento)
 *   - `cargos_catalogo/{cargo_id}` (descripción del cargo)
 * Como `signedIn()` es true para el token anónimo, esas reglas obligaban a dejar
 * las tres colecciones abiertas a cualquiera en internet — y ahí viven la banda
 * salarial del cargo, las empresas competencia del perfilamiento y la config de
 * las integraciones (auditoría de PII, 15-jul).
 *
 * Ahora el cliente NO lee esas colecciones: esta callable las lee con Admin SDK
 * y devuelve SOLO los dos textos que la oferta muestra. Las reglas quedan
 * cerradas a `interno()` sin que la landing pierda nada.
 *
 * Acepta anónimos (y hasta sin auth): es una oferta pública, igual que
 * `resolverRefSlug`. No expone nada que no estuviera ya destinado al candidato.
 */
export const contextoOfertaPublica = onCall({ region: 'us-central1' }, async (req) => {
  const vacanteId = String(req.data?.vacante_id ?? '').trim();
  if (!vacanteId) {
    throw new HttpsError('invalid-argument', 'Falta vacante_id.');
  }

  // Consentimiento (Habeas Data): versión + URL de la política vigente. Si el
  // doc no existe, devolvemos null y la landing usa su respaldo embebido.
  let consent: { version: string; politica_url: string } | null = null;
  try {
    const cs = await db.collection('configuracion_global').doc('consentimiento_registro').get();
    if (cs.exists) {
      const d = cs.data() as Record<string, unknown>;
      consent = {
        version: String(d.version ?? ''),
        politica_url: String(d.politica_url ?? ''),
      };
    }
  } catch (e) {
    logger.warn('[carreras] no se pudo leer el consentimiento', { e });
  }

  // Contexto del cargo: primero los criterios del perfilamiento (lo que el líder
  // definió para ESTA vacante); si no hay, la descripción del catálogo. La
  // justificación de la vacante NUNCA sale — es interna.
  let contexto = '';
  try {
    const vs = await db.collection('vacantes').doc(vacanteId).get();
    if (!vs.exists) {
      return { contexto: '', consent };
    }
    const vac = vs.data() as { proceso_activo_id?: string; cargo_id?: string };

    if (vac.proceso_activo_id) {
      const ps = await db.collection('procesos').doc(vac.proceso_activo_id).get();
      const perf = ps.exists
        ? (ps.data() as { perfilamiento?: { criterios_texto?: string } }).perfilamiento
        : null;
      contexto = String(perf?.criterios_texto ?? '').trim();
    }
    if (!contexto && vac.cargo_id) {
      const cs = await db.collection('cargos_catalogo').doc(vac.cargo_id).get();
      contexto = cs.exists
        ? String((cs.data() as { descripcion?: string }).descripcion ?? '').trim()
        : '';
    }
  } catch (e) {
    logger.warn('[carreras] no se pudo armar el contexto del cargo', { vacanteId, e });
  }

  return { contexto, consent };
});
