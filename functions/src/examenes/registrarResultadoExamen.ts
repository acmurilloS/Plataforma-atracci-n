import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import {
  envolverMarca,
  escapeHtml,
  FOOTER_EMPRESAS_DEFAULT,
} from '../notificaciones/plantillasMensajes';
import { crearNotificacionExamen, destinatariosExamen, ghActivos } from './notificarExamen';
import { emailAnalistaDeVacante, emailCoordinadorFallback } from '../notificaciones/emailAnalista';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';
const DIEGO_CULTURA = 'dortiz@equitel.com.co';

// Suben el resultado: los gestores SST + GH (Diego/Paola) + coordinación + admin.
const ROLES_SUBIR = ['gestor', 'gh', 'coordinador', 'admin'];

// Estados en los que se puede registrar el resultado. NO incluye 'en_revision_cd'
// (con novedad → la decisión la toma SOLO don Diego vía decisionCulturaExamen; si
// se permitiera re-subir aquí, GH/gestor podría puentear a C&D marcando sin_novedad)
// ni 'apto'/'no_apto' (ya resuelto).
const ESTADOS_SUBIBLES = ['solicitada', 'enviada'];

/**
 * registrarResultadoExamen · el GESTOR SST (o GH) sube en la plataforma el
 * resultado del examen médico (reu Karen 09-jul). Reemplaza el "concepto por
 * correo" + el botón manual apto/no-apto de GH.
 *
 *  - resultado_url: PDF del resultado (subido a Storage `resultados_examenes/`).
 *  - novedad: 'sin_novedad' → apto, auto-avanza a contratación (la lógica que
 *    antes vivía en el cliente `confirmarConcepto` se mueve aquí, server-side).
 *  - novedad: 'con_novedad' → estado `en_revision_cd`: NO decide el gestor;
 *    queda para que don Diego (C&D) marque continúa / no-continúa. Se le manda
 *    correo con botón + campana a analista/coordinación.
 *  - con_recomendaciones + acta_url: 2º PDF (acta de recomendaciones) para el
 *    caso "pasa pero con recomendaciones" (p.ej. va a la EPS a tratamiento).
 *
 * Idempotente-ish: si el examen ya tiene concepto final (apto/no_apto) rechaza.
 */
