import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { leerConfigRelojLider, textoReloj } from '../notificaciones/configRelojLider';
import { calcularPlazos, formatearFechaBogota } from '../notificaciones/plazoRelojLider';
import { ESTADOS_RELOJ_APLICA, liderYaRespondio, tsMs } from '../notificaciones/relojLiderComun';

const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * onVacanteEnvioLider · arma el reloj del líder (reu Karen 09-sep, punto 7).
 *
 * Antes el reloj solo arrancaba con "Cerrar terna" (TernaPage), que las analistas
 * no usan: envían el Concepto de Atracción. Este trigger lo arranca cuando cambia
 * `concepto_enviado_lider_en` (origen 'concepto') o `terna_enviada_en` ('terna').
 *
 * Seguridad (todo apagado mientras la config no sea válida):
 *  - Timestamps comparados por milisegundos; las escrituras del propio reloj no
 *    cambian esos campos, así que no se re-dispara.
 *  - No arma si la config está apagada, si el envío es anterior a `vigente_desde`
 *    (los Conceptos viejos nunca arman), en movimientos internos, en estados donde
 *    no aplica, si el destinatario no tiene rol 'lider', o si el líder ya respondió
 *    (entrevista con líder o candidato avanzado).
 *  - Reenvío con el reloj corriendo: NO reinicia el plazo ni repite el aviso.
 *  - El aviso con la regla sale como notificación (campana + correo vía
 *    onNotificacionCreate, reply-to a la analista); el programador exige que ese
 *    correo haya salido antes de recordar o suspender.
 */
export const onVacanteEnvioLider = onDocumentUpdated(
  { document: 'vacantes/{id}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const conceptoAntes = tsMs(before.concepto_enviado_lider_en);
    const conceptoDespues = tsMs(after.concepto_enviado_lider_en);
    const ternaAntes = tsMs(before.terna_enviada_en);
    const ternaDespues = tsMs(after.terna_enviada_en);

    let origen: 'concepto' | 'terna' | null = null;
    let envioMs: number | null = null;
    if (conceptoDespues !== null && conceptoDespues !== conceptoAntes) {
      origen = 'concepto';
      envioMs = conceptoDespues;
    } else if (ternaDespues !== null && ternaDespues !== ternaAntes) {
      origen = 'terna';
      envioMs = ternaDespues;
    }
    if (!origen || envioMs === null) return;

    const vacanteId = event.params.id;
    const cfg = await leerConfigRelojLider();
    if (!cfg.efectivo) {
      logger.info('[reloj líder] apagado; no se arma', { vacanteId, motivo: cfg.motivoApagado });
      return;
    }
    if (envioMs < cfg.vigenteDesdeMs) {
      logger.info('[reloj líder] envío anterior a la vigencia; no se arma', { vacanteId });
      return;
    }
    if (after.es_movimiento_interno === true) return;
    if (!ESTADOS_RELOJ_APLICA.includes(String(after.estado ?? ''))) return;

    const liderUid = String(after.lider_uid ?? '');
    if (!liderUid) return;
    const lider = (await db.collection('usuarios').doc(liderUid).get()).data();
    if (!lider || lider.rol !== 'lider' || lider.activo === false) {
      logger.info('[reloj líder] el destinatario no es un líder activo; no se arma', { vacanteId });
      return;
    }

    // Fuera de la transacción: consultas de postulaciones/entrevistas y plazos.
    const yaRespondio = await liderYaRespondio(vacanteId, null);
    const inicio = new Date();
    const plazos = await calcularPlazos(inicio, cfg.modoPlazo, cfg.horasRecordatorio, cfg.horasPausa);
    const vacRef = db.collection('vacantes').doc(vacanteId);

    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(vacRef);
      if (!snap.exists) return 'sin_vacante';
      const v = snap.data() ?? {};
      const reloj = (v.reloj_lider ?? null) as Record<string, unknown> | null;
      if (reloj && Number(reloj.envio_ms) === envioMs) return 'duplicado';
      if (reloj && reloj.estado === 'corriendo') {
        tx.update(vacRef, {
          'reloj_lider.envio_ms': envioMs,
          'reloj_lider.reenvios': FieldValue.increment(1),
        });
        return 'reenvio';
      }
      if (yaRespondio) return `no_arma:${yaRespondio}`;

      const notiRef = db.collection('notificaciones').doc();
      tx.set(notiRef, {
        destinatario_uid: liderUid,
        tipo: 'reloj_lider_aviso',
        titulo: `Plazo para agendar la entrevista · ${String(v.consecutivo ?? '')}`,
        mensaje: textoReloj(cfg.textoAvisoLider, {
          nombre: String(v.lider_nombre ?? '').split(' ')[0] ?? '',
          cargo: String(v.cargo_nombre ?? ''),
          consecutivo: String(v.consecutivo ?? ''),
          empresa: String(v.empresa_nombre ?? ''),
          sede: String(v.sede_nombre ?? ''),
          fecha_limite: formatearFechaBogota(plazos.venceEn),
          horas: String(cfg.horasPausa),
          link: `${APP_URL}/vacantes/${vacanteId}/concepto-atraccion`,
        }),
        link:
          origen === 'terna'
            ? `/vacantes/${vacanteId}/terna`
            : `/vacantes/${vacanteId}/concepto-atraccion`,
        vacante_id: vacanteId,
        leida: false,
        leida_en: null,
        creado_en: FieldValue.serverTimestamp(),
        creado_por: 'system',
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: 'system',
      });
      tx.update(vacRef, {
        reloj_lider: {
          estado: 'corriendo',
          origen,
          ciclo: (Number(reloj?.ciclo) || 0) + 1,
          envio_ms: envioMs,
          inicio: Timestamp.fromDate(inicio),
          recordatorio_en: Timestamp.fromDate(plazos.recordatorioEn),
          vence_en: Timestamp.fromDate(plazos.venceEn),
          modo_plazo: cfg.modoPlazo,
          aviso_notificacion_id: notiRef.id,
          recordatorio_notificacion_id: null,
          recordatorio_enviado_en: null,
          pausada_en: null,
          detenido_en: null,
          motivo: null,
          reenvios: 0,
          lider_uid: liderUid,
        },
      });
      return 'armado';
    });

    logger.info('[reloj líder] envío procesado', { vacanteId, origen, resultado });
    if (resultado === 'armado') {
      await db.collection('eventos').add({
        tipo: 'reloj_lider_iniciado',
        vacante_id: vacanteId,
        origen,
        vence_en: Timestamp.fromDate(plazos.venceEn),
        creado_en: FieldValue.serverTimestamp(),
        creado_por: 'system',
      });
    }
  },
);
