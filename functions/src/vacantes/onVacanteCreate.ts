import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { avisarCondicionesCultura } from './avisarCondicionesCultura';

// Necesarios para que el aviso a Cultura y Desarrollo (Diego) salga por Gmail.
const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

/**
 * Consecutivo como lo maneja Karen (jul-2026): EMPRESA-CIUDAD-NÚMERO, SIN año.
 *  - Empresa en código corto: EQT→ET, CUM→CU, ING→IG, LAP→LT.
 *  - Sede por CIUDAD (sin el prefijo de empresa del catálogo): CMO/IMO/LMO→MOS,
 *    CBO/IBO→BOG, CME→MED, CCL→CAL, CIB→IBA, CBA→BAR, CDU→DUI, CVI→VIL.
 *  - Número corre por empresa (contador único), sin ceros a la izquierda.
 * Ej.: EQT + MOS + 1004 → "ET-MOS-1004".
 */
export const EMPRESA_CONSEC: Record<string, string> = {
  EQT: 'ET',
  CUM: 'CU',
  ING: 'IG',
  LAP: 'LT',
};
export const SEDE_CONSEC: Record<string, string> = {
  MOS: 'MOS', BOG: 'BOG', // Equitel
  CMO: 'MOS', CBO: 'BOG', CME: 'MED', CCL: 'CAL', CIB: 'IBA', CBA: 'BAR', CDU: 'DUI', CVI: 'VIL', // Cummins
  IMO: 'MOS', IBO: 'BOG', // Ingenergía
  LMO: 'MOS', // LAP
};
export function formatearConsecutivo(empresa: string, sede: string, numero: number): string {
  const e = EMPRESA_CONSEC[empresa] ?? empresa;
  const s = SEDE_CONSEC[sede] ?? sede;
  return `${e}-${s}-${numero}`;
}

export const onVacanteCreate = onDocumentCreated(
  {
    document: 'vacantes/{vacanteId}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();

    if (typeof data.consecutivo === 'string' && data.consecutivo.length > 0) {
      return;
    }

    const empresa = String(data.empresa_codigo ?? '');
    const sede = String(data.sede_codigo ?? '');
    if (!empresa || !sede) {
      logger.error('Vacante sin empresa_codigo o sede_codigo', { id: snap.id });
      return;
    }

    // Consecutivo POR EMPRESA (reu Karen jul-2026): cada empresa lleva un único
    // conteo de procesos, continuo entre sedes ("por cada empresa vamos en número
    // de procesos distintos"). El número no se reinicia por sede ni por año (el
    // formato ya NO lleva año). Los contadores se siembran con el número real de
    // cada empresa (CUM/EQT/ING/LAP) para continuar desde donde va Karen.
    const contadorId = empresa;
    const contadorRef = db.collection('contadores').doc(contadorId);

    try {
      const numero = await db.runTransaction(async (tx) => {
        const doc = await tx.get(contadorRef);
        const current = doc.exists ? Number(doc.data()?.ultimo_numero ?? 0) : 0;
        const next = current + 1;
        if (doc.exists) {
          tx.update(contadorRef, {
            ultimo_numero: next,
            actualizado_en: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(contadorRef, {
            id: contadorId,
            empresa_codigo: empresa,
            ultimo_numero: next,
            creado_en: FieldValue.serverTimestamp(),
            actualizado_en: FieldValue.serverTimestamp(),
          });
        }
        return next;
      });

      const consecutivo = formatearConsecutivo(empresa, sede, numero);
      await snap.ref.update({
        consecutivo,
        actualizado_en: FieldValue.serverTimestamp(),
      });

      await db.collection('eventos').add({
        tipo: 'vacante.consecutivo_asignado',
        entidad_tipo: 'vacante',
        entidad_id: snap.id,
        vacante_id: snap.id,
        autor_uid: 'system',
        autor_rol: 'system',
        payload: { consecutivo, numero },
        creado_en: FieldValue.serverTimestamp(),
      });

      logger.info('Consecutivo asignado', { vacante_id: snap.id, consecutivo });

      // Aviso a Cultura y Desarrollo (Diego) para que valide las condiciones —
      // SOLO después de asignar bien el consecutivo. Si la transacción anterior
      // falla, caemos al catch de abajo y NO enviamos correo de una vacante mal
      // formada. Va en su propio try/catch: un fallo de correo no debe tumbar el
      // trigger. avisarCondicionesCultura re-lee la vacante, así el correo ya
      // incluye el consecutivo recién puesto.
      try {
        const r = await avisarCondicionesCultura(snap.id);
        logger.info('onVacanteCreate · aviso a cultura', { vacante_id: snap.id, estado: r.estado });
      } catch (e) {
        logger.error('onVacanteCreate · error avisando a cultura', {
          vacante_id: snap.id,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    } catch (err) {
      logger.error('Error asignando consecutivo', { vacante_id: snap.id, err: String(err) });
    }
  },
);