export const registrarResultadoExamen = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    const rol = String(req.auth.token.rol ?? '');
    if (!ROLES_SUBIR.includes(rol)) {
      throw new HttpsError('permission-denied', 'Rol no autorizado para subir el resultado.');
    }

    const examenId = String(req.data?.examen_id ?? '').trim();
    const novedad = String(req.data?.novedad ?? '').trim();
    const observaciones = String(req.data?.observaciones ?? '').trim().slice(0, 2000);
    const conRecomendaciones = req.data?.con_recomendaciones === true;
    const resultadoUrl = String(req.data?.resultado_url ?? '').trim();
    const actaUrl = String(req.data?.acta_url ?? '').trim();

    if (!examenId) throw new HttpsError('invalid-argument', 'Falta examen_id.');
    if (novedad !== 'sin_novedad' && novedad !== 'con_novedad') {
      throw new HttpsError('invalid-argument', 'Marca si el examen es "sin novedad" o "con novedad".');
    }
    if (!resultadoUrl) throw new HttpsError('invalid-argument', 'Falta el PDF del resultado.');
    if (conRecomendaciones && !actaUrl) {
      throw new HttpsError('invalid-argument', 'Marcaste "con recomendaciones" pero falta el acta.');
    }

    const exRef = db.collection('examenes_medicos').doc(examenId);
    const exSnap = await exRef.get();
    if (!exSnap.exists) throw new HttpsError('not-found', 'La solicitud de exámenes no existe.');
    const ex = exSnap.data() as Record<string, unknown>;
    const estadoActual = String(ex.estado ?? '');
    if (!ESTADOS_SUBIBLES.includes(estadoActual)) {
      throw new HttpsError(
        'failed-precondition',
        estadoActual === 'en_revision_cd'
          ? 'Este examen está en revisión de Cultura y Desarrollo; la decisión la toma C&D.'
          : 'Este examen ya tiene resultado/concepto registrado.',
      );
    }

    const postId = String(ex.postulacion_id ?? '');
    const vacanteId = String(ex.vacante_id ?? '');
    const candidatoNombre = String(ex.candidato_nombre ?? '') || '(integrante)';
    const consecutivo = String(ex.vacante_consecutivo ?? '');
    const ahora = FieldValue.serverTimestamp();
    const sinNovedad = novedad === 'sin_novedad';

    const patch: Record<string, unknown> = {
      resultado_url: resultadoUrl,
      novedad,
      observaciones_gestor: observaciones || null,
      con_recomendaciones: conRecomendaciones,
      acta_recomendaciones_url: actaUrl || null,
      resultado_subido_por: req.auth.uid,
      resultado_subido_en: ahora,
      concepto_recibido_en: ahora,
      actualizado_en: ahora,
      actualizado_por: req.auth.uid,
    };

    if (sinNovedad) {
      // Sin novedad = apto. Auto-avanza a contratación (lógica movida del cliente).
      // Transacción: re-valida el estado del examen (anti doble-submit) y solo mueve
      // la postulación/vacante si la postulación sigue en 'en_examenes_medicos' (no
      // resucita una que ya desistió/se descartó). Examen + postulación + vacante
      // quedan atómicos → nunca hay estado partido si algo falla.
      patch.estado = 'apto';
      patch.apto = true;
      await db.runTransaction(async (tx) => {
        const exFresh = await tx.get(exRef);
        if (!ESTADOS_SUBIBLES.includes(String(exFresh.data()?.estado ?? ''))) {
          throw new HttpsError('failed-precondition', 'El examen ya fue procesado.');
        }
        const postRef = postId ? db.collection('postulaciones').doc(postId) : null;
        const postSnap = postRef ? await tx.get(postRef) : null;
        const postEnExamenes =
          !!postSnap && String(postSnap.data()?.estado ?? '') === 'en_examenes_medicos';

        tx.update(exRef, patch);
        if (postRef && postEnExamenes) {
          tx.update(postRef, {
            estado: 'en_contratacion',
            ultima_transicion_estado: ahora,
            'marcas.apto_medico_en': ahora,
          });
          if (vacanteId) {
            tx.update(db.collection('vacantes').doc(vacanteId), { estado: 'en_contratacion' });
          }
        }
      });
    } else {
      // Con novedad = decide Cultura y Desarrollo (Diego). No transiciona la
      // postulación todavía (queda en_examenes_medicos hasta que Diego decida).
      // Un solo doc → escritura atómica de por sí.
      patch.estado = 'en_revision_cd';
      patch.apto = null;
      await exRef.update(patch);
    }

    // Evento (best-effort).
    try {
      await db.collection('eventos').add({
        tipo: sinNovedad ? 'examen.resultado_sin_novedad' : 'examen.resultado_con_novedad',
        entidad_tipo: 'examen_medico',
        entidad_id: examenId,
        vacante_id: vacanteId,
        postulacion_id: postId,
        payload: { novedad, con_recomendaciones: conRecomendaciones },
        autor_uid: req.auth.uid,
        autor_rol: rol,
        creado_en: ahora,
        creado_por: req.auth.uid,
      });
    } catch (e) {
      logger.warn('[registrarResultadoExamen] no se pudo registrar el evento', {
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    // Avisos a analista + coordinación (Karen/Mari). Si el examen viene CON
    // NOVEDAD, la decisión es de GH (Diego y Paola), así que también les llega la
    // campana a ellos (antes solo a Diego por correo — revisión 16-jul).
    const dests = new Set(await destinatariosExamen(vacanteId));
    const ghs = sinNovedad ? [] : await ghActivos();
    for (const g of ghs) dests.add(g.uid);
    for (const uid of dests) {
      await crearNotificacionExamen({
        destinatario_uid: uid,
        tipo: 'examen_resultado',
        titulo: sinNovedad
          ? 'Examen médico sin novedad · pasa a contratación'
          : 'Examen médico CON NOVEDAD · en revisión de C&D',
        mensaje: `${candidatoNombre}${consecutivo ? ` (${consecutivo})` : ''}: resultado ${
          sinNovedad
            ? 'SIN novedad → apto, avanza a contratación.'
            : 'CON novedad → pendiente de la decisión de Gestión Humana (C&D).'
        }`,
        link: '/examenes-medicos',
      });
    }

    // Con novedad → correo a GH (Diego + Paola) con botón a la plataforma.
    if (!sinNovedad && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        const cuerpo = `
          <p style="margin:0 0 14px;">Hola,</p>
          <p style="margin:0 0 14px;">
            El examen médico de <strong>${escapeHtml(candidatoNombre)}</strong>${
              consecutivo ? ` (${escapeHtml(consecutivo)})` : ''
            } salió <strong>CON NOVEDAD</strong>.${
              observaciones
                ? ` Observaciones del gestor: <em>${escapeHtml(observaciones)}</em>.`
                : ''
            }
          </p>
          <p style="margin:0 0 18px;">
            Revisa el resultado y marca en la plataforma si la contratación
            <strong>continúa o no</strong>. Queda registrado para el equipo.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
            <tr><td style="border-radius:8px;background:#be1e0d;">
              <a href="${APP_URL}/examenes-medicos" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                Revisar y decidir en la plataforma →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;">Gracias.</p>
        `.trim();
        const html = envolverMarca(cuerpo, {
          footerEmpresas: FOOTER_EMPRESAS_DEFAULT,
          preheader: 'Examen médico con novedad — requiere tu decisión',
        });
        // A todos los GH activos (Diego + Paola); si por algún motivo no hay
        // ninguno cargado, cae al correo de Diego como respaldo. Reply-to a la
        // analista del proceso (fallback coordinación), no al buzón de Steve.
        const correosGh = ghs.map((g) => g.email);
        const replyTo =
          (await emailAnalistaDeVacante(vacanteId)) || (await emailCoordinadorFallback());
        await enviarConGmail({
          from: FROM,
          to: correosGh.length ? correosGh : [DIEGO_CULTURA],
          replyTo: replyTo || undefined,
          subject: `Examen médico CON NOVEDAD — ${candidatoNombre}${
            consecutivo ? ` (${consecutivo})` : ''
          }`,
          html,
        });
      } catch (e) {
        logger.error('[registrarResultadoExamen] correo de novedad a GH falló', {
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { ok: true as const, estado: sinNovedad ? 'apto' : 'en_revision_cd' };
  },
);
