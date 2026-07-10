import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';

/**
 * Crea una notificación interna (campana). conCorreo=false → solo campana
 * (pre-set email_enviado_en); conCorreo=true → campana + correo (lo dispara
 * onNotificacionCreate). Mismo shape que el resto de la app.
 */
export async function crearNotificacionExamen(opts: {
  destinatario_uid: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  link: string;
  conCorreo?: boolean;
}): Promise<void> {
  const doc: Record<string, unknown> = {
    destinatario_uid: opts.destinatario_uid,
    tipo: opts.tipo,
    titulo: opts.titulo,
    mensaje: opts.mensaje,
    link: opts.link,
    leida: false,
    leida_en: null,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: 'system',
  };
  if (!opts.conCorreo) doc.email_enviado_en = FieldValue.serverTimestamp();
  try {
    await db.collection('notificaciones').add(doc);
  } catch (e) {
    logger.warn('[notificarExamen] no se pudo crear notificación', {
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * UIDs del staff de atracción a avisar por un evento de examen: el analista de
 * la vacante + coordinadores + admins activos. Karen y Mari (Maribel González)
 * tienen cuenta ADMIN, así que se incluye admin para que "les salga" el aviso
 * como pidió Karen en la reu. No incluye a GH/gestor: ellos ya operan la pantalla.
 */
export async function destinatariosExamen(vacanteId: string): Promise<string[]> {
  const uids = new Set<string>();
  try {
    if (vacanteId) {
      const v = await db.collection('vacantes').doc(vacanteId).get();
      const analistaUid = String(v.data()?.analista_uid ?? '').trim();
      if (analistaUid) uids.add(analistaUid);
    }
  } catch (e) {
    logger.warn('[notificarExamen] no se pudo leer la vacante', {
      msg: e instanceof Error ? e.message : String(e),
    });
  }
  for (const rol of ['coordinador', 'admin']) {
    try {
      const cs = await db
        .collection('usuarios')
        .where('rol', '==', rol)
        .where('activo', '==', true)
        .get();
      cs.forEach((c) => uids.add(c.id));
    } catch (e) {
      logger.warn('[notificarExamen] no se pudieron leer usuarios por rol', {
        rol,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return [...uids];
}
