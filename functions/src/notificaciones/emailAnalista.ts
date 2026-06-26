import { db } from '../utils/admin';

/**
 * Resuelve el correo del ANALISTA asignado a una vacante (vía
 * `vacantes/{id}.analista_uid` → `usuarios/{uid}.email`). Devuelve '' si no hay
 * vacante, no hay analista asignado, o no se puede leer. Se usa como `replyTo`
 * de los correos que salen del buzón no-reply de "Steve": el FROM es Steve pero
 * las respuestas deben llegar al analista del proceso, nunca a Steve.
 */
export async function emailAnalistaDeVacante(
  vacanteId: string | null | undefined,
): Promise<string> {
  if (!vacanteId) return '';
  try {
    const v = await db.collection('vacantes').doc(String(vacanteId)).get();
    const uid = String(v.data()?.analista_uid ?? '').trim();
    if (!uid) return '';
    const u = await db.collection('usuarios').doc(uid).get();
    return String(u.data()?.email ?? '').trim();
  } catch {
    return '';
  }
}

/** Igual que `emailAnalistaDeVacante` pero partiendo de una postulación. */
export async function emailAnalistaDePostulacion(
  postulacionId: string | null | undefined,
): Promise<string> {
  if (!postulacionId) return '';
  try {
    const p = await db.collection('postulaciones').doc(String(postulacionId)).get();
    if (!p.exists) return '';
    return emailAnalistaDeVacante(String(p.data()?.vacante_id ?? ''));
  } catch {
    return '';
  }
}

/**
 * Primer correo de coordinador activo (fallback de `replyTo` cuando aún no hay
 * analista asignado, p.ej. en correos que salen al CREAR la vacante). '' si no hay.
 */
export async function emailCoordinadorFallback(): Promise<string> {
  try {
    const cs = await db
      .collection('usuarios')
      .where('rol', '==', 'coordinador')
      .where('activo', '==', true)
      .get();
    const correos = cs.docs.map((c) => String(c.data()?.email ?? '').trim()).filter(Boolean);
    return correos[0] ?? '';
  } catch {
    return '';
  }
}
