import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * editarDatosCandidato · corrige datos de registro del candidato/integrante
 * (cédula, nombre, contacto) — reu 26-jun. Estos datos los consumen otros
 * procesos (nómina/contrato), por eso se corrigen ANTES de exámenes; si ya
 * pasó, la UI avisa, pero la corrección sigue siendo posible (responsabilidad
 * del staff) y queda con trazabilidad.
 *
 * - Permisos: analista / coordinador / gh / admin (NUNCA el candidato).
 * - Re-denormaliza nombre/correo/teléfono en TODAS las postulaciones del
 *   candidato (esos campos viven copiados en cada postulación).
 * - Auditoría append-only en `eventos`: quién, cuándo, qué campo (antes→después).
 */

const ROLES = ['analista', 'coordinador', 'gh', 'admin'];
const DOC_TIPOS = ['CC', 'CE', 'PA', 'PEP', 'NIT'];
const CAMPOS = ['nombres', 'apellidos', 'documento_tipo', 'documento_numero', 'email', 'telefono'] as const;

export const editarDatosCandidato = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const token = req.auth.token as Record<string, unknown>;
  const rol = String(token.rol ?? '');
  if (!ROLES.includes(rol)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para editar datos del candidato.');
  }

  const candidatoId = String(req.data?.candidato_id ?? '').trim();
  if (!candidatoId) throw new HttpsError('invalid-argument', 'Falta el candidato.');
  const datos = (req.data?.datos ?? {}) as Record<string, unknown>;

  const candRef = db.collection('candidatos').doc(candidatoId);
  const candSnap = await candRef.get();
  if (!candSnap.exists) throw new HttpsError('not-found', 'El candidato no existe.');
  const actual = candSnap.data() as Record<string, unknown>;

  // ── Normaliza + valida solo los campos que llegan ──────────────────────────
  const limpio: Record<string, unknown> = {};
  if ('nombres' in datos) {
    const v = String(datos.nombres ?? '').trim();
    if (!v) throw new HttpsError('invalid-argument', 'El nombre no puede quedar vacío.');
    limpio.nombres = v.slice(0, 80);
  }
  if ('apellidos' in datos) {
    const v = String(datos.apellidos ?? '').trim();
    if (!v) throw new HttpsError('invalid-argument', 'El apellido no puede quedar vacío.');
    limpio.apellidos = v.slice(0, 80);
  }
  if ('documento_tipo' in datos) {
    const raw = datos.documento_tipo;
    const v = raw == null || raw === '' ? null : String(raw);
    if (v !== null && !DOC_TIPOS.includes(v)) {
      throw new HttpsError('invalid-argument', 'Tipo de documento inválido.');
    }
    limpio.documento_tipo = v;
  }
  if ('documento_numero' in datos) {
    const v = datos.documento_numero == null ? null : String(datos.documento_numero).trim();
    limpio.documento_numero = v || null;
  }
  if ('email' in datos) {
    const v = String(datos.email ?? '').trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      throw new HttpsError('invalid-argument', 'Correo inválido.');
    }
    limpio.email = v;
  }
  if ('telefono' in datos) {
    limpio.telefono = String(datos.telefono ?? '').trim();
  }

  // ── Diff: solo lo que realmente cambió ─────────────────────────────────────
  const noStr = (c: string) => c === 'documento_tipo' || c === 'documento_numero';
  const cambios: { campo: string; antes: unknown; despues: unknown }[] = [];
  for (const campo of CAMPOS) {
    if (!(campo in limpio)) continue;
    const antes = actual[campo] ?? (noStr(campo) ? null : '');
    if (limpio[campo] !== antes) {
      cambios.push({ campo, antes, despues: limpio[campo] });
    }
  }
  if (cambios.length === 0) return { ok: true as const, sin_cambios: true, cambios: [] };

  // Solo si la cédula REALMENTE cambió (tipo o número), no permitir colisión con
  // OTRO candidato. La identidad canónica es el par (documento_tipo,
  // documento_numero) — igual que el dedupe de onCandidatoCreate, para no
  // bloquear correcciones legítimas (p.ej. CC 123 vs CE 123 = personas distintas,
  // o editar solo el nombre cuando ya hay dato sucio con ese número).
  const docCambio = cambios.some(
    (c) => c.campo === 'documento_numero' || c.campo === 'documento_tipo',
  );
  const numeroEfectivo =
    'documento_numero' in limpio ? limpio.documento_numero : (actual.documento_numero ?? null);
  if (docCambio && numeroEfectivo) {
    const tipoEfectivo =
      'documento_tipo' in limpio ? limpio.documento_tipo : (actual.documento_tipo ?? null);
    const dup = await db
      .collection('candidatos')
      .where('documento_tipo', '==', tipoEfectivo)
      .where('documento_numero', '==', numeroEfectivo)
      .limit(3)
      .get();
    if (dup.docs.some((d) => d.id !== candidatoId)) {
      throw new HttpsError('already-exists', 'Ya existe otro candidato con esa cédula.');
    }
  }

  const ahora = FieldValue.serverTimestamp();
  const batch = db.batch();

  // 1) Candidato.
  batch.update(candRef, { ...limpio, actualizado_por: req.auth.uid, actualizado_en: ahora });

  // 2) Re-denormaliza en TODAS las postulaciones del candidato.
  const nombreCambio = 'nombres' in limpio || 'apellidos' in limpio;
  const emailCambio = 'email' in limpio;
  const telCambio = 'telefono' in limpio;
  // La cédula vive COPIADA en la postulación y CONGELADA en el doc de examen; sin
  // re-denormalizarla, la orden a gestores (y nómina) siguen con el valor viejo
  // (reu 18-ago: una orden salió con el número de celular en vez de la cédula).
  const docNumCambio = 'documento_numero' in limpio;
  const docTipoCambio = 'documento_tipo' in limpio;
  if (nombreCambio || emailCambio || telCambio || docNumCambio || docTipoCambio) {
    const nuevoNombre = `${('nombres' in limpio ? limpio.nombres : actual.nombres) ?? ''} ${
      ('apellidos' in limpio ? limpio.apellidos : actual.apellidos) ?? ''
    }`.trim();
    const posts = await db.collection('postulaciones').where('candidato_id', '==', candidatoId).get();
    for (const p of posts.docs) {
      const patch: Record<string, unknown> = { actualizado_por: req.auth.uid, actualizado_en: ahora };
      if (nombreCambio) patch.candidato_nombre = nuevoNombre;
      if (emailCambio) patch.candidato_email = limpio.email;
      if (telCambio) patch.candidato_telefono = limpio.telefono;
      if (docNumCambio) patch.documento_numero = limpio.documento_numero;
      if (docTipoCambio) patch.documento_tipo = limpio.documento_tipo;
      batch.update(p.ref, patch);
    }
  }

  // 2b) Sincroniza el snapshot de cédula en los exámenes del candidato (se congela
  // al entrar a exámenes). Así la pantalla de Exámenes y el botón "Reenviar a
  // gestores" quedan ya con la cédula corregida (reu 18-ago).
  if (docNumCambio || docTipoCambio) {
    const exams = await db
      .collection('examenes_medicos')
      .where('candidato_id', '==', candidatoId)
      .get();
    for (const ex of exams.docs) {
      const patch: Record<string, unknown> = { actualizado_por: req.auth.uid, actualizado_en: ahora };
      if (docNumCambio) patch.documento_numero = limpio.documento_numero;
      if (docTipoCambio) patch.documento_tipo = limpio.documento_tipo;
      batch.update(ex.ref, patch);
    }
  }

  // 2c) Refresca el 2º factor (cédula) en los tokens del portal del candidato. Sin
  // esto, editar la cédula DESPUÉS de enviar el link deja al candidato BLOQUEADO de
  // su portal: la cédula real ya no calza con el snapshot del token (audit 18-ago).
  if (docNumCambio) {
    const toks = await db
      .collection('portal_candidato_tokens')
      .where('candidato_id', '==', candidatoId)
      .get();
    for (const t of toks.docs) {
      batch.update(t.ref, { documento_numero: limpio.documento_numero });
    }
  }

  // 3) Auditoría append-only.
  const evRef = db.collection('eventos').doc();
  batch.set(evRef, {
    id: evRef.id,
    tipo: 'datos_candidato_editados',
    candidato_id: candidatoId,
    postulacion_id: String(req.data?.postulacion_id ?? '') || null,
    cambios,
    por_uid: req.auth.uid,
    por_nombre: String(token.name ?? 'Staff'),
    creado_en: ahora,
    creado_por: req.auth.uid,
  });

  await batch.commit();
  logger.info('editarDatosCandidato', {
    candidato: candidatoId,
    campos: cambios.map((c) => c.campo),
    por: req.auth.uid,
  });
  return { ok: true as const, cambios };
});
