import { logger } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * reportarFalloSubidaPortal · diagnóstico de subidas fallidas del portal
 * (incidente 08-oct-2026: una candidata no pudo subir sus documentos y solo
 * había un pantallazo para saber por qué).
 *
 * El portal llama aquí (best-effort) cada vez que una subida falla, con el tipo
 * que reportó el navegador, el detectado, el tamaño y el código de error. Solo
 * escribe en Cloud Logging (`logger.warn`), nunca en Firestore: no guarda PII
 * ni deja que un anónimo llene la base. Valida que el token exista.
 *
 * Para revisar: Logging → "[portal] subida fallida".
 */
const corto = (v: unknown, n: number) => String(v ?? '').slice(0, n);

export const reportarFalloSubidaPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = corto(req.data?.token, 20).trim();
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) return { ok: false as const };
  const snap = await db.collection('portal_candidato_tokens').doc(token).get();
  if (!snap.exists) return { ok: false as const };
  const nombre = corto(req.data?.nombre_archivo, 160);
  logger.warn('[portal] subida fallida', {
    token,
    postulacion_id: snap.data()?.postulacion_id ?? null,
    clave: corto(req.data?.clave, 60),
    extension: (/\.([A-Za-z0-9]{1,5})$/.exec(nombre)?.[1] ?? '').toLowerCase(),
    tipo_navegador: corto(req.data?.tipo_navegador, 100),
    tipo_detectado: corto(req.data?.tipo_detectado, 100),
    tamano_bytes: Number(req.data?.tamano_bytes ?? 0) || 0,
    codigo: corto(req.data?.codigo, 80),
    mensaje: corto(req.data?.mensaje, 300),
    con_sesion: !!req.auth,
    user_agent: corto(req.rawRequest?.headers?.['user-agent'], 300),
  });
  return { ok: true as const };
});
