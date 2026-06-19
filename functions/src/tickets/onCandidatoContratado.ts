import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import { envolverMarca, escapeHtml, interpolar, leerPlantillas } from '../notificaciones/plantillasMensajes';

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/** Plan de conexión de talentos → José (IT/talentos). Confirmado 2026-06-16. */
const JOSE_TALENTOS = 'jhoyos@equitel.com.co';

/**
 * onCandidatoContratado · F.2 (lote GH 16-jun).
 *
 * Al pasar la postulación a 'contratado' (lo hace GH al aprobar la carpeta, que
 * además YA crea los tickets de conexión — incluida dotación si el cargo aplica),
 * dispara los CORREOS de solicitud:
 *  - Plan de conexión de talentos → José + coordinación (Karen).
 *  - Dotación → coordinación (cuando el cargo aplica, detectado por los tickets
 *    de dotación ya creados). TODO: confirmar destinatario de dotación con Karen.
 *
 * Los tickets ya existen (este trigger NO los crea, solo notifica para hacerles
 * seguimiento). Idempotente con contratado_correos_enviados_en.
 *
 * TODO: plantillas exactas (plan de conexión / dotación) pendientes de Karen.
 */
export const onCandidatoContratado = onDocumentUpdated(
  {
    document: 'postulaciones/{id}',
    region: 'us-central1',
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (String(before.estado ?? '') === 'contratado' || String(after.estado ?? '') !== 'contratado')
      return;
    if (after.contratado_correos_enviados_en) return; // idempotente

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

    const postId = event.params.id;
    const nombre = String(after.candidato_nombre ?? 'el candidato').trim();
    const cargo = String(after.cargo_nombre ?? '').trim();
    const consecutivo = String(after.vacante_consecutivo ?? '').trim();
    const correo = String(after.candidato_email ?? '').trim();
    const telefono = String(after.candidato_telefono ?? '').trim();

    // Datos de la vacante (empresa, sede, unidad) + analista para la Plantilla 3.
    let empresa = '';
    let sede = '';
    let unidad = '';
    let analistaUid = '';
    try {
      if (after.vacante_id) {
        const v = await db.collection('vacantes').doc(String(after.vacante_id)).get();
        const vd = v.data() ?? {};
        empresa = String(vd.empresa_nombre ?? '').trim();
        sede = String(vd.sede_nombre ?? '').trim();
        unidad = String(vd.unidad_nombre ?? '').trim();
        analistaUid = String(vd.analista_uid ?? '').trim();
      }
    } catch (e) {
      logger.warn('[contratado] no se pudo leer la vacante', { postId, e: String(e) });
    }

    // Cédula: vive en candidatos/{id}.
    let cedula = '';
    try {
      if (after.candidato_id) {
        const c = await db.collection('candidatos').doc(String(after.candidato_id)).get();
        cedula = String(c.data()?.documento_numero ?? '').trim();
      }
    } catch (e) {
      logger.warn('[contratado] no se pudo leer la cédula', { postId, e: String(e) });
    }

    // Nombre del analista encargado (para "solicitud realizada por").
    let analistaNombre = '';
    let analistaEmail = '';
    try {
      if (analistaUid) {
        const u = await db.collection('usuarios').doc(analistaUid).get();
        if (u.exists) {
          const ud = u.data() ?? {};
          analistaNombre = `${String(ud.nombre ?? '').trim()} ${String(ud.apellido ?? '').trim()}`.trim();
          analistaEmail = String(ud.email ?? '').trim();
        }
      }
    } catch (e) {
      logger.warn('[contratado] no se pudo leer el analista', { postId, e: String(e) });
    }

    // Coordinación (Karen).
    const coords: { uid: string; email: string }[] = [];
    try {
      const cs = await db
        .collection('usuarios')
        .where('rol', '==', 'coordinador')
        .where('activo', '==', true)
        .get();
      cs.forEach((c) => coords.push({ uid: c.id, email: String(c.data()?.email ?? '').trim() }));
    } catch (e) {
      logger.warn('[contratado] no se pudieron leer coordinadores', { postId, e: String(e) });
    }
    const coordEmails = coords.map((c) => c.email).filter(Boolean);

    // 1) Plan de conexión y talentos (Plantilla 3) → José + coordinación (Karen).
    const { plantillas, footerEmpresas } = await leerPlantillas();
    const tpl = plantillas.conexion_talentos;
    const guion = '—';
    const asuntoVars = { nombre, consecutivo: consecutivo || guion };
    const cuerpoVars = {
      consecutivo: escapeHtml(consecutivo || guion),
      nombre: escapeHtml(nombre),
      cedula: escapeHtml(cedula || guion),
      correo: escapeHtml(correo || guion),
      cargo: escapeHtml(cargo || guion),
      unidad: escapeHtml(unidad || guion),
      empresa: escapeHtml(empresa || guion),
      telefono: escapeHtml(telefono || guion),
      sede: escapeHtml(sede || guion),
      analista: escapeHtml(analistaNombre || guion),
    };
    try {
      await enviarConGmail({
        from: FROM,
        to: [JOSE_TALENTOS],
        cc: coordEmails.length ? coordEmails : undefined,
        replyTo: analistaEmail || undefined,
        subject: interpolar(tpl.asunto, asuntoVars),
        html: envolverMarca(interpolar(tpl.cuerpo, cuerpoVars), { footerEmpresas }),
      });
    } catch (e) {
      logger.error('[contratado] correo talentos falló', { postId, e: String(e) });
      // Que no sea un fallo silencioso: avisar a coordinación para enviarlo a mano.
      for (const c of coords) {
        if (!c.uid) continue;
        await db.collection('notificaciones').add({
          destinatario_uid: c.uid,
          tipo: 'generica',
          titulo: 'No se pudo enviar el plan de conexión',
          mensaje: `No se pudo enviar a José el plan de conexión de talentos de ${nombre}${
            cargo ? ` (${cargo})` : ''
          }. Por favor envíaselo manualmente.`,
          link: '/tickets',
          leida: false,
          leida_en: null,
          creado_en: FieldValue.serverTimestamp(),
          creado_por: 'system',
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: 'system',
        });
      }
    }

    // 2) Dotación → solo si el cargo aplica (hay tickets de dotación para esta postulación).
    let aplicaDotacion = false;
    try {
      const tk = await db
        .collection('tickets_conexion')
        .where('postulacion_id', '==', postId)
        .get();
      aplicaDotacion = tk.docs.some((d) => String(d.data()?.tipo ?? '').startsWith('dotacion'));
    } catch (e) {
      logger.warn('[contratado] no se pudieron leer tickets de dotación', { postId, e: String(e) });
    }
    // Destinatario de dotación: ya está en la plataforma → apoyo de compras + bodega
    // (usuarios con area_apoyo). Si no hay, cae a coordinación.
    let dotacionEmails: string[] = [];
    if (aplicaDotacion) {
      try {
        const ap = await db
          .collection('usuarios')
          .where('rol', '==', 'apoyo')
          .where('activo', '==', true)
          .get();
        dotacionEmails = ap.docs
          .filter((d) => ['compras', 'bodega'].includes(String(d.data()?.area_apoyo ?? '')))
          .map((d) => String(d.data()?.email ?? '').trim())
          .filter(Boolean);
      } catch (e) {
        logger.warn('[contratado] no se pudieron leer responsables de dotación', {
          postId,
          e: String(e),
        });
      }
    }
    const dotacionTo = dotacionEmails.length ? dotacionEmails : coordEmails;
    if (aplicaDotacion && dotacionTo.length) {
      const datosDotacion = `<p style="line-height:1.9;">
        <strong>Integrante:</strong> ${escapeHtml(nombre)}<br>
        <strong>Cargo:</strong> ${escapeHtml(cargo || guion)}<br>
        <strong>Empresa / Sede:</strong> ${escapeHtml([empresa, sede].filter(Boolean).join(' / ') || guion)}<br>
        <strong>Consecutivo:</strong> ${escapeHtml(consecutivo || guion)}
      </p>`;
      try {
        await enviarConGmail({
          from: FROM,
          to: dotacionTo,
          cc: dotacionEmails.length && coordEmails.length ? coordEmails : undefined,
          replyTo: analistaEmail || undefined,
          subject: `Solicitud de dotación · ${nombre}`,
          html: envolverMarca(
            `<p>Buen día,</p>
             <p>Se contrató un nuevo integrante cuyo cargo requiere <strong>dotación</strong>.
                Solicitamos gestionar la dotación (uniforme/EPP) para:</p>
             ${datosDotacion}
             <p style="font-size:12px;color:#777;">Enviado automáticamente al marcar la contratación.</p>`,
            { footerEmpresas },
          ),
        });
      } catch (e) {
        logger.error('[contratado] correo dotación falló', { postId, e: String(e) });
      }
    }

    await event.data!.after.ref.update({
      contratado_correos_enviados_en: FieldValue.serverTimestamp(),
    });
    await db.collection('eventos').add({
      tipo: 'contratado_correos_enviados',
      postulacion_id: postId,
      aplica_dotacion: aplicaDotacion,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
    });
    logger.info('[contratado] correos de conexión enviados', { postId, aplicaDotacion });
  },
);
