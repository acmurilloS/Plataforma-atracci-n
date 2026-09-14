import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { asegurarPortalEscribible } from './portalEscribible';
import { verificarCedula } from './verificarCedula';
import { CLAVES_APORTA_CANDIDATO } from '../documentos/catalogoCarpeta';
import { archivosDe } from './registrarDocumentoCarpetaPortal';

/**
 * quitarArchivoCarpetaPortal · reporte Karen 09-sep.
 *
 * Complemento de `registrarDocumentoCarpetaPortal`: en los ítems que admiten
 * VARIOS archivos, subir ya no reemplaza (agrega), así que el candidato necesita
 * poder QUITAR uno si se equivocó. Sin esto quedaría atrapado con un archivo malo.
 *
 * Mismas garantías: token vigente + cédula como 2º factor, solo claves que aporta
 * el candidato, y NUNCA sobre un documento ya `verificado` por GH. Solo borra la
 * referencia lógica (el binario queda en Storage; GH conserva la trazabilidad).
 */
export const quitarArchivoCarpetaPortal = onCall({ region: 'us-central1' }, async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const cedula = String(req.data?.cedula ?? '').trim();
  const clave = String(req.data?.clave ?? '').trim();
  const url = String(req.data?.url ?? '').trim();

  if (!token) throw new HttpsError('invalid-argument', 'Falta token.');
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) throw new HttpsError('not-found', 'Token inválido.');
  if (!clave || !CLAVES_APORTA_CANDIDATO.includes(clave)) {
    throw new HttpsError('invalid-argument', 'Documento no válido para el candidato.');
  }
  if (!url) throw new HttpsError('invalid-argument', 'Falta el archivo a quitar.');

  const tokenRef = db.collection('portal_candidato_tokens').doc(token);
  const tSnap = await tokenRef.get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Token no encontrado.');
  const t = tSnap.data() as Record<string, unknown>;
  if (!tokenVigente(t)) {
    throw new HttpsError(
      'failed-precondition',
      'El enlace expiró o fue revocado. Pídele al equipo de Atracción que te reenvíe tu portal.',
    );
  }

  const ced = await verificarCedula(tokenRef, cedula);
  if (!ced.ok) {
    if (ced.bloqueado) {
      throw new HttpsError('resource-exhausted', 'Demasiados intentos. Intenta de nuevo más tarde.');
    }
    throw new HttpsError('permission-denied', 'Verifica tu número de cédula para continuar.');
  }

  // Tampoco se quitan archivos de una postulación que ya terminó (reu Karen 10-sep).
  const { postulacionId } = await asegurarPortalEscribible(t);

  const existentes = await db
    .collection('documentos_candidato')
    .where('postulacion_id', '==', postulacionId)
    .where('clave', '==', clave)
    .limit(1)
    .get();
  if (existentes.empty) throw new HttpsError('not-found', 'Ese documento no existe.');

  const docRef = existentes.docs[0].ref;
  const actual = existentes.docs[0].data() as Record<string, unknown>;
  if (String(actual.estado ?? '') === 'verificado') {
    throw new HttpsError(
      'failed-precondition',
      'Este documento ya fue verificado. Si necesitas cambiarlo, contacta al equipo de Atracción.',
    );
  }

  const previos = archivosDe(actual);
  const lista = previos.filter((a) => a.url !== url);
  if (lista.length === previos.length) {
    throw new HttpsError('not-found', 'Ese archivo ya no está en el documento.');
  }

  const ahora = Timestamp.now();
  if (lista.length === 0) {
    // Sin archivos → el slot vuelve a quedar pendiente.
    await docRef.update({
      archivos: [],
      archivo_url: null,
      nombre_archivo: null,
      tamano_bytes: null,
      estado: 'pendiente',
      fecha_entrega: null,
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'candidato_portal',
    });
  } else {
    await docRef.update({
      archivos: lista,
      archivo_url: lista[0].url,
      nombre_archivo: lista[0].nombre,
      tamano_bytes: lista[0].tamano_bytes ?? null,
      estado: 'entregado',
      fecha_entrega: ahora,
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'candidato_portal',
    });
  }

  await db.collection('eventos').add({
    tipo: 'documento_carpeta_portal_archivo_quitado',
    postulacion_id: postulacionId,
    clave,
    restantes: lista.length,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'candidato_portal',
  });

  logger.info('[portal] archivo quitado', { postulacionId, clave, restantes: lista.length });
  return {
    ok: true as const,
    archivos: lista.map((a) => ({ url: a.url, nombre: a.nombre })),
    estado: lista.length === 0 ? ('pendiente' as const) : ('entregado' as const),
  };
});
