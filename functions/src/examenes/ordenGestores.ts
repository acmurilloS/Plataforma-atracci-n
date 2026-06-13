import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';

/**
 * Gestores SST que tramitan las órdenes de exámenes médicos.
 * Correos confirmados por Karen (2026-06-09). Por ahora se notifica a los 3;
 * si más adelante quieren ruteo por sede/región (bog vs yumbo), se filtra acá.
 */
export const GESTORES = [
  'gestorsstbog@equitel.com.co',
  'jochoa@equitel.com.co',
  'gestorsstyumbo@equitel.com.co',
];

/**
 * Los 6 datos que Karen exige que lleguen completos a los gestores.
 *  - key: campo en `valores`.
 *  - label: nombre amable para avisarle al analista qué faltó.
 *  - etiquetaCorreo: como sale en la tabla del correo al gestor.
 */
const REQUERIDOS = [
  { key: 'nombre', label: 'nombre completo', etiquetaCorreo: 'Nombre' },
  { key: 'cc', label: 'cédula', etiquetaCorreo: 'CC' },
  { key: 'cargo', label: 'cargo', etiquetaCorreo: 'CARGO' },
  { key: 'unidad', label: 'unidad', etiquetaCorreo: 'UNIDAD' },
  { key: 'empresa', label: 'empresa', etiquetaCorreo: 'EMPRESA' },
  { key: 'sede', label: 'sede', etiquetaCorreo: 'SEDE' },
] as const;

export type ResultadoEnvioGestores = {
  estado: 'enviado' | 'omitido_ya_enviado' | 'sin_secrets' | 'no_existe' | 'error';
  /** Cuáles de los 6 datos requeridos viajaron vacíos. */
  faltantes: string[];
  destinatarios: string[];
  error?: string;
};

/**
 * Envía (o reenvía) a los gestores SST el correo con la orden de exámenes de un
 * candidato y deja trazabilidad + acuse. Lo usan tanto el trigger
 * onExamenMedicoCreate (al aprobar al candidato, paso 15) como la callable
 * reenviarOrdenGestores (botón manual de GH/analista en Exámenes médicos).
 *
 * - Completa los 6 datos requeridos (nombre, cédula, cargo, unidad, empresa,
 *   sede) prefiriendo el snapshot del propio doc y cayendo a candidato + vacante.
 * - En ÉXITO: marca correo_gestor_enviado_en, registra qué datos faltaron (si
 *   alguno) y le crea un acuse al analista de la vacante (campana; + correo si
 *   faltaron datos, para que los complete).
 * - En FALLO: registra correo_gestor_error y le avisa al analista (campana +
 *   correo) para que reintente, en vez de quedar en silencio.
 */
