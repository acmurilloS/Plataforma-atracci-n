import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { CLAVES_OBLIGATORIAS, CLAVES_OBLIGATORIAS_GH } from '../documentos/catalogoCarpeta';
import { leerConfigDrive } from './configDrive';
import { asegurarFolder, listarNombresEnFolder, subirBufferAFolder } from './cliente';

const ESTADOS_OK = new Set(['entregado', 'verificado', 'no_aplica']);

/**
 * 100% TOTAL = TODOS los obligatorios de CyD (CLAVES_OBLIGATORIAS) Y de GH
 * (CLAVES_OBLIGATORIAS_GH: contrato + afiliaciones) en entregado|verificado|
 * no_aplica. NO es lo mismo que el evento del Bug#2 (solo CyD) ni que 'aprobada'
 * (que no exige los docs de GH).
 */
export async function carpetaCompleta100(postulacionId: string): Promise<boolean> {
  const dc = await db
    .collection('documentos_candidato')
    .where('postulacion_id', '==', postulacionId)
    .get();
  const estadoPorClave = new Map<string, string>();
  dc.docs.forEach((d) => {
    const x = d.data() as Record<string, unknown>;
    estadoPorClave.set(String(x.clave ?? ''), String(x.estado ?? 'pendiente'));
  });
  return [...CLAVES_OBLIGATORIAS, ...CLAVES_OBLIGATORIAS_GH].every((c) =>
    ESTADOS_OK.has(estadoPorClave.get(c) ?? 'pendiente'),
  );
}

export interface ResultadoSync {
  ok: boolean;
  drive_carpeta_id?: string;
  subidos?: number;
  error?: string;
}

/**
 * Deposita TODOS los documentos de la carpeta (CyD + GH) + los consentimientos
 * firmados en una subcarpeta del integrante dentro de la Unidad Compartida de GH.
 * Idempotente: reutiliza la subcarpeta (por nombre) y NO re-sube los archivos que
 * ya están (por nombre) → un reintento tras una subida a medias no duplica.
 */
export async function sincronizarCarpetaADrive(postulacionId: string): Promise<ResultadoSync> {
  const cfg = await leerConfigDrive();
  if (!cfg.unidad_compartida_id) {
    return {
      ok: false,
      error: 'La Unidad Compartida de Drive no está configurada (Admin → Integraciones).',
    };
  }
  const parentBase = cfg.carpeta_padre_id || cfg.unidad_compartida_id;

  const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
  if (!postSnap.exists) return { ok: false, error: 'La postulación no existe.' };
  const post = postSnap.data() as Record<string, unknown>;

  // Nombre de la subcarpeta: "{nombre del integrante} - {cédula}" (fallback consecutivo).
  const nombreIntegrante = String(post.candidato_nombre ?? '').trim() || 'Integrante';
  let cedula = '';
  if (post.candidato_id) {
    try {
      const c = await db.collection('candidatos').doc(String(post.candidato_id)).get();
      if (c.exists) cedula = String(c.data()?.documento_numero ?? '').trim();
    } catch {
      /* sin cédula → cae al consecutivo */
    }
  }
  // Sufijo SIEMPRE único: cédula si hay; si no, consecutivo + cola del id de
  // postulación (evita que dos homónimos sin cédula compartan subcarpeta).
  const sufijo = cedula || `${String(post.vacante_consecutivo ?? '').trim() || 'sc'}-${postulacionId.slice(-6)}`;
  const nombreSubcarpeta = sanitizar(`${nombreIntegrante} - ${sufijo}`);

  let folderId: string;
  try {
    folderId = await asegurarFolder({ parentId: parentBase, nombre: nombreSubcarpeta });
  } catch (e) {
    return { ok: false, error: 'No se pudo crear/abrir la subcarpeta en Drive: ' + msg(e) };
  }

  let existentes: Set<string>;
  try {
    existentes = await listarNombresEnFolder({ parentId: folderId });
  } catch (e) {
    return { ok: false, drive_carpeta_id: folderId, error: 'No se pudo listar la subcarpeta: ' + msg(e) };
  }

  // Reunir todos los archivos: documentos_candidato (CyD + GH) + consentimientos.
  const archivos: { nombre: string; url: string }[] = [];
  const dc = await db
    .collection('documentos_candidato')
    .where('postulacion_id', '==', postulacionId)
    .get();
  for (const d of dc.docs) {
    const x = d.data() as Record<string, unknown>;
    const clave = String(x.clave ?? 'documento');
    const lista: { url?: unknown; nombre?: unknown }[] =
      Array.isArray(x.archivos) && x.archivos.length
        ? (x.archivos as { url?: unknown; nombre?: unknown }[])
        : x.archivo_url
          ? [{ url: x.archivo_url, nombre: x.nombre_archivo }]
          : [];
    lista.forEach((a, i) => {
      const url = String(a.url ?? '').trim();
      if (!url) return;
      const ext = extensionDe(String(a.nombre ?? '') || url);
      const base = lista.length > 1 ? `${clave}_${i + 1}` : clave;
      archivos.push({ nombre: `${sanitizar(base)}${ext}`, url });
    });
  }
  const consents: [string, unknown][] = [
    ['consentimiento_imagen_y_voz', post.consentimiento_imagen_firma_url],
    ['autorizacion_tratamiento_datos', post.consentimiento_datos_firma_url],
  ];
  for (const [nombre, u] of consents) {
    const url = String(u ?? '').trim();
    if (url) archivos.push({ nombre: `${nombre}.pdf`, url });
  }

  let subidos = 0;
  const fallidos: string[] = [];
  for (const a of archivos) {
    if (existentes.has(a.nombre)) continue;
    let buffer: Buffer;
    try {
      buffer = await descargar(a.url);
    } catch (e) {
      logger.warn('[drive] no se pudo descargar un archivo', { nombre: a.nombre, e: msg(e) });
      fallidos.push(a.nombre);
      continue;
    }
    try {
      await subirBufferAFolder({ parentId: folderId, nombre: a.nombre, buffer, mimeType: mimeDe(a.nombre) });
      existentes.add(a.nombre);
      subidos++;
    } catch (e) {
      // Corta, pero como es idempotente por nombre, el reintento sube solo lo que falte.
      return { ok: false, drive_carpeta_id: folderId, error: `Falló al subir "${a.nombre}": ${msg(e)}` };
    }
  }

  // NO marcar "sincronizada" si faltó traer algún archivo: deja drive_error visible
  // + permite reintento (los ya subidos no se re-suben por el dedup por nombre).
  // Así nunca se pierde un documento en silencio.
  if (fallidos.length) {
    return {
      ok: false,
      drive_carpeta_id: folderId,
      subidos,
      error: `No se pudieron descargar ${fallidos.length} archivo(s): ${fallidos.join(', ')}`,
    };
  }

  logger.info('[drive] carpeta sincronizada', { postulacionId, folderId, subidos });
  return { ok: true, drive_carpeta_id: folderId, subidos };
}

