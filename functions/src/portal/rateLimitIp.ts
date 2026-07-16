import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
import { leerConfigSeguridadPortal } from './seguridadPortal';

/**
 * rateLimitIp · RED DE SEGURIDAD por IP para el acceso por cédula del portal,
 * ADICIONAL al bloqueo INDIVIDUAL por token (verificarCedula).
 *
 * Diseño (corrige el bloqueo "global" de una oficina):
 *  - Cuenta SOLO los FALLOS de cédula, nunca los accesos exitosos. Un login bueno
 *    no consume el cupo de la IP → una oficina/NAT en uso normal no se frena.
 *  - Umbral ALTO y configurable (`configuracion_global/portal_seguridad`): muchas
 *    personas tras la misma IP pública (oficina, VPN, NAT de operador) no llegan
 *    al límite con sus tecleos normales, pero un bot que rota tokens sí.
 *  - El CHEQUEO de bloqueo (`ipBloqueada`) es de solo-lectura y va ANTES de tocar
 *    la cédula; el INCREMENTO (`registrarFalloIp`) ocurre DESPUÉS, solo si la
 *    cédula falló, dentro de una transacción (ráfagas concurrentes no diluyen el
 *    contador).
 *
 * Nota: esta capa por IP es una defensa "soft"/best-effort, no un límite duro
 * por request. Como el chequeo es solo-lectura, un burst concurrente puede colar
 * unos pocos requests antes de que el bloqueo quede fijado (el CONTADOR sí es
 * atómico, así que el umbral se cruza igual). El freno DURO e individual es
 * `verificarCedula` (por token, transaccional, 5 fallos): ese es el control
 * primario; la red por IP solo ataja abuso masivo que rota tokens.
 */

export interface ResultadoRateLimit {
  ok: boolean;
  bloqueado_segundos: number;
}

/** Normaliza la IP a una key de documento estable. */
function keyDeIp(ip: string): string {
  return (ip || 'desconocida').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80) || 'desconocida';
}

/**
 * Chequeo de solo-lectura: ¿esta IP está actualmente bloqueada? Se llama UPFRONT
 * (antes de verificar la cédula) para rechazar rápido sin tocar contadores.
 */
export async function ipBloqueada(ip: string): Promise<ResultadoRateLimit> {
  // Sin IP identificable no se bloquea: si no, TODOS los candidatos sin IP caen
  // en el mismo balde "desconocida" y se bloquean entre sí (revisión 16-jul). El
  // rate-limit por TOKEN (verificarCedula) sigue protegiendo cada identidad.
  if (!ip) return { ok: true, bloqueado_segundos: 0 };
  const ref = db.collection('rate_limit_cedula').doc(keyDeIp(ip));
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, bloqueado_segundos: 0 };

  const d = snap.data() as Record<string, unknown>;
  const ahora = Date.now();
  const bloqueadoHasta = d.bloqueado_hasta as Timestamp | undefined;
  if (
    bloqueadoHasta &&
    typeof bloqueadoHasta.toMillis === 'function' &&
    bloqueadoHasta.toMillis() > ahora
  ) {
    return { ok: false, bloqueado_segundos: Math.ceil((bloqueadoHasta.toMillis() - ahora) / 1000) };
  }
  return { ok: true, bloqueado_segundos: 0 };
}

/**
 * Registra UN fallo de cédula para la IP (cuenta dentro de la ventana móvil) y, si
 * se supera el umbral, bloquea la IP por el tiempo configurado. Solo debe llamarse
 * cuando la cédula realmente falló. Devuelve el estado resultante (ok:false si
 * acaba de quedar bloqueada). Todo transaccional.
 */
export async function registrarFalloIp(ip: string): Promise<ResultadoRateLimit> {
  if (!ip) return { ok: true, bloqueado_segundos: 0 };
  const cfg = await leerConfigSeguridadPortal();
  const ref = db.collection('rate_limit_cedula').doc(keyDeIp(ip));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ahora = Date.now();
    const d = (snap.exists ? snap.data() : {}) as Record<string, unknown>;

    // Ya bloqueada → devolver el remanente sin re-extender.
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

    // Ventana expirada (o primer fallo) → reiniciar contador.
    if (ahora - ventanaInicio > cfg.ventana_ip_min * 60 * 1000) {
      tx.set(
        ref,
        { intentos: 1, ventana_inicio: Timestamp.fromMillis(ahora), bloqueado_hasta: null },
        { merge: true },
      );
      return { ok: true, bloqueado_segundos: 0 };
    }

    const intentos = Number(d.intentos ?? 0) + 1;
    if (intentos >= cfg.max_intentos_ip) {
      tx.set(
        ref,
        { intentos, bloqueado_hasta: Timestamp.fromMillis(ahora + cfg.bloqueo_ip_min * 60 * 1000) },
        { merge: true },
      );
      return { ok: false, bloqueado_segundos: cfg.bloqueo_ip_min * 60 };
    }
    tx.set(ref, { intentos }, { merge: true });
    return { ok: true, bloqueado_segundos: 0 };
  });
}
