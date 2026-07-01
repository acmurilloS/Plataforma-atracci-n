import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { verificarCedula } from './verificarCedula';
import { urlPortalDocValida } from './urlPortalDocValida';
import { upsertFormatoEnCarpeta } from './upsertFormatoEnCarpeta';

/**
 * registrarDebidaDiligenciaPortal · el INTEGRANTE diligencia y firma su Debida
 * Diligencia / SAGRILAFT (formato oficial F-CAR-01) desde su portal público
 * (reu 26-jun, decisión B2). Espejo de `registrarDatosBasicosPortal`.
 *
 * - 2 factores: token vigente + cédula (anti fuerza-bruta, transaccional).
 * - Upsert del doc `debida_diligencia` (por postulacion_id): guarda los bloques
 *   1–7 que llena el candidato + las 3 cláusulas + firma, y lo deja en estado
 *   'firmado_integrante'. El bloque 8 (verificación de listas + VoBo) lo completa
 *   después el oficial de cumplimiento (staff), como hoy.
 * - Guarda el PDF oficial F-CAR-01 estampado (visible para la analista en la
 *   carpeta) y marca firma_debida_diligencia_en en la postulación. Evento en eventos/.
 */

// Campos de texto que llena el integrante (bloques 1–7). El bloque 8 es del staff.
const STR_FIELDS = [
  // 1. Empresa y registro (departamento/ciudad los llena el integrante; cargo viene del token)
  'departamento',
  'ciudad_municipio',
  'cargo',
  'tipo_vinculacion',
  // 2. Datos generales
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
  // Familiar en la empresa
  'nombre_apellidos_familiar',
  'parentesco_familiar',
  'cargo_familiar',
  // 3. Cónyuge
  'conyuge_primer_apellido',
  'conyuge_segundo_apellido',
  'conyuge_nombres',
  'conyuge_identificacion',
  'conyuge_tipo_documento',
  'conyuge_telefono',
  'conyuge_ocupacion',
  'conyuge_empleador',
  'conyuge_parentesco',
  // 4. Financiera (detalles de texto)
  'operaciones_moneda_extranjera_detalle',
  'productos_financieros_extranjero_detalle',
  'ingresos_adicionales_observaciones',
];

// Campos booleanos (sí/no) del integrante.
const BOOL_FIELDS = [
  'tiene_familiar_empresa',
  'realiza_operaciones_moneda_extranjera',
  'posee_productos_financieros_extranjero',
  'realiza_actividad_ingresos_adicionales',
  'posee_reconocimiento_publico',
  'posee_vinculo_pep',
  'acepta_clausulas_anticorrupcion',
  'acepta_declaracion_origenes_ingreso',
  'acepta_politicas_laft',
];

function fechaDesde(s: unknown): Timestamp | null {
  const v = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

export const registrarDebidaDiligenciaPortal = onCall({ region: 'us-central1' }, async (req) => {
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
  for (const k of BOOL_FIELDS) {
    if (k in entrada) limpio[k] = entrada[k] === true;
  }
  limpio.fecha_nacimiento = fechaDesde(entrada.fecha_nacimiento);
  limpio.fecha_expedicion_documento = fechaDesde(entrada.fecha_expedicion_documento);

  // PEP: [{ nombre, relacion, identidad, cargo_ocupacion, fecha_desvinculacion(ISO|'') }]
  limpio.vinculados_pep = Array.isArray(entrada.vinculados_pep)
    ? entrada.vinculados_pep
        .slice(0, 10)
        .map((v) => {
          const o = (v ?? {}) as Record<string, unknown>;
          return {
            nombre: String(o.nombre ?? '').trim().slice(0, 160),
            relacion: String(o.relacion ?? '').trim().slice(0, 120),
            identidad: String(o.identidad ?? '').trim().slice(0, 40),
            cargo_ocupacion: String(o.cargo_ocupacion ?? '').trim().slice(0, 160),
            fecha_desvinculacion: String(o.fecha_desvinculacion ?? '').trim().slice(0, 10),
          };
        })
        .filter((v) => v.nombre)
    : [];

  const ahora = FieldValue.serverTimestamp();

  // Upsert por postulacion_id (puede existir un borrador creado por el analista).
  const ddSnap = await db
    .collection('debida_diligencia')
    .where('postulacion_id', '==', postulacionId)
    .limit(1)
    .get();

  const comun = {
    ...limpio,
    estado: 'firmado_integrante',
    fecha_diligenciamiento: ahora,
    // firma_integrante_url = PNG de la firma (para re-estampar en correcciones),
    // igual que en Datos Básicos. El PDF firmado va en debida_diligencia_pdf_url.
    firma_integrante_url: firmaImagenUrl || null,
    fecha_firma_integrante: ahora,
    debida_diligencia_pdf_url: pdfUrl || null,
    actualizado_por: 'candidato_portal',
    actualizado_en: ahora,
  };

  if (ddSnap.empty) {
    await db.collection('debida_diligencia').add({
      postulacion_id: postulacionId,
      candidato_id: t.candidato_id ?? null,
      candidato_nombre: String(t.candidato_nombre ?? ''),
      empresa_codigo: String(t.empresa_codigo ?? ''),
      empresa_nombre: String(t.empresa_nombre ?? ''),
      tipo_registro: 'nuevo_integrante',
      cargo: String(entrada.cargo ?? t.cargo_nombre ?? ''),
      // Bloque 8 (oficial de cumplimiento) — se completa después.
      verificado_listas_vinculantes: null,
      observaciones_verificacion: '',
      vobo_oficial_cumplimiento: false,
      ...comun,
      creado_por: 'candidato_portal',
      creado_en: ahora,
    });
  } else {
    await ddSnap.docs[0].ref.update(comun);
  }

  // Marca en la postulación (mismos nombres que lee el FirmaDigitalBanner del
  // DebidaDiligenciaTab: firma_debida_diligencia_imagen_url / _en / _url).
  const updatePost: Record<string, unknown> = { firma_debida_diligencia_en: ahora };
  if (firmaImagenUrl) updatePost.firma_debida_diligencia_imagen_url = firmaImagenUrl;
  if (pdfUrl) {
    updatePost.debida_diligencia_pdf_url = pdfUrl;
    updatePost.firma_debida_diligencia_url = pdfUrl;
  }
  await db.collection('postulaciones').doc(postulacionId).update(updatePost);

  // Refleja el F-CAR-01 estampado en la carpeta real (documentos_candidato) para
  // que aparezca "entregado" con Ver PDF y cuente en la completitud.
  if (pdfUrl) {
    await upsertFormatoEnCarpeta({
      postulacionId,
      clave: 'debida_diligencia',
      pdfUrl,
      candidatoId: String(t.candidato_id ?? ''),
      candidatoNombre: String(t.candidato_nombre ?? ''),
    });
  }

  if (pdfUrl) {
    await db.collection('documentos_portal').add({
      postulacion_id: postulacionId,
      candidato_id: t.candidato_id ?? null,
      nombre_archivo: 'Debida Diligencia / SAGRILAFT (diligenciado y firmado)',
      url: pdfUrl,
      via: 'debida_diligencia_portal',
      subido_en: ahora,
      creado_en: ahora,
      creado_por: 'candidato_portal',
    });
  }

  await db.collection('eventos').add({
    tipo: 'debida_diligencia_diligenciada_portal',
    postulacion_id: postulacionId,
    token,
    creado_en: ahora,
    creado_por: 'candidato_portal',
  });

  logger.info('[portal] debida diligencia diligenciada', { token, postulacionId });
  return { ok: true as const };
});
