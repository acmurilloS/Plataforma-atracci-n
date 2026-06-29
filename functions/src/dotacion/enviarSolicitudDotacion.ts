import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { enviarConGmail } from '../notificaciones/enviarConGmail';
import { envolverMarca, escapeHtml, interpolar } from '../notificaciones/plantillasMensajes';
import { leerConfigDotacion } from './configDotacion';

// El correo a compras/gestores sale por Gmail → hay que enlazar los secrets.
const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const FROM = 'Plataforma de Atracción Equitel <steve@equitel.com.co>';
const ROLES = ['analista', 'gh', 'coordinador', 'admin'];

const TALLAS = [
  { key: 'talla_calzado', label: 'Calzado' },
  { key: 'talla_pantalon', label: 'Pantalón' },
  { key: 'talla_chaleco', label: 'Chaleco' },
  { key: 'talla_guantes', label: 'Guantes' },
  { key: 'talla_overol', label: 'Overol' },
  { key: 'talla_camisa_blusa', label: 'Camisa / blusa' },
  { key: 'talla_otros', label: 'Otros' },
] as const;

const CUERPO_DEFAULT = `<p>Buen día,</p>
<p>Solicitamos gestionar la <strong>dotación</strong> de ingreso para el siguiente integrante:</p>
<p>{{datos}}</p>
<p><strong>Tallas:</strong></p>
{{tabla_tallas}}
{{observaciones}}
<p>Quedamos atentos. Gracias por la gestión.</p>`;

/**
 * enviarSolicitudDotacion · subpaso de "entrega de carpeta" (reu 26-jun). Para
 * cargos que requieren dotación, envía a GESTORES + COMPRAS las TALLAS del
 * integrante (traídas de Datos Básicos, editables en el modal) + datos del cargo.
 *
 * - Aplica solo si el perfilamiento marcó herramientas_requeridas.dotacion (se
 *   valida server-side; la UI ya oculta el subpaso si no aplica).
 * - Cuerpo del correo = plantilla CONFIGURABLE (`configuracion_global/dotacion`,
 *   la edita Karen); reply-to al analista del proceso.
 * - Reenviable (corregir tallas). Marca solicitud_dotacion_enviada_en. Modo
 *   prueba (config) redirige a correo_prueba para la demo.
 */