export async function enviarOrdenAGestores(
  examenId: string,
  opts: { forzar?: boolean } = {},
): Promise<ResultadoEnvioGestores> {
  const ref = db.collection('examenes_medicos').doc(examenId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { estado: 'no_existe', faltantes: [], destinatarios: [], error: 'La solicitud de exámenes no existe.' };
  }
  const ex = (snap.data() ?? {}) as Record<string, unknown>;

  // Idempotencia: el trigger no reenvía si ya se mandó. La callable (forzar) sí.
  if (!opts.forzar && ex.correo_gestor_enviado_en) {
    logger.info('enviarOrdenAGestores · ya notificado, omito', { examen_id: examenId });
    return { estado: 'omitido_ya_enviado', faltantes: [], destinatarios: GESTORES };
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logger.info('enviarOrdenAGestores · GMAIL_* ausentes, correo omitido', { examen_id: examenId });
    return { estado: 'sin_secrets', faltantes: [], destinatarios: GESTORES };
  }

  // Datos: preferimos el snapshot que TernaPage guarda en el propio doc, y
  // completamos con candidato (cédula) + vacante (unidad/empresa/sede) para los
  // docs viejos que no tienen snapshot. La vacante se lee siempre por analista_uid.
  const nombre = String(ex.candidato_nombre ?? '').trim();
  const cargo = String(ex.cargo_nombre ?? '').trim();
  let cc = String(ex.documento_numero ?? '').trim();
  let unidad = String(ex.unidad_nombre ?? '').trim();
  let empresa = String(ex.empresa_nombre ?? '').trim();
  let sede = String(ex.sede_nombre ?? '').trim();
  let analistaUid = '';

  try {
    if (!cc && ex.candidato_id) {
      const c = await db.collection('candidatos').doc(String(ex.candidato_id)).get();
      if (c.exists) cc = String(c.data()?.documento_numero ?? '').trim();
    }
    if (ex.vacante_id) {
      const v = await db.collection('vacantes').doc(String(ex.vacante_id)).get();
      if (v.exists) {
        const vd = v.data() ?? {};
        analistaUid = String(vd.analista_uid ?? '').trim();
        if (!unidad) unidad = String(vd.unidad_nombre ?? '').trim();
        if (!empresa) empresa = String(vd.empresa_nombre ?? '').trim();
        if (!sede) sede = String(vd.sede_nombre ?? '').trim();
      }
    }
  } catch (e) {
    logger.warn('enviarOrdenAGestores · no se pudieron leer datos extra', {
      examen_id: examenId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  const valores: Record<string, string> = { nombre, cc, cargo, unidad, empresa, sede };
  const faltantes = REQUERIDOS.filter((r) => !valores[r.key]).map((r) => r.label);

  const filasHtml = REQUERIDOS.map((r) => {
    const v = valores[r.key] || '(pendiente)';
    return `<tr><td style="padding:2px 10px 2px 0; font-weight:600;">${r.etiquetaCorreo}:</td><td style="padding:2px 0;">${escapeHtml(
      v,
    )}</td></tr>`;
  }).join('');

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

  // A quién le confirmamos: el analista dueño de la vacante. Si no hay, a quien
  // disparó la solicitud (líder/coordinador), para no dejar el acuse huérfano.
  const destinatarioAcuse = analistaUid || String(ex.solicitada_por_uid ?? '').trim();

  try {
    await enviarConGmail({
      from: FROM,
      to: GESTORES,
      subject: `Orden de exámenes médicos · ${nombre || 'candidato'} · ${cargo}`,
      html,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('enviarOrdenAGestores · correo falló', { examen_id: examenId, msg });
    await ref.update({
      correo_gestor_error: msg.slice(0, 500),
      correo_gestor_error_en: FieldValue.serverTimestamp(),
    });
    // Avisar (campana + correo) para que NO sea un fallo silencioso.
    if (destinatarioAcuse) {
      await crearNotificacion({
        destinatario_uid: destinatarioAcuse,
        tipo: 'generica',
        titulo: 'No se pudo avisar a los gestores SST',
        mensaje: `El correo con la orden de exámenes de ${nombre || 'el candidato'}${
          cargo ? ` (${cargo})` : ''
        } no se pudo enviar a los gestores SST. Entra a Exámenes médicos y usa "Reenviar a gestores".`,
        link: '/examenes-medicos',
        conCorreo: true,
      });
    }
    return { estado: 'error', faltantes, destinatarios: GESTORES, error: msg };
  }

  await ref.update({
    correo_gestor_enviado_en: FieldValue.serverTimestamp(),
    correo_gestor_destinatarios: GESTORES,
    correo_gestor_datos_faltantes: faltantes,
    correo_gestor_error: null,
  });

  await db.collection('eventos').add({
    tipo: 'examen_medico_solicitado_gestor',
    examen_id: examenId,
    postulacion_id: ex.postulacion_id ?? null,
    vacante_id: ex.vacante_id ?? null,
    destinatarios: GESTORES,
    datos_faltantes: faltantes,
    reenviado: opts.forzar === true,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'system',
  });

  // Acuse al analista de que la orden ya salió a los gestores.
  if (destinatarioAcuse) {
    if (faltantes.length === 0) {
      await crearNotificacion({
        destinatario_uid: destinatarioAcuse,
        tipo: 'exam_solicitado',
        titulo: 'Gestores SST notificados',
        mensaje: `La orden de exámenes de ${nombre || 'el candidato'}${
          cargo ? ` (${cargo})` : ''
        } se envió a los ${GESTORES.length} gestores SST con los 6 datos completos.`,
        link: '/examenes-medicos',
        conCorreo: false,
      });
    } else {
      await crearNotificacion({
        destinatario_uid: destinatarioAcuse,
        tipo: 'exam_solicitado',
        titulo: 'Gestores SST notificados — faltan datos',
        mensaje: `La orden de exámenes de ${nombre || 'el candidato'}${
          cargo ? ` (${cargo})` : ''
        } se envió a los gestores SST, pero faltó: ${faltantes.join(
          ', ',
        )}. Complétalo(s) en los Datos Básicos del candidato y reenvía desde Exámenes médicos.`,
        link: '/examenes-medicos',
        conCorreo: true,
      });
    }
  }

  logger.info('enviarOrdenAGestores · orden enviada a gestores', {
    examen_id: examenId,
    destinatarios: GESTORES.length,
    faltantes,
    forzar: opts.forzar === true,
  });

  return { estado: 'enviado', faltantes, destinatarios: GESTORES };
}

/**
 * Crea una notificación interna desde el backend (Admin SDK).
 * conCorreo=false → solo campana: pre-seteamos email_enviado_en para que
 * onNotificacionCreate la trate como ya enviada y NO mande correo.
 * conCorreo=true → campana + correo (onNotificacionCreate lo dispara).
 */
async function crearNotificacion(opts: {
  destinatario_uid: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  link: string;
  conCorreo: boolean;
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
  if (!opts.conCorreo) {
    doc.email_enviado_en = FieldValue.serverTimestamp();
  }
  try {
    await db.collection('notificaciones').add(doc);
  } catch (e) {
    logger.warn('enviarOrdenAGestores · no se pudo crear notificación de acuse', {
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
