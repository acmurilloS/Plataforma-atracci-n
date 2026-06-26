import { db } from '../utils/admin';

export interface ConfigDrive {
  /** ID de la Unidad Compartida de GH (de la URL de Drive). Configurable en /admin. */
  unidad_compartida_id: string;
  /** Folder dentro de la unidad donde van las subcarpetas de integrantes; '' = raíz. */
  carpeta_padre_id: string;
}

/**
 * Lee `configuracion_global/drive` (destino del depósito de carpetas). El ID de la
 * unidad NO es sensible → va en config (editable desde admin, sin redeploy). La
 * CLAVE de la cuenta de servicio sí va en el secret GDRIVE_SERVICE_ACCOUNT_JSON.
 * Fallback seguro: sin doc → ids vacíos (el caller corta con error claro).
 */
export async function leerConfigDrive(): Promise<ConfigDrive> {
  try {
    const snap = await db.collection('configuracion_global').doc('drive').get();
    const d = (snap.exists ? snap.data() : {}) ?? {};
    return {
      unidad_compartida_id: String(d.unidad_compartida_id ?? '').trim(),
      carpeta_padre_id: String(d.carpeta_padre_id ?? '').trim(),
    };
  } catch {
    return { unidad_compartida_id: '', carpeta_padre_id: '' };
  }
}
