import { db } from '../utils/admin';

/**
 * Piezas compartidas del reloj del líder (punto 7) entre el trigger que lo arma
 * (onVacanteEnvioLider) y el programador horario (recordatoriosLider).
 */

/** Estados de vacante en los que el reloj tiene sentido (y se puede suspender). */
export const ESTADOS_RELOJ_APLICA = [
  'aprobada',
  'lista_para_publicar',
  'publicada',
  'en_proceso',
  'terna_enviada',
];

/** Un candidato aquí ya pasó por la decisión del líder: el reloj no aplica. */
export const ESTADOS_CANDIDATO_AVANZADO = [
  'seleccionado_por_lider',
  'en_examenes_medicos',
  'en_contratacion',
  'contratado',
];

export function tsMs(ts: unknown): number | null {
  const t = ts as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
}

/**
 * ¿El líder ya respondió? Devuelve el motivo o null.
 *  - candidato en seleccionado/exámenes/contratación/contratado → 'candidato_avanzo'
 *  - `desdeMs` null (al armar): cualquier entrevista 'lider' no cancelada → 'entrevista_lider'
 *  - `desdeMs` con valor (programador): entrevista 'lider' no cancelada creada o
 *    programada desde el inicio del reloj → 'entrevista_lider'; descarte del
 *    líder desde el inicio → 'descarte_lider'.
 * Las entrevistas no traen vacante_id: se resuelven vía las postulaciones.
 */
export async function liderYaRespondio(vacanteId: string, desdeMs: number | null): Promise<string | null> {
  const posts = await db.collection('postulaciones').where('vacante_id', '==', vacanteId).get();
  if (posts.docs.some((d) => ESTADOS_CANDIDATO_AVANZADO.includes(String(d.data().estado ?? '')))) {
    return 'candidato_avanzo';
  }
  if (
    desdeMs !== null &&
    posts.docs.some((d) => (tsMs(d.data().marcas?.descartado_en) ?? 0) >= desdeMs)
  ) {
    return 'descarte_lider';
  }
  const ids = posts.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db
      .collection('entrevistas')
      .where('postulacion_id', 'in', ids.slice(i, i + 30))
      .get();
    for (const e of snap.docs) {
      const x = e.data();
      if (x.tipo !== 'lider' || x.estado === 'cancelada') continue;
      if (desdeMs === null) return 'entrevista_lider';
      if ((tsMs(x.creado_en) ?? 0) >= desdeMs || (tsMs(x.programada_para) ?? 0) >= desdeMs) {
        return 'entrevista_lider';
      }
    }
  }
  return null;
}
