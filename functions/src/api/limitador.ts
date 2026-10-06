import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { COL_LIMITE } from './catalogo';

/**
 * Tope de peticiones por minuto, detrás de una interfaz: cambiar de proveedor
 * es escribir otra clase, no tocar un endpoint.
 *
 * En serverless un contador en memoria NO sirve (cada petición puede caer en
 * otra instancia), así que el contador vive en Firestore: un doc por llave y
 * minuto, incrementado en transacción.
 *
 * FALLA ABIERTO, y es una decisión escrita: si Firestore no responde, la
 * petición pasa. Lo contrario convertiría una caída del contador en una caída
 * de toda la API. Pero no es invisible: el veredicto sale `degradado: true` y
 * la guardia lo escribe en el registro aunque la petición saliera bien.
 *
 * Los docs llevan `expira_en` (2 minutos después del bucket) para una política
 * TTL de Firestore sobre `api_limite.expira_en` (se activa en la consola; si no
 * está activa, quedan docs pequeños que no afectan la lógica).
 */

export interface Veredicto {
  permitido: boolean;
  restantes: number;
  reintentarEnSeg: number;
  degradado: boolean;
}

export interface Limitador {
  consumir(llaveId: string, topePorMin: number): Promise<Veredicto>;
}

export class LimitadorFirestore implements Limitador {
  async consumir(llaveId: string, topePorMin: number): Promise<Veredicto> {
    const ahoraMs = Date.now();
    const bucket = Math.floor(ahoraMs / 60_000);
    const reintentarEnSeg = 60 - Math.floor((ahoraMs / 1000) % 60);
    const ref = db.collection(COL_LIMITE).doc(`${llaveId}_${bucket}`);
    try {
      const n = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const actual = Number(snap.data()?.n ?? 0) + 1;
        tx.set(
          ref,
          {
            llave_id: llaveId,
            bucket,
            n: actual,
            expira_en: Timestamp.fromMillis((bucket + 2) * 60_000),
          },
          { merge: true },
        );
        return actual;
      });
      return {
        permitido: n <= topePorMin,
        restantes: Math.max(0, topePorMin - n),
        reintentarEnSeg,
        degradado: false,
      };
    } catch (e) {
      logger.warn('[api] limitador degradado: deja pasar', {
        llaveId,
        msg: e instanceof Error ? e.message : String(e),
      });
      return { permitido: true, restantes: topePorMin, reintentarEnSeg: 0, degradado: true };
    }
  }
}

export const limitador: Limitador = new LimitadorFirestore();
