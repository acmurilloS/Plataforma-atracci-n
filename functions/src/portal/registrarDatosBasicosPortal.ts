import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { verificarCedula } from './verificarCedula';
import { urlPortalDocValida } from './urlPortalDocValida';
import { upsertFormatoEnCarpeta } from './upsertFormatoEnCarpeta';

/**
 * registrarDatosBasicosPortal · el INTEGRANTE diligencia y firma sus Datos
 * Básicos (DGH-F-05) desde su portal público (reu 26-jun). Reemplaza la captura
 * manual del lado de las analistas: ahora lo llena el candidato (como el SAGRILAFT).
 *
 * - 2 factores: token vigente + cédula (anti fuerza-bruta, transaccional).
 * - Guarda/actualiza el doc `datos_basicos_integrante` (upsert por postulacion_id)
 *   con los campos del integrante (NO caja/ARL/riesgo: esos los llena GH) y lo deja
 *   en estado 'diligenciado_integrante'.
 * - Guarda el PDF oficial estampado (visible para la analista en la carpeta) y
 *   marca firma_datos_basicos_en en la postulación. Deja registro en eventos/.
 */

// Campos de texto que llena el integrante (caja/ARL/riesgo NO: son de GH).
const STR_FIELDS = [
  'tipo_contratacion',
  'nombres',
  'apellidos',
  'documento_tipo',
  'documento_numero',
  'documento_ciudad_expedicion',
  'documento_dpto_expedicion',
  'direccion',
  'barrio',
  'ciudad_domicilio',
  'telefono_fijo',
  'celular',
  'lugar_nacimiento',
  'estado_civil',
  'profesion_actividad',
  'genero',
  'grupo_sanguineo',
  'alergico_a',
  'dependiente_medicamento',
  'libreta_militar_numero',
  'libreta_militar_clase',
  'correo_electronico',
  'cuenta_banco_numero',
  'entidad_bancaria',
  'fondo_pensiones_obligatorias',
  'entidad_promotora_salud',
  'fondo_cesantias',
  'conyuge_nombre',
  'conyuge_documento',
  'conyuge_profesion_actividad',
  'nombre_familiar_organizacion',
  'observaciones',
  'talla_calzado',
  'talla_pantalon',
  'talla_chaleco',
  'talla_guantes',
  'talla_overol',
  'talla_camisa_blusa',
  'talla_otros',
];

