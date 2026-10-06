import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { cargarAmbitos } from './ambitos';
import {
  COL_INTEGRACIONES,
  COL_LLAVES,
  COL_REGISTRO,
  PERMISOS,
  TOPE_DEFAULT_POR_MIN,
  TOPE_MAX_POR_MIN,
  esPermiso,
} from './catalogo';
import { generarLlave } from './llaves';

/**
 * Administración de la API pública (pestaña "API y llaves", solo admin).
 *
 * Las colecciones api_* son server-only por reglas, así que TODO pasa por aquí
 * con Admin SDK: listar, crear/editar/eliminar integraciones, crear/rotar/
 * revocar llaves y leer el registro. El secreto de una llave se devuelve UNA
 * sola vez (al crear o rotar) y nunca se guarda ni se registra.
 */

function exigirAdmin(req: CallableRequest<unknown>): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  if (String(req.auth.token.rol ?? '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador gestiona la API.');
  }
  return req.auth.uid;
}

const iso = (v: unknown): string | null => {
  const d = (v as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return d ? d.toISOString() : null;
};
const texto = (v: unknown): string => String(v ?? '').trim();

function llavePublica(id: string, d: Record<string, unknown>) {
  // Nunca `key_hash`.
  return {
    id,
    integracion_id: texto(d.integracion_id),
    nombre: texto(d.nombre),
    key_prefix: texto(d.key_prefix),
    estado: texto(d.estado) === 'revocada' ? 'revocada' : 'activa',
    expira_en: iso(d.expira_en),
    revocada_en: iso(d.revocada_en),
    tope_por_min: Number(d.tope_por_min ?? TOPE_DEFAULT_POR_MIN),
    ultimo_uso_en: iso(d.ultimo_uso_en),
    rotada_desde: texto(d.rotada_desde) || null,
    permisos: Array.isArray(d.permisos) ? d.permisos.map(String) : [],
    ambitos: Array.isArray(d.ambitos) ? d.ambitos.map(String) : [],
    creado_en: iso(d.creado_en),
    creado_por: texto(d.creado_por),
  };
}

export const apiListarIntegraciones = onCall({ region: 'us-central1' }, async (req) => {
  exigirAdmin(req);
  const [intSnap, llSnap, ambitos] = await Promise.all([
    db.collection(COL_INTEGRACIONES).orderBy('creado_en', 'desc').limit(200).get(),
    db.collection(COL_LLAVES).limit(1000).get(),
    cargarAmbitos(),
  ]);
  const llavesPor = new Map<string, ReturnType<typeof llavePublica>[]>();
  for (const d of llSnap.docs) {
    const l = llavePublica(d.id, d.data());
    const arr = llavesPor.get(l.integracion_id) ?? [];
    arr.push(l);
    llavesPor.set(l.integracion_id, arr);
  }
  const integraciones = intSnap.docs.map((d) => {
    const x = d.data();
    const llaves = (llavesPor.get(d.id) ?? []).sort((a, b) => {
      // Activas primero; dentro de cada grupo, más recientes arriba.
      if (a.estado !== b.estado) return a.estado === 'activa' ? -1 : 1;
      return (b.creado_en ?? '').localeCompare(a.creado_en ?? '');
    });
    return {
      id: d.id,
      nombre: texto(x.nombre),
      descripcion: texto(x.descripcion),
      estado: texto(x.estado) === 'inactiva' ? 'inactiva' : 'activa',
      creado_en: iso(x.creado_en),
      creado_por: texto(x.creado_por),
      llaves_emitidas: Number(x.llaves_emitidas ?? llaves.length),
      llaves,
    };
  });
  return { integraciones, permisos: PERMISOS, ambitos };
});

export const apiGuardarIntegracion = onCall({ region: 'us-central1' }, async (req) => {
  const uid = exigirAdmin(req);
  const id = texto(req.data?.id);
  const nombre = texto(req.data?.nombre).slice(0, 80);
  const descripcion = texto(req.data?.descripcion).slice(0, 400);
  const estado = texto(req.data?.estado) === 'inactiva' ? 'inactiva' : 'activa';
  if (!nombre) throw new HttpsError('invalid-argument', 'La integración necesita un nombre.');
  const ahora = FieldValue.serverTimestamp();
  if (id) {
    const ref = db.collection(COL_INTEGRACIONES).doc(id);
    if (!(await ref.get()).exists) throw new HttpsError('not-found', 'La integración no existe.');
    await ref.update({ nombre, descripcion, estado, actualizado_en: ahora, actualizado_por: uid });
    logger.info('[api admin] integración actualizada', { id, estado, por: uid });
    return { ok: true as const, id };
  }
  const ref = await db.collection(COL_INTEGRACIONES).add({
    nombre,
    descripcion,
    estado,
    llaves_emitidas: 0,
    creado_en: ahora,
    creado_por: uid,
    actualizado_en: ahora,
    actualizado_por: uid,
  });
  logger.info('[api admin] integración creada', { id: ref.id, por: uid });
  return { ok: true as const, id: ref.id };
});

export const apiEliminarIntegracion = onCall({ region: 'us-central1' }, async (req) => {
  const uid = exigirAdmin(req);
  const id = texto(req.data?.id);
  if (!id) throw new HttpsError('invalid-argument', 'Falta la integración.');
  const ref = db.collection(COL_INTEGRACIONES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La integración no existe.');
  // Solo si NUNCA emitió llaves: en cuanto hubo una, hay auditoría apuntando a ella.
  const llaves = await db.collection(COL_LLAVES).where('integracion_id', '==', id).limit(1).get();
  if (!llaves.empty || Number(snap.data()?.llaves_emitidas ?? 0) > 0) {
    throw new HttpsError(
      'failed-precondition',
      'Esta integración ya emitió llaves: no se borra, se desactiva (queda la auditoría).',
    );
  }
  await ref.delete();
  logger.info('[api admin] integración eliminada', { id, por: uid });
  return { ok: true as const };
});

interface ConfigLlave {
  nombre: string;
  permisos: string[];
  ambitos: string[];
  expira_en: Timestamp | null;
  tope_por_min: number;
}

async function validarConfigLlave(data: Record<string, unknown>): Promise<ConfigLlave> {
  const nombre = texto(data.nombre).slice(0, 80);
  if (!nombre) throw new HttpsError('invalid-argument', 'La llave necesita un nombre.');
  const permisos = Array.isArray(data.permisos) ? [...new Set(data.permisos.map(String))] : [];
  if (permisos.length === 0) throw new HttpsError('invalid-argument', 'Elige al menos un permiso.');
  const desconocido = permisos.find((p) => !esPermiso(p));
  if (desconocido) throw new HttpsError('invalid-argument', `Permiso desconocido: ${desconocido}.`);
  const conocidos = (await cargarAmbitos()).map((a) => a.id);
  const ambitos = Array.isArray(data.ambitos)
    ? [...new Set(data.ambitos.map((a) => String(a).trim().toUpperCase()))]
    : [];
  if (ambitos.length === 0) throw new HttpsError('invalid-argument', 'Elige al menos una empresa.');
  const ajeno = ambitos.find((a) => !conocidos.includes(a));
  if (ajeno) throw new HttpsError('invalid-argument', `Empresa desconocida: ${ajeno}.`);
  let expira: Timestamp | null = null;
  const expRaw = texto(data.expira_en);
  if (expRaw) {
    const d = new Date(expRaw);
    if (Number.isNaN(d.getTime())) throw new HttpsError('invalid-argument', 'Fecha de vencimiento inválida.');
    if (d.getTime() <= Date.now()) throw new HttpsError('invalid-argument', 'El vencimiento debe ser una fecha futura.');
    expira = Timestamp.fromDate(d);
  }
  const tope = Number(data.tope_por_min ?? TOPE_DEFAULT_POR_MIN);
  if (!Number.isInteger(tope) || tope < 1 || tope > TOPE_MAX_POR_MIN) {
    throw new HttpsError('invalid-argument', `El tope por minuto debe estar entre 1 y ${TOPE_MAX_POR_MIN}.`);
  }
  return { nombre, permisos, ambitos, expira_en: expira, tope_por_min: tope };
}

async function emitirLlave(
  integracionId: string,
  cfg: ConfigLlave,
  uid: string,
  rotadaDesde: string | null,
): Promise<{ id: string; secreto: string; key_prefix: string }> {
  const intRef = db.collection(COL_INTEGRACIONES).doc(integracionId);
  const intSnap = await intRef.get();
  if (!intSnap.exists) throw new HttpsError('not-found', 'La integración no existe.');
  // Prefijo único: reintenta si por azar choca (improbable: 32^10).
  for (let intento = 0; intento < 3; intento++) {
    const { secreto, prefijo, hash } = generarLlave();
    const choque = await db.collection(COL_LLAVES).where('key_prefix', '==', prefijo).limit(1).get();
    if (!choque.empty) continue;
    const ref = db.collection(COL_LLAVES).doc();
    const batch = db.batch();
    batch.set(ref, {
      integracion_id: integracionId,
      nombre: cfg.nombre,
      key_prefix: prefijo,
      key_hash: hash,
      estado: 'activa',
      expira_en: cfg.expira_en,
      revocada_en: null,
      tope_por_min: cfg.tope_por_min,
      ultimo_uso_en: null,
      rotada_desde: rotadaDesde,
      permisos: cfg.permisos,
      ambitos: cfg.ambitos,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: uid,
    });
    batch.update(intRef, { llaves_emitidas: FieldValue.increment(1), actualizado_en: FieldValue.serverTimestamp() });
    await batch.commit();
    logger.info('[api admin] llave emitida', { integracion: integracionId, llave: ref.id, prefijo, por: uid });
    return { id: ref.id, secreto, key_prefix: prefijo };
  }
  throw new HttpsError('internal', 'No se pudo generar un prefijo único; intenta de nuevo.');
}

export const apiCrearLlave = onCall({ region: 'us-central1' }, async (req) => {
  const uid = exigirAdmin(req);
  const integracionId = texto(req.data?.integracion_id);
  if (!integracionId) throw new HttpsError('invalid-argument', 'Falta la integración.');
  const cfg = await validarConfigLlave((req.data ?? {}) as Record<string, unknown>);
  const r = await emitirLlave(integracionId, cfg, uid, null);
  // El secreto sale UNA vez. No se vuelve a mostrar ni se registra.
  return { ok: true as const, llave_id: r.id, key_prefix: r.key_prefix, secreto: r.secreto };
});

export const apiRevocarLlave = onCall({ region: 'us-central1' }, async (req) => {
  const uid = exigirAdmin(req);
  const id = texto(req.data?.llave_id);
  if (!id) throw new HttpsError('invalid-argument', 'Falta la llave.');
  const ref = db.collection(COL_LLAVES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La llave no existe.');
  if (snap.data()?.estado === 'revocada') return { ok: true as const, ya: true };
  // Revocar NO borra: la auditoría debe poder decir qué llave hizo qué.
  await ref.update({ estado: 'revocada', revocada_en: FieldValue.serverTimestamp(), revocada_por: uid });
  logger.info('[api admin] llave revocada', { llave: id, por: uid });
  return { ok: true as const, ya: false };
});

export const apiRotarLlave = onCall({ region: 'us-central1' }, async (req) => {
  const uid = exigirAdmin(req);
  const id = texto(req.data?.llave_id);
  if (!id) throw new HttpsError('invalid-argument', 'Falta la llave.');
  const ref = db.collection(COL_LLAVES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La llave no existe.');
  const vieja = snap.data() as Record<string, unknown>;
  if (vieja.estado === 'revocada') throw new HttpsError('failed-precondition', 'La llave ya está revocada; crea una nueva.');
  const cfg: ConfigLlave = {
    nombre: texto(vieja.nombre),
    permisos: Array.isArray(vieja.permisos) ? vieja.permisos.map(String) : [],
    ambitos: Array.isArray(vieja.ambitos) ? vieja.ambitos.map(String) : [],
    expira_en: (vieja.expira_en as Timestamp | null) ?? null,
    tope_por_min: Number(vieja.tope_por_min ?? TOPE_DEFAULT_POR_MIN),
  };
  // La nueva nace ANTES de revocar la vieja: así nunca hay un instante sin llave válida.
  const nueva = await emitirLlave(texto(vieja.integracion_id), cfg, uid, id);
  await ref.update({ estado: 'revocada', revocada_en: FieldValue.serverTimestamp(), revocada_por: uid, rotada_a: nueva.id });
  logger.info('[api admin] llave rotada', { de: id, a: nueva.id, por: uid });
  return { ok: true as const, llave_id: nueva.id, key_prefix: nueva.key_prefix, secreto: nueva.secreto };
});

export const apiListarRegistro = onCall({ region: 'us-central1' }, async (req) => {
  exigirAdmin(req);
  const integracionId = texto(req.data?.integracion_id);
  const limit = Math.min(200, Math.max(1, Number(req.data?.limit ?? 50) || 50));
  let q = db.collection(COL_REGISTRO).orderBy('en', 'desc').limit(limit);
  if (integracionId) q = db.collection(COL_REGISTRO).where('integracion_id', '==', integracionId).orderBy('en', 'desc').limit(limit);
  const snap = await q.get();
  return {
    filas: snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        en: iso(x.en),
        integracion_id: texto(x.integracion_id) || null,
        llave_id: texto(x.llave_id) || null,
        llave_prefijo: texto(x.llave_prefijo) || null,
        metodo: texto(x.metodo),
        ruta: texto(x.ruta),
        status: Number(x.status ?? 0),
        duracion_ms: Number(x.duracion_ms ?? 0),
        ip: texto(x.ip) || null,
        error: texto(x.error) || null,
        limite_degradado: x.limite_degradado === true,
      };
    }),
  };
});
