import { db } from '../utils/admin';

export interface ConfigConexionTalentos {
  /** Destinatarios principales (to) del correo de conexión y talentos. */
  destinatarios: string[];
  /** Copias (cc) — p. ej. Karen para que envíe lo de talentos. */
  copias: string[];
}

/**
 * Lee `configuracion_global/conexion_talentos`: a quién llega el correo del plan
 * de conexión y talentos al contratar. Editable sin deploy, provider-agnostic
 * (solo decide destinatarios). Fallback seguro: arrays vacíos → el caller usa sus
 * valores legacy (José + coordinadores por rol). Mismo patrón que `leerPlantillas`.
 */
export async function leerConfigConexionTalentos(): Promise<ConfigConexionTalentos> {
  const lista = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean)
      : typeof v === 'string' && v.trim()
        ? [v.trim()]
        : [];
  try {
    const snap = await db.collection('configuracion_global').doc('conexion_talentos').get();
    const d = (snap.exists ? snap.data() : {}) ?? {};
    return { destinatarios: lista(d.destinatarios), copias: lista(d.copias) };
  } catch {
    return { destinatarios: [], copias: [] };
  }
}
