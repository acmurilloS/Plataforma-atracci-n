import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { formatearConsecutivo } from './onVacanteCreate';

/**
 * editarDatosVacante · reu líder Juan Sebastián Cañón (19-ago). Un líder creó su
 * vacante y necesitaba corregir la SEDE, pero la app no dejaba editar una vacante
 * ya creada (VacanteForm es solo de creación) y las reglas de Firestore no permiten
 * que un `lider` actualice vacantes. Esta callable (Admin SDK) permite editar la
 * IDENTIFICACIÓN (empresa/sede/unidad/criticidad/tipo/duración) de forma controlada:
 *
 *  - Puede editar el STAFF (analista/coordinador/gh/admin) o el LÍDER CREADOR
 *    (lider_uid == uid) — así el propio líder corrige su solicitud sin abrir las
 *    reglas a todos los líderes.
 *  - Solo en estados TEMPRANOS (no cuando ya hay terna/contratación/cierre): cambiar
 *    la sede a mitad del proceso desordena el sourcing. El staff tiene un poco más
 *    de margen (puede editar en_proceso); nadie edita una vacante cerrada.
 *  - Si cambia empresa o sede, RECALCULA el prefijo del consecutivo (conserva el
 *    número) para que no quede inconsistente con la nueva ubicación.
 */

const STAFF = ['analista', 'coordinador', 'gh', 'admin'];
// Estados donde cambiar la identificación ya es disruptivo (para el líder).
const BLOQUEADOS_LIDER = ['terna_enviada', 'seleccionado', 'en_contratacion', 'cerrada', 'desierta', 'cancelada'];
// Estados terminales: nadie edita la identificación (ni el staff).
const BLOQUEADOS_TODOS = ['cerrada', 'desierta', 'cancelada'];

const CRITICIDADES = ['Baja', 'Media', 'Alta'];
const TIPOS = ['reemplazo_indefinido', 'aumento_planta', 'necesidad_temporal'];

function s(v: unknown, max = 120): string {
  return String(v ?? '').trim().slice(0, max);
}

export const editarDatosVacante = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const uid = req.auth.uid;
  const rol = String(req.auth.token.rol ?? '');
  const esStaff = STAFF.includes(rol);

  const vacanteId = s(req.data?.vacante_id);
  if (!vacanteId) throw new HttpsError('invalid-argument', 'Falta vacante_id.');
  const c = (req.data?.cambios ?? {}) as Record<string, unknown>;

  const ref = db.collection('vacantes').doc(vacanteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La vacante no existe.');
  const vac = snap.data() as Record<string, unknown>;

  // Permiso: staff o el líder creador de ESTA vacante.
  const esCreador = String(vac.lider_uid ?? '') === uid;
  if (!esStaff && !esCreador) {
    throw new HttpsError('permission-denied', 'Solo el líder solicitante o el equipo pueden editar esta vacante.');
  }

  const estado = String(vac.estado ?? '');
  if (BLOQUEADOS_TODOS.includes(estado)) {
    throw new HttpsError('failed-precondition', 'La vacante ya está cerrada; no se puede editar.');
  }
  if (!esStaff && BLOQUEADOS_LIDER.includes(estado)) {
    throw new HttpsError(
      'failed-precondition',
      'El proceso ya avanzó (terna/contratación). Pídele al equipo de Atracción que haga el cambio.',
    );
  }

  // Construye el patch solo con lo que llegó (identificación).
  const patch: Record<string, unknown> = {};
  const empresaCodigo = s(c.empresa_codigo, 20);
  const sedeCodigo = s(c.sede_codigo, 20);
  if (empresaCodigo) {
    patch.empresa_codigo = empresaCodigo;
    patch.empresa_nombre = s(c.empresa_nombre);
  }
  if (sedeCodigo) {
    patch.sede_codigo = sedeCodigo;
    patch.sede_nombre = s(c.sede_nombre);
  }
  if ('unidad_id' in c) {
    patch.unidad_id = s(c.unidad_id, 60);
    patch.unidad_nombre = s(c.unidad_nombre);
  }
  if (c.criticidad != null) {
    const crit = s(c.criticidad, 10);
    if (!CRITICIDADES.includes(crit)) throw new HttpsError('invalid-argument', 'Criticidad inválida.');
    patch.criticidad = crit;
  }
  if (c.tipo_solicitud != null) {
    const tipo = s(c.tipo_solicitud, 40);
    if (!TIPOS.includes(tipo)) throw new HttpsError('invalid-argument', 'Tipo de solicitud inválido.');
    patch.tipo_solicitud = tipo;
    // Coherencia de los campos dependientes del tipo.
    if (tipo === 'necesidad_temporal') {
      const meses = Number(c.temporalidad_meses);
      patch.temporalidad_meses = Number.isFinite(meses) && meses > 0 ? Math.round(meses) : null;
      patch.temporalidad_descripcion = s(c.temporalidad_descripcion, 200);
      patch.reemplaza_a_nombre = '';
    } else if (tipo === 'reemplazo_indefinido') {
      patch.reemplaza_a_nombre = s(c.reemplaza_a_nombre);
      patch.temporalidad_meses = null;
      patch.temporalidad_descripcion = '';
    } else {
      patch.reemplaza_a_nombre = '';
      patch.temporalidad_meses = null;
      patch.temporalidad_descripcion = '';
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'No hay cambios para guardar.');
  }

  // Recalcula el prefijo del consecutivo si cambió empresa o sede (conserva el número).
  const empresaFinal = (patch.empresa_codigo as string) ?? String(vac.empresa_codigo ?? '');
  const sedeFinal = (patch.sede_codigo as string) ?? String(vac.sede_codigo ?? '');
  const cambioUbicacion =
    (patch.empresa_codigo && patch.empresa_codigo !== vac.empresa_codigo) ||
    (patch.sede_codigo && patch.sede_codigo !== vac.sede_codigo);
  let consecutivoNuevo: string | null = null;
  if (cambioUbicacion && typeof vac.consecutivo === 'string' && vac.consecutivo) {
    const partes = vac.consecutivo.split('-');
    const numero = Number(partes[partes.length - 1]);
    if (Number.isFinite(numero)) {
      consecutivoNuevo = formatearConsecutivo(empresaFinal, sedeFinal, numero);
      patch.consecutivo = consecutivoNuevo;
    }
  }

  patch.actualizado_en = FieldValue.serverTimestamp();
  patch.actualizado_por = uid;

  await ref.update(patch);

  await db.collection('eventos').add({
    tipo: 'vacante.identificacion_editada',
    entidad_tipo: 'vacante',
    entidad_id: vacanteId,
    vacante_id: vacanteId,
    por_uid: uid,
    por_rol: rol,
    campos: Object.keys(patch).filter((k) => k !== 'actualizado_en' && k !== 'actualizado_por'),
    consecutivo_nuevo: consecutivoNuevo,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: uid,
  });

  logger.info('editarDatosVacante', { vacanteId, uid, rol, campos: Object.keys(patch), consecutivoNuevo });
  return { ok: true as const, consecutivo: consecutivoNuevo ?? String(vac.consecutivo ?? '') };
});
