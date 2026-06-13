import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/**
 * Gestores SST que tramitan las órdenes de exámenes médicos.
 * Correos confirmados por Karen (2026-06-09). Por ahora se notifica a los 3;
 * si más adelante quieren ruteo por sede/región (bog vs yumbo), se filtra acá.
 */
const GESTORES = [
  'gestorsstbog@equitel.com.co',
  'jochoa@equitel.com.co',
  'gestorsstyumbo@equitel.com.co',
];

/**
 * onExamenMedicoCreate · paso 15.
 *
 * Cuando el líder aprueba al candidato (TernaPage), se crea automáticamente la
 * solicitud `examenes_medicos/{id}` con estado 'solicitada'. ANTES no se
 * avisaba a nadie — el gestor tenía que entrar a la plataforma a revisar
 * (duda de Karen 2026-06-09). Este trigger manda el correo de orden de
 * exámenes a los gestores SST apenas se crea la solicitud, con la plantilla
 * que pidió Karen.
 *
 * Trigger (no callable) para que se dispare solo, sin importar desde dónde se
 * cree el doc. Idempotente: relee el doc y no reenvía si ya se marcó enviado.
 */
export const onExamenMedicoCreate = onDocumentCreated(
  {
    document: 'examenes_medicos/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    // Releer fresco para idempotencia ante reintentos del trigger.
    const fresh = await snap.ref.get();
    const ex = (fresh.data() ?? {}) as Record<string, unknown>;
    if (ex.correo_gestor_enviado_en) {
      logger.info('onExamenMedicoCreate · ya notificado, omito', { examen_id: snap.id });
      return;
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      logger.info('onExamenMedicoCreate · GMAIL_* ausentes, correo omitido', { examen_id: snap.id });
      return;
    }

    const nombre = String(ex.candidato_nombre ?? '');
    const cargo = String(ex.cargo_nombre ?? '');
    let cc = '';
    let unidad = '';
    let empresa = '';
    let sede = '';

    // El doc trae nombre + cargo; completamos CC (del candidato) y
    // unidad/empresa/sede (de la vacante denormalizada).
    try {
      if (ex.candidato_id) {
        const c = await db.collection('candidatos').doc(String(ex.candidato_id)).get();
        if (c.exists) cc = String(c.data()?.documento_numero ?? '');
      }
      if (ex.vacante_id) {
        const v = await db.collection('vacantes').doc(String(ex.vacante_id)).get();
        if (v.exists) {
          const vd = v.data() ?? {};
          unidad = String(vd.unidad_nombre ?? '');
          empresa = String(vd.empresa_nombre ?? '');
          sede = String(vd.sede_nombre ?? '');
        }
      }
    } catch (e) {
      logger.warn('onExamenMedicoCreate · no se pudieron leer datos extra', {
        examen_id: snap.id,
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    const filas: [string, string][] = [
      ['Nombre', nombre || '(pendiente)'],
      ['CC', cc || '(pendiente)'],
      ['CARGO', cargo || '(pendiente)'],
      ['UNIDAD', unidad || '(pendiente)'],
      ['EMPRESA', empresa || '(pendiente)'],
      ['SEDE', sede || '(pendiente)'],
    ];

    const filasHtml = filas
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 10px 2px 0; font-weight:600;">${k}:</td><td style="padding:2px 0;">${escapeHtml(
            v,
          )}</td></tr>`,
      )
      .join('');

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; max-width:560px;">
        <p>Buen día,</p>
        <p>Cordial saludo,</p>
        <p>Agradezco tu amable ayuda con la siguiente orden de exámenes médicos.</p>
        <table style="border-collapse:collapse; font-size:14px; margin:8px 0 16px;">
          ${filasHtml}
        </table>
        <p>Cordialmente;</p>
        <p style="font-size:12px; color:#777;">
          Enviado automáticamente por la Plataforma de Atracción · Organización Equitel.
        </p>
      </div>
    `.trim();

    try {
      await enviarConGmail({
        from: FROM,
        to: GESTORES,
        subject: `Orden de exámenes médicos · ${nombre || 'candidato'} · ${cargo}`,
        html,
      });
    } catch (e) {
      logger.error('onExamenMedicoCreate · correo falló', {
        examen_id: snap.id,
        msg: e instanceof Error ? e.message : String(e),
      });
      // No marcamos enviado → un reintento podrá reenviar.
      return;
    }

    await snap.ref.update({
      correo_gestor_enviado_en: FieldValue.serverTimestamp(),
      correo_gestor_destinatarios: GESTORES,
    });

    await db.collection('eventos').add({
      tipo: 'examen_medico_solicitado_gestor',
      examen_id: snap.id,
      postulacion_id: ex.postulacion_id ?? null,
      vacante_id: ex.vacante_id ?? null,
      destinatarios: GESTORES,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
    });

    logger.info('onExamenMedicoCreate · orden enviada a gestores', {
      examen_id: snap.id,
      destinatarios: GESTORES.length,
    });
  },
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
