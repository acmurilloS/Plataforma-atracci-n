import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../utils/admin';

/**
 * rateLimitIp · freno por IP para el acceso por cédula del portal (defensa
 * adicional al bloqueo por token de verificarCedula). Cuenta los intentos de una
 * misma IP en una ventana y, si se pasa, bloquea temporalmente. Todo dentro de
 * una transacción para que ráfagas concurrentes no diluyan el contador.
 *
 * Umbral generoso (no estorba a un candidato legítimo, que entra en 1–2 intentos)
 * pero corta la fuerza bruta automatizada aunque rote tokens.
 */

const MAX_INTENTOS_IP = 20;
const VENTANA_MIN = 15;
const BLOQUEO_MIN = 30;

export interface ResultadoRateLimit {
  ok: boolean;
  bloqueado_segundos: number;
}

export async function chequearRateLimitIp(ip: string): Promise<ResultadoRateLimit> {
  const key = (ip || 'desconocida').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80) || 'desconocida';
  const ref = db.collection('rate_limit_cedula').doc(key);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ahora = Date.now();
    const d = (snap.exists ? snap.data() : {}) as Record<string, unknown>;

    const bloqueadoHasta = d.bloqueado_hasta as Timestamp | undefined;
    if (
      bloqueadoHasta &&
      typeof bloqueadoHasta.toMillis === 'function' &&
      bloqueadoHasta.toMillis() > ahora
    ) {
      return { ok: false, bloqueado_segundos: Math.ceil((bloqueadoHasta.toMillis() - ahora) / 1000) };
    }

    const ventana = d.ventana_inicio as Timestamp | undefined;
    const ventanaInicio = ventana && typeof ventana.toMillis === 'function' ? ventana.toMillis() : 0;

    // Ventana expirada (o primera vez) → reiniciar contador.
    if (ahora - ventanaInicio > VENTANA_MIN * 60 * 1000) {
      tx.set(
        ref,
        { intentos: 1, ventana_inicio: Timestamp.fromMillis(ahora), bloqueado_hasta: null },
        { merge: true },
      );
      return { ok: true, bloqueado_segundos: 0 };
    }

    const intentos = Number(d.intentos ?? 0) + 1;
    if (intentos > MAX_INTENTOS_IP) {
      tx.set(
        ref,
        { intentos, bloqueado_hasta: Timestamp.fromMillis(ahora + BLOQUEO_MIN * 60 * 1000) },
        { merge: true },
      );
      return { ok: false, bloqueado_segundos: BLOQUEO_MIN * 60 };
    }
    tx.set(ref, { intentos }, { merge: true });
    return { ok: true, bloqueado_segundos: 0 };
  });
}
