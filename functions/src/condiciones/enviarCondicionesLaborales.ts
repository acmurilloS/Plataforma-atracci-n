import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail, type AdjuntoCorreo } from '../notificaciones/enviarConGmail';
import { envolverMarca, escapeHtml, interpolar, leerPlantillas } from '../notificaciones/plantillasMensajes';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const APP_URL = 'https://ptm-atraccion.web.app';

/**
 * enviarCondicionesLaborales · E (lote GH 16-jun) + lote mensajería.
 *
 * Tras aprobar exámenes (candidato en 'en_contratacion'), el analista le envía sus
 * condiciones laborales (Plantilla 2). Va al candidato con COPIA a coordinación
 * (responsables) y reply-to al analista; adjunta el PDF de perfil de cargo si se
 * proporciona. El candidato confirma/acepta en su portal (se guarda la aceptación).
 *
 * Sale por la fachada provider-agnostic (Gmail hoy / SendGrid mañana).
 */
export const enviarCondicionesLaborales = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'gh', 'admin'].includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const postulacionId = String(req.data?.postulacion_id ?? '').trim();
    const salarioInput = String(req.data?.salario ?? '').trim().slice(0, 80);
    const comisionesInput = String(req.data?.comisiones ?? '').trim().slice(0, 160);
    const rodamientoInput = String(req.data?.rodamiento ?? '').trim().slice(0, 80);
    const horario = String(req.data?.horario ?? '').trim().slice(0, 200);
    const tipoContratoRaw = String(req.data?.tipo_contrato ?? '').trim().slice(0, 40);
    const tiempoContrato = String(req.data?.tiempo_contrato ?? '').trim().slice(0, 60);
    const perfilCargoUrl = String(req.data?.perfil_cargo_url ?? '').trim();
    if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
    if (!salarioInput) throw new HttpsError('invalid-argument', 'El salario es obligatorio.');
    const esTemporal = tipoContratoRaw === 'temporal';
    if (esTemporal && !tiempoContrato) {
      throw new HttpsError('invalid-argument', 'Indica el tiempo del contrato temporal.');
    }

    const postRef = db.collection('postulaciones').doc(postulacionId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new HttpsError('not-found', 'Postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const email = String(post.candidato_email ?? '').trim();
    if (!email) {
      throw new HttpsError('failed-precondition', 'El candidato no tiene correo registrado.');
    }
    const cargo = String(post.cargo_nombre ?? '').trim();
    const token = String(post.portal_token ?? '').trim();

    // Datos de la vacante (salario, empresa, unidad, sede) + reply-to analista.
    let empresa = '';
    let unidad = '';
    let sede = '';
    let salarioVacante = '';
    let analistaEmail = '';
    try {
      if (post.vacante_id) {
        const v = await db.collection('vacantes').doc(String(post.vacante_id)).get();
        const vd = v.data() ?? {};
        empresa = String(vd.empresa_nombre ?? '').trim();
        unidad = String(vd.unidad_nombre ?? '').trim();
        sede = String(vd.sede_nombre ?? '').trim();
        const sb = Number(vd.salario_base ?? 0);
        salarioVacante = sb > 0 ? `$ ${sb.toLocaleString('es-CO')}` : '';
        const analistaUid = String(vd.analista_uid ?? '').trim();
        if (analistaUid) {
          const u = await db.collection('usuarios').doc(analistaUid).get();
          if (u.exists) analistaEmail = String(u.data()?.email ?? '').trim();
        }
      }
    } catch (e) {
      logger.warn('[condiciones] no se pudo leer la vacante', { postulacionId, e: String(e) });
    }

    // Copia a coordinación (responsables del proceso).
    let coordEmails: string[] = [];
    try {
      const cs = await db
        .collection('usuarios')
        .where('rol', '==', 'coordinador')
        .where('activo', '==', true)
        .get();
      coordEmails = cs.docs.map((c) => String(c.data()?.email ?? '').trim()).filter(Boolean);
    } catch (e) {
      logger.warn('[condiciones] no se pudieron leer coordinadores', { postulacionId, e: String(e) });
    }

    const primer = String(post.candidato_nombre ?? '').trim().split(' ')[0] || 'candidato/a';
    const portalLink = token ? `${APP_URL}/portal/${token}` : '';
    const guion = '—';

    // Plantilla 2 (configurable) + botón al portal + envoltorio de marca.
    const { plantillas, footerEmpresas } = await leerPlantillas();
    const tpl = plantillas.condiciones;
    // Campos económicos (diligenciados por la analista). Vacío → "No aplica";
    // el salario cae al de la vacante si la analista no lo cambió.
    const salario = salarioInput || salarioVacante;
    const comisiones = comisionesInput || 'No aplica';
    const rodamiento = rodamientoInput || 'No aplica';
    const tipoContratoTexto = esTemporal
      ? `Temporal · ${tiempoContrato}`
      : tipoContratoRaw === 'indefinido'
        ? 'Indefinido'
        : tipoContratoRaw || guion;
    const cuerpoVars = {
      nombre: escapeHtml(primer),
      cargo: escapeHtml(cargo || guion),
      empresa: escapeHtml(empresa || guion),
      unidad: escapeHtml(unidad || guion),
      tipo_contrato: escapeHtml(tipoContratoTexto),
      salario: escapeHtml(salario || guion),
      comisiones: escapeHtml(comisiones),
      rodamiento: escapeHtml(rodamiento),
      horario: escapeHtml(horario || guion),
    };
    const boton = portalLink
      ? `<p style="margin:16px 0;"><a href="${escapeAttr(
          portalLink,
        )}" style="display:inline-block;background:#be1e0d;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Revisar y aceptar en mi portal →</a></p>`
      : '';
    const html = envolverMarca(interpolar(tpl.cuerpo, cuerpoVars) + boton, { footerEmpresas });
    const subject = interpolar(tpl.asunto, { cargoSufijo: cargo ? ` · ${cargo}` : '' });

    // Adjuntar el PDF de perfil de cargo si se proporcionó (best-effort).
    const attachments: AdjuntoCorreo[] = [];
    if (perfilCargoUrl) {
      try {
        const r = await fetch(perfilCargoUrl, { signal: AbortSignal.timeout(10000) });
        if (r.ok) {
          attachments.push({
            filename: `Perfil de cargo${cargo ? ` - ${cargo}` : ''}.pdf`,
            content: Buffer.from(await r.arrayBuffer()),
            contentType: 'application/pdf',
          });
        } else {
          logger.warn('[condiciones] perfil de cargo no descargable', { status: r.status });
        }
      } catch (e) {
        logger.warn('[condiciones] no se pudo adjuntar el perfil', { e: String(e) });
      }
    }

    try {
      await enviarConGmail({
        from: FROM,
        to: [email],
        cc: coordEmails.length ? coordEmails : undefined,
        replyTo: analistaEmail || undefined,
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (e) {
      logger.error('[condiciones] correo falló', { postulacionId, e: String(e) });
      throw new HttpsError('internal', 'No se pudo enviar el correo. Reintenta.');
    }

    await postRef.update({
      condiciones_laborales: {
        cargo,
        empresa,
        unidad,
        sede,
        salario,
        comisiones,
        rodamiento,
        horario,
        tipo_contrato: tipoContratoTexto,
        tiempo_contrato: tiempoContrato,
      },
      perfil_cargo_url: perfilCargoUrl || null,
      condiciones_enviadas_en: FieldValue.serverTimestamp(),
    });
    await db.collection('eventos').add({
      tipo: 'condiciones_laborales_enviadas',
      postulacion_id: postulacionId,
      con_adjunto: attachments.length > 0,
      copia_a: coordEmails.length,
      analista_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    return { ok: true as const, email_destinatario: email };
  },
);

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
