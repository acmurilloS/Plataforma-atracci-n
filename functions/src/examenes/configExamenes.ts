import { db } from '../utils/admin';

export interface ConfigExamenes {
  /** true SOLO si está prendido Y hay al menos un correo de prueba (no deja sin destino). */
  modo_prueba: boolean;
  /** Correo(s) de prueba (ej. el de Karen) a donde se redirige en modo prueba. */
  correo_prueba: string[];
  /** En modo prueba, ¿también se redirige el correo del candidato? (default true). */
  redirige_candidato: boolean;
}

/**
 * Lee `configuracion_global/examenes_medicos` (interruptor de modo prueba para la
 * demo). Provider-agnostic: solo decide A QUIÉN se envía, no CÓMO. Fallback
 * seguro: sin doc o sin correo_prueba → modo_prueba false (envío real). Mismo
 * patrón que `leerPlantillas()`.
 */
export async function leerConfigExamenes(): Promise<ConfigExamenes> {
  try {
    const snap = await db.collection('configuracion_global').doc('examenes_medicos').get();
    const d = (snap.exists ? snap.data() : {}) ?? {};
    const raw = d.correo_prueba;
    const correos = Array.isArray(raw)
      ? raw.map((c) => String(c).trim()).filter(Boolean)
      : typeof raw === 'string' && raw.trim()
        ? [raw.trim()]
        : [];
    return {
      modo_prueba: d.modo_prueba === true && correos.length > 0,
      correo_prueba: correos,
      redirige_candidato: d.redirige_candidato !== false,
    };
  } catch {
    return { modo_prueba: false, correo_prueba: [], redirige_candidato: true };
  }
}
