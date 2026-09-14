import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { asegurarFolder, borrarDeDrive, subirBufferAFolder } from './cliente';
import { carpetaListaParaDrive, ejecutarDepositoDrive } from './sincronizarCarpeta';

const GDRIVE_SERVICE_ACCOUNT_JSON = defineSecret('GDRIVE_SERVICE_ACCOUNT_JSON');

/**
 * probarConexionDrive · health-check desde Admin → Integraciones.
 *
 * Crea `_SISTEMA/health-check`, sube un archivo de prueba (valida escritura) y
 * borra TODO el rastro (`_SISTEMA` completo) al terminar — no deja artefactos en
 * la unidad. Valida que la cuenta de servicio sea miembro y que el ID sea correcto.
 */
export const probarConexionDrive = onCall(
  { region: 'us-central1', secrets: [GDRIVE_SERVICE_ACCOUNT_JSON] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    if ((req.auth.token.rol as string) !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin puede probar la conexión.');
    }
    const unidadId = String(req.data?.unidad_compartida_id ?? '').trim();
    if (!unidadId) throw new HttpsError('invalid-argument', 'Falta el ID de la unidad compartida.');
    try {
      const sistemaId = await asegurarFolder({ parentId: unidadId, nombre: '_SISTEMA' });
      const healthId = await asegurarFolder({ parentId: sistemaId, nombre: 'health-check' });
      // Subir un archivo valida que la SA puede ESCRIBIR (no solo crear carpetas).
      await subirBufferAFolder({
        parentId: healthId,
        nombre: `prueba-${Date.now()}.txt`,
        buffer: Buffer.from('ok ' + new Date().toISOString(), 'utf8'),
        mimeType: 'text/plain',
      });
      // Auto-limpieza: borra TODO el rastro de la prueba (_SISTEMA + lo que contenga)
      // para no dejar artefactos en la unidad real.
      try {
        await borrarDeDrive(sistemaId);
      } catch {
        /* best-effort: a lo sumo queda la carpeta _SISTEMA vacía, nunca suelto en la raíz */
      }
      return {
        ok: true as const,
        mensaje: 'Conexión OK: la cuenta de servicio puede escribir en la unidad.',
      };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      throw new HttpsError(
        'internal',
        'No se pudo conectar a la unidad. Verifica que la cuenta de servicio sea miembro (Administrador de contenido) y que el ID sea correcto. Detalle: ' +
          m,
      );
    }
  },
);

const MSG_CARPETA_ANULADA = 'Esta carpeta fue anulada; no se deposita en Drive.';

/**
 * sincronizarCarpetaDrive · reintento MANUAL del depósito (botón en CarpetasPage).
 * Solo si la carpeta llega al 85% de CyD (carpetaListaParaDrive). Idempotente (no
 * duplica). Rechaza carpetas 'anuladas' y postulaciones terminales (reu Karen
 * 10-sep): el proceso viejo de un repostulado escribiría en la misma subcarpeta
 * del candidato que el nuevo.
 */
export const sincronizarCarpetaDrive = onCall(
  { region: 'us-central1', secrets: [GDRIVE_SERVICE_ACCOUNT_JSON], timeoutSeconds: 300, memory: '512MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['gh', 'coordinador', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }
    const carpetaId = String(req.data?.carpeta_id ?? '').trim();
    if (!carpetaId) throw new HttpsError('invalid-argument', 'Falta carpeta_id.');
    const carpetaRef = db.collection('carpetas_digitales').doc(carpetaId);
    const carpetaSnap = await carpetaRef.get();
    if (!carpetaSnap.exists) throw new HttpsError('not-found', 'La carpeta no existe.');
    // Anulada → mensaje claro ANTES del chequeo del 85% (el lock lo re-valida abajo).
    if (carpetaSnap.data()?.estado === 'anulada') {
      throw new HttpsError('failed-precondition', MSG_CARPETA_ANULADA);
    }
    const postulacionId = String(carpetaSnap.data()?.postulacion_id ?? '');
    if (!postulacionId) throw new HttpsError('failed-precondition', 'La carpeta no tiene postulación.');

    if (!(await carpetaListaParaDrive(postulacionId))) {
      throw new HttpsError(
        'failed-precondition',
        'La carpeta aún no llega al 85% de Cultura y Desarrollo; no se deposita todavía.',
      );
    }

    // Reintento manual de GH: permite re-sincronizar para subir lo que llegó tarde
    // (contrato/afiliaciones) aunque ya se haya depositado antes.
    const r = await ejecutarDepositoDrive(carpetaRef, postulacionId, true);
    if (r.estado === 'ok') {
      return { ok: true as const, drive_carpeta_id: r.drive_carpeta_id ?? '', subidos: r.subidos ?? 0 };
    }
    if (r.estado === 'ya_sincronizada') {
      return { ok: true as const, drive_carpeta_id: '', subidos: 0 };
    }
    if (r.estado === 'ocupado') {
      throw new HttpsError('aborted', 'Ya hay una sincronización en curso; intenta en un momento.');
    }
    // El lock re-valida en transacción: la carpeta pudo anularse (o su postulación
    // terminar) entre la lectura de arriba y el depósito.
    if (r.estado === 'anulada') {
      throw new HttpsError('failed-precondition', MSG_CARPETA_ANULADA);
    }
    if (r.estado === 'postulacion_terminal') {
      throw new HttpsError(
        'failed-precondition',
        'El proceso de esta postulación ya terminó; su carpeta no se deposita en Drive.',
      );
    }
    throw new HttpsError('internal', r.error ?? 'No se pudo sincronizar a Drive.');
  },
);
