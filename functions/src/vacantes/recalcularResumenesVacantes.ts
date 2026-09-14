import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { reconciliarResumenes } from './resumenPostulaciones';

/**
 * recalcularResumenesVacantes · reconciliación de `vacantes_resumen` contra las
 * postulaciones reales (fase real en Seguimiento, reu Karen 10-sep).
 *
 *  - Callable (solo admin): la carga inicial tras el deploy (las vacantes que no
 *    han tenido movimiento no tienen resumen) y cualquier revisión manual.
 *    `dry_run` es TRUE por defecto: solo reporta qué cambiaría; para escribir hay
 *    que mandar `dry_run: false` explícito.
 *  - Programada diaria 03:00 Bogotá: red de seguridad por si un evento del
 *    trigger se perdió o agotó reintentos; también borra resúmenes huérfanos.
 *
 * El detalle solo trae consecutivos y conteos por estado — sin nombres.
 */

// Recorre todas las vacantes: holgura sobre el timeout por defecto (60 s).
const TIMEOUT_S = 540;

export const recalcularResumenesVacantes = onCall(
  { region: 'us-central1', timeoutSeconds: TIMEOUT_S },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    if (String(req.auth.token.rol ?? '') !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin.');
    }

    const dryRun = req.data?.dry_run !== false;
    const res = await reconciliarResumenes({ dryRun });

    logger.info('[recalcularResumenesVacantes] manual', {
      dry_run: dryRun,
      por: req.auth.uid,
      revisadas: res.revisadas,
      cambiadas: res.cambiadas,
      errores: res.errores,
    });
    return { ok: true as const, dry_run: dryRun, ...res };
  },
);

// Scheduled: todos los días 03:00 Bogotá (fuera de horario de las analistas).
export const recalcularResumenesVacantesDiario = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'America/Bogota',
    region: 'us-central1',
    timeoutSeconds: TIMEOUT_S,
  },
  async () => {
    const res = await reconciliarResumenes({ dryRun: false });
    // `cambiadas` incluye el primer resumen (en cero) de vacantes nuevas sin
    // movimiento; conteos distintos en vacantes con candidatos sí delatan
    // eventos perdidos del trigger. El detalle se recorta para el log.
    const payload = {
      revisadas: res.revisadas,
      cambiadas: res.cambiadas,
      errores: res.errores,
      detalle: res.detalle.slice(0, 50),
    };
    if (res.errores > 0) {
      logger.error('[recalcularResumenesVacantes] reconciliación diaria con errores', payload);
    } else {
      logger.info('[recalcularResumenesVacantes] reconciliación diaria', payload);
    }
  },
);
