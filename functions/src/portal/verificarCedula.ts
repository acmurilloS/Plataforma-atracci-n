import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from '../utils/admin';

/**
 * verificarCedula · 2º factor del Portal del Candidato (F1).
 *
 * El token da acceso al link, pero NO autoriza por sí solo: el candidato debe
 * confirmar su cédula (la misma que quedó en el snapshot del token) antes de que
 * el resolver entregue cualquier PII. La cédula se re-valida en cada escritura.
 *
 * Anti fuerza-bruta robusto: TODA la verificación (leer intentos → comparar →
 * escribir el contador / bloqueo) ocurre dentro de UNA transacción sobre el doc
 * del token. Así, peticiones concurrentes se serializan y el contador no se puede
 * "diluir" disparando ráfagas en paralelo (cierra el TOCTOU). La comparación es
 * por dígitos (tolera puntos/espacios).
 */

export const MAX_INTENTOS_CEDULA = 5;
export const MINUTOS_BLOQUEO = 15;

/** Deja solo dígitos (tolera "1.234.567", "1 234 567", etc.). */
export function normalizarCedula(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '');
}

export interface ResultadoCedula {
  /** La cédula coincide → se puede entregar PII. */
  ok: boolean;
  /** El 2º factor es obligatorio (siempre true salvo acierto). */
  requiere: boolean;
  /** El token no tiene cédula registrada: NO se entrega PII (portal en preparación). */
  sin_cedula_registrada: boolean;
  /** Está temporalmente bloqueado por demasiados intentos. */
  bloqueado: boolean;
  /** Segundos restantes del bloqueo (0 si no aplica). */
  bloqueado_segundos: number;
  /** Intentos que quedan antes del bloqueo. */
  intentos_restantes: number;
}

/**
 * Verifica la cédula contra el snapshot del token y actualiza los contadores
 * anti fuerza-bruta DENTRO de una transacción (lee el doc fresco, no un snapshot
 * traído por el llamador).
 *
 * - Token sin `documento_numero` → `sin_cedula_registrada:true` y `ok:false`: no
 *   se puede exigir un 2º factor que no existe, pero TAMPOCO se entrega PII (mejor
 *   "portal en preparación" que filtrar datos sin segundo factor).
 * - Bloqueado → `ok:false, bloqueado:true`.
 * - Sin cédula en la petición → `ok:false` (no consume intento).
 * - Acierto → resetea contadores. Fallo → incrementa; al máximo, bloquea.
 */
export async function verificarCedula(
  ref: DocumentReference,
  cedulaInput: string | undefined | null,
): Promise<ResultadoCedula> {
  const entrada = normalizarCedula(cedulaInput);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const t = (snap.data() ?? {}) as Record<string, unknown>;
    const esperada = normalizarCedula(t.documento_numero);

    if (!esperada) {
      return {
        ok: false,
        requiere: true,
        sin_cedula_registrada: true,
        bloqueado: false,
        bloqueado_segundos: 0,
        intentos_restantes: MAX_INTENTOS_CEDULA,
      };
    }

    const ahora = Date.now();
    const bloqueadoHasta = t.bloqueado_hasta as Timestamp | undefined;
    if (
      bloqueadoHasta &&
      typeof bloqueadoHasta.toMillis === 'function' &&
      bloqueadoHasta.toMillis() > ahora
    ) {
      return {
        ok: false,
        requiere: true,
        sin_cedula_registrada: false,
        bloqueado: true,
        bloqueado_segundos: Math.ceil((bloqueadoHasta.toMillis() - ahora) / 1000),
        intentos_restantes: 0,
      };
    }

    const intentosPrevios = Number(t.intentos_cedula ?? 0);
    if (!entrada) {
      return {
        ok: false,
        requiere: true,
        sin_cedula_registrada: false,
        bloqueado: false,
        bloqueado_segundos: 0,
        intentos_restantes: Math.max(0, MAX_INTENTOS_CEDULA - intentosPrevios),
      };
    }

    if (entrada === esperada) {
      if (intentosPrevios > 0 || t.bloqueado_hasta) {
        tx.set(ref, { intentos_cedula: 0, bloqueado_hasta: null }, { merge: true });
      }
      return {
        ok: true,
        requiere: true,
        sin_cedula_registrada: false,
        bloqueado: false,
        bloqueado_segundos: 0,
        intentos_restantes: MAX_INTENTOS_CEDULA,
      };
    }

    // Fallo: incrementar y, si toca, bloquear.
    const intentos = intentosPrevios + 1;
    const update: Record<string, unknown> = { intentos_cedula: intentos };
    let bloqueado = false;
    let bloqueadoSegundos = 0;
    if (intentos >= MAX_INTENTOS_CEDULA) {
      update.bloqueado_hasta = Timestamp.fromMillis(ahora + MINUTOS_BLOQUEO * 60 * 1000);
      bloqueado = true;
      bloqueadoSegundos = MINUTOS_BLOQUEO * 60;
    }
    tx.set(ref, update, { merge: true });

    return {
      ok: false,
      requiere: true,
      sin_cedula_registrada: false,
      bloqueado,
      bloqueado_segundos: bloqueadoSegundos,
      intentos_restantes: Math.max(0, MAX_INTENTOS_CEDULA - intentos),
    };
  });
}
