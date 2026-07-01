import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { upsertFormatoEnCarpeta } from '../portal/upsertFormatoEnCarpeta';

/**
 * regenerarFormatoOficial · corrige un campo de un formato CONTROLADO por Calidad
 * (Datos Básicos DGH-F-05 / SAGRILAFT) ya diligenciado y REGENERA el PDF con
 * trazabilidad (reu 26-jun, decisión A "híbrida"):
 *
 *  - El PDF corregido lo estampa el cliente (mismo formato oficial) y lo sube a
 *    `formatos_corregidos/{postulacion_id}/` (el anterior NO se borra).
 *  - Esta callable registra una VERSIÓN nueva en `formatos_versiones/{postulacion_id}`
 *    (v, fecha, pdf_url, quién, qué campos antes→después) y deja un evento
 *    append-only en `eventos`. Nunca hay edición silenciosa.
 *  - Actualiza el doc fuente (datos_basicos_integrante) con los campos corregidos.
 *
 * Permisos: staff/analista (analista/gh/coordinador/admin).
 */

const ROLES = ['analista', 'gh', 'coordinador', 'admin'];
const TIPOS = ['datos_basicos', 'debida_diligencia'];
// Campos corregibles del doc de Datos Básicos (incluye empresa/tipo de contrato,
// los que repercuten en contrato/nómina). NO incluye caja/ARL/riesgo (libres de GH).
const CORREGIBLES = [
  'tipo_contratacion',
  'empresa_codigo',
  'empresa_nombre',
  'nombres',
  'apellidos',
  'documento_tipo',
  'documento_numero',
  'documento_ciudad_expedicion',
  'documento_dpto_expedicion',
  'correo_electronico',
  'celular',
  'direccion',
  'ciudad_domicilio',
  'fondo_pensiones_obligatorias',
  'entidad_promotora_salud',
  'fondo_cesantias',
  'entidad_bancaria',
  'cuenta_banco_numero',
];
// Campos corregibles del doc de Debida Diligencia / SAGRILAFT (identidad + registro).
const CORREGIBLES_DD = [
  'departamento',
  'ciudad_municipio',
  'cargo',
  'tipo_vinculacion',
  'primer_apellido',
  'segundo_apellido',
  'nombres',
  'identificacion',
  'tipo_documento',
  'tipo_documento_otro',
  'celular',
  'pais',
  'lugar_expedicion',
  'direccion_residencial',
  'correo_electronico',
];

export const regenerarFormatoOficial = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const token = req.auth.token as Record<string, unknown>;
  const rol = String(token.rol ?? '');
  if (!ROLES.includes(rol)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para corregir formatos.');
  }

  const postulacionId = String(req.data?.postulacion_id ?? '').trim();
  const tipo = String(req.data?.tipo ?? '').trim();
  const pdfUrl = String(req.data?.pdf_url ?? '').trim();
  if (!postulacionId || !TIPOS.includes(tipo)) {
    throw new HttpsError('invalid-argument', 'Faltan datos o tipo de formato inválido.');
  }
  // El PDF debe haberse subido a la ruta del staff de ESTA postulación.
  if (!pdfUrl || !pdfUrl.includes(`formatos_corregidos%2F${postulacionId}%2F`)) {
    throw new HttpsError('invalid-argument', 'URL del documento regenerado inválida.');
  }

  // Diff de campos corregidos (para la traza): [{campo, antes, despues}].
  const cambiosIn = Array.isArray(req.data?.campos_corregidos) ? req.data.campos_corregidos : [];
  const campos = cambiosIn
    .map((c: unknown) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return {
        campo: String(o.campo ?? '').slice(0, 80),
        antes: String(o.antes ?? '').slice(0, 200),
        despues: String(o.despues ?? '').slice(0, 200),
      };
    })
    .filter((c: { campo: string }) => c.campo);

  const porNombre = String(token.name ?? 'Staff');
  const ahora = FieldValue.serverTimestamp();

  // Versión nueva (atómico: lee la última y agrega).
  const verRef = db.collection('formatos_versiones').doc(postulacionId);
  const version = await db.runTransaction(async (tx) => {
    const snap = await tx.get(verRef);
    const data = (snap.exists ? snap.data() : {}) ?? {};
    const bloque = (data[tipo] as Record<string, unknown> | undefined) ?? {};
    const v = Number(bloque.ultima_version ?? 0) + 1;
    const entrada = {
      v,
      fecha: Timestamp.now(),
      pdf_url: pdfUrl,
      regenerado_por: req.auth!.uid,
      regenerado_nombre: porNombre,
      campos,
    };
    tx.set(
      verRef,
      {
        postulacion_id: postulacionId,
        [tipo]: { ultima_version: v, versiones: FieldValue.arrayUnion(entrada) },
        actualizado_en: ahora,
      },
      { merge: true },
    );
    return v;
  });

  // Aplica las correcciones al doc fuente + apunta al PDF nuevo.
  if (tipo === 'datos_basicos') {
    const datosActualizados = (req.data?.datos_actualizados ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of CORREGIBLES) {
      if (k in datosActualizados) patch[k] = String(datosActualizados[k] ?? '').trim().slice(0, 300);
    }
    patch.datos_basicos_pdf_url = pdfUrl;
    patch.actualizado_por = req.auth.uid;
    patch.actualizado_en = ahora;
    const dbi = await db
      .collection('datos_basicos_integrante')
      .where('postulacion_id', '==', postulacionId)
      .limit(1)
      .get();
    if (!dbi.empty) await dbi.docs[0].ref.update(patch);
    await db.collection('postulaciones').doc(postulacionId).update({ datos_basicos_pdf_url: pdfUrl });
    await upsertFormatoEnCarpeta({ postulacionId, clave: 'datos_basicos_integrante', pdfUrl });
  } else if (tipo === 'debida_diligencia') {
    const datosActualizados = (req.data?.datos_actualizados ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of CORREGIBLES_DD) {
      if (k in datosActualizados) patch[k] = String(datosActualizados[k] ?? '').trim().slice(0, 300);
    }
    patch.debida_diligencia_pdf_url = pdfUrl;
    // NO tocar firma_integrante_url: debe seguir siendo el PNG de la firma para
    // que las próximas correcciones puedan re-incrustar la firma (si se pisa con
    // el PDF, el siguiente estampado falla al hacer embedPng de un PDF).
    patch.actualizado_por = req.auth.uid;
    patch.actualizado_en = ahora;
    const dd = await db
      .collection('debida_diligencia')
      .where('postulacion_id', '==', postulacionId)
      .limit(1)
      .get();
    if (!dd.empty) await dd.docs[0].ref.update(patch);
    await db
      .collection('postulaciones')
      .doc(postulacionId)
      .update({ debida_diligencia_pdf_url: pdfUrl, firma_debida_diligencia_url: pdfUrl });
    await upsertFormatoEnCarpeta({ postulacionId, clave: 'debida_diligencia', pdfUrl });
  }

  // Evento append-only (read: staff).
  await db.collection('eventos').add({
    tipo: 'formato_corregido',
    formato: tipo,
    postulacion_id: postulacionId,
    version,
    campos,
    pdf_url: pdfUrl,
    por_uid: req.auth.uid,
    por_nombre: porNombre,
    creado_en: ahora,
    creado_por: req.auth.uid,
  });

  logger.info('regenerarFormatoOficial', { postulacionId, tipo, version, por: req.auth.uid });
  return { ok: true as const, version };
});