/**
 * Asegura el doc de carpeta para la postulación. Si no existe (caso raro: el 100%
 * total se alcanza en el mismo evento que dispara la creación), la crea con id
 * determinístico `carpeta_{id}` (idempotente, igual que onCarpetaCompletaCheck).
 */
export async function asegurarCarpetaRef(
  postulacionId: string,
): Promise<FirebaseFirestore.DocumentReference | null> {
  const existente = await db
    .collection('carpetas_digitales')
    .where('postulacion_id', '==', postulacionId)
    .limit(1)
    .get();
  if (!existente.empty) return existente.docs[0].ref;

  const ref = db.collection('carpetas_digitales').doc(`carpeta_${postulacionId}`);
  const post = (await db.collection('postulaciones').doc(postulacionId).get()).data() ?? {};
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.exists) return;
    tx.set(ref, {
      postulacion_id: postulacionId,
      candidato_id: post.candidato_id ?? null,
      vacante_id: post.vacante_id ?? null,
      candidato_nombre: post.candidato_nombre ?? null,
      cargo_nombre: post.cargo_nombre ?? null,
      vacante_consecutivo: post.vacante_consecutivo ?? null,
      estado: 'armando',
      entregada_en: null,
      observaciones_gh: null,
      aprobada_en: null,
      auto_creada: true,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });
  });
  return ref;
}

export type EstadoDeposito = 'ok' | 'ocupado' | 'ya_sincronizada' | 'sin_carpeta' | 'error';

/**
 * Depósito CON LOCK — único punto que escribe los flags drive_*. Toma
 * `drive_sync_intentando_en` en transacción (serializa trigger automático +
 * reintento manual → no se duplican carpetas/archivos en la unidad real) y
 * SIEMPRE libera el lock (éxito o error → reintento inmediato posible).
 */
export async function ejecutarDepositoDrive(
  carpetaRef: FirebaseFirestore.DocumentReference,
  postulacionId: string,
): Promise<{ estado: EstadoDeposito; drive_carpeta_id?: string; subidos?: number; error?: string }> {
  const ahoraMs = Date.now();
  const turno = await db.runTransaction(async (tx) => {
    const snap = await tx.get(carpetaRef);
    if (!snap.exists) return 'sin_carpeta';
    const d = snap.data() ?? {};
    if (d.drive_sincronizada_en) return 'ya';
    const intMs =
      (d.drive_sync_intentando_en as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    if (intMs && ahoraMs - intMs < 10 * 60 * 1000) return 'ocupado';
    tx.update(carpetaRef, { drive_sync_intentando_en: FieldValue.serverTimestamp() });
    return 'gano';
  });
  if (turno === 'sin_carpeta') return { estado: 'sin_carpeta' };
  if (turno === 'ya') return { estado: 'ya_sincronizada' };
  if (turno === 'ocupado') return { estado: 'ocupado' };

  const res = await sincronizarCarpetaADrive(postulacionId);
  if (res.ok) {
    await carpetaRef.update({
      drive_carpeta_id: res.drive_carpeta_id ?? null,
      drive_sincronizada_en: FieldValue.serverTimestamp(),
      drive_sync_intentando_en: null,
      drive_error: null,
    });
    return { estado: 'ok', drive_carpeta_id: res.drive_carpeta_id, subidos: res.subidos };
  }
  // Falla → libera el lock (reintento inmediato) + deja drive_error visible.
  await carpetaRef.update({
    drive_error: (res.error ?? 'error').slice(0, 500),
    drive_sync_intentando_en: null,
  });
  return { estado: 'error', error: res.error };
}

async function descargar(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Storage ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function extensionDe(nombreOUrl: string): string {
  const limpio = nombreOUrl.split('?')[0];
  const m = limpio.match(/\.(pdf|png|jpe?g|docx?|xlsx?)$/i);
  return m ? `.${m[1].toLowerCase()}` : '.pdf';
}

function mimeDe(nombre: string): string {
  const e = nombre.toLowerCase();
  if (e.endsWith('.png')) return 'image/png';
  if (e.endsWith('.jpg') || e.endsWith('.jpeg')) return 'image/jpeg';
  if (e.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (e.endsWith('.doc')) return 'application/msword';
  return 'application/pdf';
}

function sanitizar(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'sin-nombre'
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
