import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { codigoError, type ArchivoListo } from '../utils/archivos';

/**
 * Avisa (best-effort, sin bloquear ni mostrar nada) que una subida del portal
 * falló, para poder diagnosticarla en Cloud Logging sin depender de un
 * pantallazo del candidato. Ver functions/src/portal/reportarFalloSubidaPortal.ts.
 */
export function reportarFalloSubidaPortal(opts: {
  token: string;
  clave: string;
  file: File;
  error: unknown;
  listo?: ArchivoListo | null;
}): void {
  const { token, clave, file, error, listo } = opts;
  const fn = httpsCallable(functions, 'reportarFalloSubidaPortal');
  void fn({
    token,
    clave,
    nombre_archivo: file.name,
    tipo_navegador: file.type || '(vacío)',
    tipo_detectado: listo?.contentType ?? '',
    tamano_bytes: file.size,
    codigo: codigoError(error) || (error instanceof Error ? error.name : ''),
    mensaje: error instanceof Error ? error.message : String(error),
  }).catch(() => undefined);
}