export const enviarSolicitudDotacion = onCall(
  { region: 'us-central1', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const rol = String((req.auth.token as Record<string, unknown>).rol ?? '');
  if (!ROLES.includes(rol)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para solicitar dotación.');
  }

  const postulacionId = String(req.data?.postulacion_id ?? '').trim();
  if (!postulacionId) throw new HttpsError('invalid-argument', 'Falta la postulación.');
  const tallasIn = (req.data?.tallas ?? {}) as Record<string, unknown>;
  const observaciones = String(req.data?.observaciones ?? '').trim().slice(0, 1000);

  const postRef = db.collection('postulaciones').doc(postulacionId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError('not-found', 'La postulación no existe.');
  const post = postSnap.data() as Record<string, unknown>;

  // Valida que el cargo aplique dotación (flag del perfilamiento, fuente de verdad).
  const procId = String(post.proceso_id ?? '');
  let aplica = false;
  if (procId) {
    const proc = await db.collection('procesos').doc(procId).get();
    const perf = proc.data()?.perfilamiento as Record<string, unknown> | undefined;
    const h = perf?.herramientas_requeridas as Record<string, unknown> | undefined;
    aplica = h?.dotacion === true;
  }
  if (!aplica) throw new HttpsError('failed-precondition', 'Este cargo no requiere dotación.');

  const vacSnap = await db.collection('vacantes').doc(String(post.vacante_id ?? '')).get();
  const vac = (vacSnap.exists ? vacSnap.data() : {}) ?? {};
  const nombre = String(post.candidato_nombre ?? '').trim();
  const cargo = String(vac.cargo_nombre ?? post.cargo_nombre ?? '').trim();
  const empresa = String(vac.empresa_nombre ?? '').trim();
  const sede = String(vac.sede_nombre ?? '').trim();
  const unidad = String(vac.unidad_nombre ?? '').trim();
  const consecutivo = String(post.vacante_consecutivo ?? vac.consecutivo ?? '').trim();
  const analistaUid = String(vac.analista_uid ?? '').trim();

  // Tallas normalizadas (solo las 7 conocidas).
  const tallas: Record<string, string> = {};
  for (const t of TALLAS) tallas[t.key] = String(tallasIn[t.key] ?? '').trim().slice(0, 60);

  // Persiste las tallas corregidas en Datos Básicos (si el doc existe).
  try {
    const dbi = await db
      .collection('datos_basicos_integrante')
      .where('postulacion_id', '==', postulacionId)
      .limit(1)
      .get();
    if (!dbi.empty) {
      await dbi.docs[0].ref.update({
        ...tallas,
        actualizado_por: req.auth.uid,
        actualizado_en: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    logger.warn('enviarSolicitudDotacion · no se pudieron guardar tallas', {
      postulacionId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  // Destinatarios: config → fallback apoyo compras/bodega → fallback coordinación.
  const cfg = await leerConfigDotacion();
  let destinatarios = cfg.destinatarios;
  if (!destinatarios.length) {
    try {
      const ap = await db
        .collection('usuarios')
        .where('rol', '==', 'apoyo')
        .where('activo', '==', true)
        .get();
      destinatarios = ap.docs
        .filter((d) => ['compras', 'bodega'].includes(String(d.data()?.area_apoyo ?? '')))
        .map((d) => String(d.data()?.email ?? '').trim())
        .filter(Boolean);
    } catch {
      /* noop */
    }
  }

  // Reply-to + copia al analista y coordinación.
  let analistaEmail = '';
  const coordEmails: string[] = [];
  try {
    if (analistaUid) {
      const u = await db.collection('usuarios').doc(analistaUid).get();
      if (u.exists) analistaEmail = String(u.data()?.email ?? '').trim();
    }
    const cs = await db
      .collection('usuarios')
      .where('rol', '==', 'coordinador')
      .where('activo', '==', true)
      .get();
    cs.forEach((c) => {
      const e = String(c.data()?.email ?? '').trim();
      if (e) coordEmails.push(e);
    });
  } catch {
    /* noop */
  }
  if (!destinatarios.length) destinatarios = coordEmails;

  const to = cfg.modo_prueba ? cfg.correo_prueba : destinatarios;
  if (!to.length) {
    throw new HttpsError(
      'failed-precondition',
      'No hay destinatarios de dotación: configúralos en /admin o crea usuarios de apoyo de compras/bodega.',
    );
  }

  // Sin secrets de correo (local) → marca enviado igual para no bloquear la prueba.
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    await postRef.update({ solicitud_dotacion_enviada_en: FieldValue.serverTimestamp() });
    logger.info('enviarSolicitudDotacion · sin GMAIL_*, correo omitido', { postulacionId });
    return { ok: true as const, sin_secrets: true, destinatarios: to };
  }

  // Cuerpo: plantilla configurable (Karen) o por defecto.
  const datosHtml =
    `<strong>Integrante:</strong> ${escapeHtml(nombre)}<br>` +
    `<strong>Cargo:</strong> ${escapeHtml(cargo || '—')}<br>` +
    `<strong>Empresa / Sede:</strong> ${escapeHtml([empresa, sede].filter(Boolean).join(' / ') || '—')}` +
    (unidad ? `<br><strong>Unidad:</strong> ${escapeHtml(unidad)}` : '') +
    `<br><strong>Consecutivo:</strong> ${escapeHtml(consecutivo || '—')}`;
  const filas = TALLAS.map(
    (t) =>
      `<tr><td style="padding:2px 12px 2px 0;font-weight:600;">${t.label}:</td><td style="padding:2px 0;">${escapeHtml(
        tallas[t.key] || '—',
      )}</td></tr>`,
  ).join('');
  const tablaTallas = `<table style="border-collapse:collapse;font-size:14px;margin:6px 0 14px;">${filas}</table>`;
  const obsHtml = observaciones ? `<p><strong>Observaciones:</strong> ${escapeHtml(observaciones)}</p>` : '';
  const cuerpo = interpolar(cfg.plantilla_cuerpo || CUERPO_DEFAULT, {
    datos: datosHtml,
    tabla_tallas: tablaTallas,
    observaciones: obsHtml,
    nombre: escapeHtml(nombre),
    cargo: escapeHtml(cargo),
    empresa: escapeHtml(empresa),
    sede: escapeHtml(sede),
    consecutivo: escapeHtml(consecutivo),
  });
  const html = envolverMarca(cuerpo, { preheader: `Solicitud de dotación · ${nombre}` });
  const asunto =
    (cfg.plantilla_asunto && interpolar(cfg.plantilla_asunto, { nombre, cargo })) ||
    `Solicitud de dotación · ${nombre || 'integrante'}${cargo ? ` · ${cargo}` : ''}`;

  // En modo prueba no se copia a personas reales (demo limpia).
  const ccArr = cfg.modo_prueba
    ? []
    : [analistaEmail, ...coordEmails].filter(Boolean).filter((e) => !to.includes(e));

  try {
    await enviarConGmail({
      from: FROM,
      to,
      cc: ccArr.length ? ccArr : undefined,
      replyTo: analistaEmail || undefined,
      subject: asunto,
      html,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('enviarSolicitudDotacion · correo falló', { postulacionId, msg });
    throw new HttpsError('internal', `No se pudo enviar la solicitud de dotación: ${msg}`);
  }

  await postRef.update({ solicitud_dotacion_enviada_en: FieldValue.serverTimestamp() });
  try {
    await db.collection('eventos').add({
      tipo: 'solicitud_dotacion_enviada',
      postulacion_id: postulacionId,
      vacante_id: post.vacante_id ?? null,
      destinatarios: to,
      por_uid: req.auth.uid,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });
  } catch {
    /* el correo ya salió; un fallo del log no debe romper */
  }

  logger.info('enviarSolicitudDotacion', { postulacionId, destinatarios: to.length, por: req.auth.uid });
  return { ok: true as const, destinatarios: to };
});