function fechaDesde(s: unknown): Timestamp | null {
  const v = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

export const registrarDatosBasicosPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const cedula = String(req.data?.cedula ?? '').trim();
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');

  const pdfUrl = String(req.data?.pdf_url ?? '').trim();
  const firmaImagenUrl = String(req.data?.firma_imagen_url ?? '').trim();
  if (pdfUrl && !urlPortalDocValida(pdfUrl, token)) {
    throw new HttpsError('invalid-argument', 'URL del documento inválida.');
  }
  if (firmaImagenUrl && !urlPortalDocValida(firmaImagenUrl, token)) {
    throw new HttpsError('invalid-argument', 'URL de firma inválida.');
  }

  const ref = db.collection('portal_candidato_tokens').doc(token);
  const tSnap = await ref.get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
  if (!tokenVigente(t)) {
    throw new HttpsError('failed-precondition', 'El enlace expiró o fue revocado.');
  }

  // 2º factor: cédula.
  const ced = await verificarCedula(ref, cedula);
  if (!ced.ok) {
    throw new HttpsError('permission-denied', 'Cédula incorrecta o bloqueada. Verifica e intenta de nuevo.');
  }

  const postulacionId = String(t.postulacion_id ?? '');
  if (!postulacionId) throw new HttpsError('failed-precondition', 'Token sin postulación.');

  const entrada = (req.data?.datos ?? {}) as Record<string, unknown>;
  const limpio: Record<string, unknown> = {};
  for (const k of STR_FIELDS) {
    if (k in entrada) limpio[k] = String(entrada[k] ?? '').trim().slice(0, 300);
  }
  limpio.fecha_nacimiento = fechaDesde(entrada.fecha_nacimiento);
  limpio.conyuge_fecha_nacimiento = fechaDesde(entrada.conyuge_fecha_nacimiento);
  limpio.tiene_familiares_organizacion = entrada.tiene_familiares_organizacion === true;
  // Hijos: [{ nombre, fecha_nacimiento(ISO yyyy-mm-dd) }]
  limpio.hijos = Array.isArray(entrada.hijos)
    ? entrada.hijos
        .slice(0, 5)
        .map((h) => {
          const o = (h ?? {}) as Record<string, unknown>;
          return {
            nombre: String(o.nombre ?? '').trim().slice(0, 120),
            fecha_nacimiento: String(o.fecha_nacimiento ?? '').trim().slice(0, 10),
          };
        })
        .filter((h) => h.nombre)
    : [];
  // Contactos de emergencia.
  const emerg = (n: number) => {
    const o = (entrada[`emergencia_contacto_${n}`] ?? {}) as Record<string, unknown>;
    return {
      nombre: String(o.nombre ?? '').trim().slice(0, 120),
      telefono: String(o.telefono ?? '').trim().slice(0, 40),
    };
  };
  limpio.emergencia_contacto_1 = emerg(1);
  limpio.emergencia_contacto_2 = emerg(2);

  const ahora = FieldValue.serverTimestamp();

  // Upsert por postulacion_id (puede existir un borrador previo).
  const dbiSnap = await db
    .collection('datos_basicos_integrante')
    .where('postulacion_id', '==', postulacionId)
    .limit(1)
    .get();

  const comun = {
    ...limpio,
    estado: 'diligenciado_integrante',
    firma_integrante_url: firmaImagenUrl || null,
    fecha_firma_integrante: ahora,
    datos_basicos_pdf_url: pdfUrl || null,
    actualizado_por: 'candidato_portal',
    actualizado_en: ahora,
  };

  if (dbiSnap.empty) {
    await db.collection('datos_basicos_integrante').add({
      postulacion_id: postulacionId,
      candidato_id: t.candidato_id ?? null,
      candidato_nombre: String(t.candidato_nombre ?? ''),
      empresa_codigo: String(t.empresa_codigo ?? ''),
      empresa_nombre: String(t.empresa_nombre ?? ''),
      ...comun,
      creado_por: 'candidato_portal',
      creado_en: ahora,
    });
  } else {
    await dbiSnap.docs[0].ref.update(comun);
  }

  // Marca en la postulación (el resolver muestra "ya diligenciado") + visible al staff.
  // Usa los MISMOS nombres de campo que lee el FirmaDigitalBanner del DatosBasicosTab:
  // firma_datos_basicos_imagen_url (firma), firma_datos_basicos_en (fecha), firma_datos_basicos_url (PDF).
  const updatePost: Record<string, unknown> = { firma_datos_basicos_en: ahora };
  if (firmaImagenUrl) updatePost.firma_datos_basicos_imagen_url = firmaImagenUrl;
  if (pdfUrl) {
    updatePost.datos_basicos_pdf_url = pdfUrl;
    updatePost.firma_datos_basicos_url = pdfUrl;
  }
  await db.collection('postulaciones').doc(postulacionId).update(updatePost);

  // Refleja el DGH-F-05 estampado en la carpeta real (documentos_candidato) para
  // que aparezca "entregado" con Ver PDF y cuente en la completitud.
  if (pdfUrl) {
    await upsertFormatoEnCarpeta({
      postulacionId,
      clave: 'datos_basicos_integrante',
      pdfUrl,
      candidatoId: String(t.candidato_id ?? ''),
      candidatoNombre: String(t.candidato_nombre ?? ''),
    });
  }

  if (pdfUrl) {
    await db.collection('documentos_portal').add({
      postulacion_id: postulacionId,
      candidato_id: t.candidato_id ?? null,
      nombre_archivo: 'Datos Básicos del Integrante (diligenciado y firmado)',
      url: pdfUrl,
      via: 'datos_basicos_portal',
      subido_en: ahora,
      creado_en: ahora,
      creado_por: 'candidato_portal',
    });
  }

  await db.collection('eventos').add({
    tipo: 'datos_basicos_diligenciados_portal',
    postulacion_id: postulacionId,
    token,
    creado_en: ahora,
    creado_por: 'candidato_portal',
  });

  logger.info('[portal] datos básicos diligenciados', { token, postulacionId });
  return { ok: true as const };
});
