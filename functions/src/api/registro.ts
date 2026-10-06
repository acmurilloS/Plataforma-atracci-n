import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { COL_LLAVES, COL_REGISTRO } from './catalogo';

/**
 * Registro de peticiones: una fila por petición, TAMBIÉN cuando se rechaza (si
 * la llave no existe, la fila igual se escribe con nulos: "alguien intentó
 * entrar y no pudo" es justo lo que hay que poder ver después). Nunca el
 * secreto, solo a qué llave pertenecía.
 *
 * Sin referencia dura a la integración, a propósito: si algún día se borra una
 * integración, su rastro sobrevive.
 *
 * La guardia ESPERA esta escritura antes de responder: en Cloud Functions una
 * escritura "en segundo plano" se pierde cuando la función termina.
 */
export interface FilaRegistro {
  integracion_id: string | null;
  llave_id: string | null;
  llave_prefijo: string | null;
  metodo: string;
  ruta: string;
  status: number;
  duracion_ms: number;
  ip: string | null;
  error: string | null;
  limite_degradado: boolean;
}

export async function registrarPeticion(fila: FilaRegistro): Promise<void> {
  try {
    await db.collection(COL_REGISTRO).add({ ...fila, en: FieldValue.serverTimestamp() });
  } catch (e) {
    logger.warn('[api] no se pudo escribir el registro', {
      ruta: fila.ruta,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}

/** "Última vez que se usó" la llave (mismo cuidado: se espera, no se suelta). */
export async function marcarUsoLlave(llaveId: string): Promise<void> {
  try {
    await db.collection(COL_LLAVES).doc(llaveId).update({ ultimo_uso_en: FieldValue.serverTimestamp() });
  } catch (e) {
    logger.warn('[api] no se pudo marcar el uso de la llave', {
      llaveId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}
