import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
import { ITEM_POR_CLAVE } from '../documentos/catalogoCarpeta';

/**
 * Refleja un FORMATO oficial diligenciado (Datos Básicos / Debida Diligencia)
 * como documento ENTREGADO en la carpeta real (`documentos_candidato`), para que
 * aparezca en la pestaña Documentos con "Ver PDF" y cuente en la completitud.
 *
 * Estos formatos son `aporta_candidato:false` (no son slots del portal), pero
 * ahora los diligencia el candidato desde su portal — así que hay que reflejar el
 * PDF estampado en la carpeta igual que un documento entregado.
 *
 * Upsert por (postulacion_id, clave); NUNCA pisa un doc ya `verificado` por GH.
 */
export async function upsertFormatoEnCarpeta(opts: {
  postulacionId: string;
  clave: string;
  pdfUrl: string;
  candidatoId?: string;
  candidatoNombre?: string;
}): Promise<void> {
  const { postulacionId, clave, pdfUrl } = opts;
  if (!postulacionId || !clave || !pdfUrl) return;

  const item = ITEM_POR_CLAVE[clave];
  const nombre = item?.nombre ?? clave;
  const ahoraTs = Timestamp.now();
  const server = FieldValue.serverTimestamp();

  const existentes = await db
    .collection('documentos_candidato')
    .where('postulacion_id', '==', postulacionId)
    .where('clave', '==', clave)
    .limit(1)
    .get();

  if (!existentes.empty) {
    const ref = existentes.docs[0].ref;
    const actual = existentes.docs[0].data() as Record<string, unknown>;
    if (String(actual.estado ?? '') === 'verificado') return; // no reabrir lo aprobado
    await ref.update({
      archivo_url: pdfUrl,
      nombre_archivo: nombre,
      estado: 'entregado',
      fecha_entrega: ahoraTs,
      verificado_en: null,
      verificado_por_uid: null,
      verificado_por_nombre: null,
      actualizado_en: server,
      actualizado_por: 'candidato_portal',
    });
    return;
  }

  await db.collection('documentos_candidato').add({
    postulacion_id: postulacionId,
    candidato_id: opts.candidatoId ?? '',
    candidato_nombre: opts.candidatoNombre ?? '',
    clave,
    seccion: item?.seccion ?? 'hoja_vida',
    nombre,
    estado: 'entregado',
    archivo_url: pdfUrl,
    nombre_archivo: nombre,
    tamano_bytes: null,
    observaciones: '',
    fecha_entrega: ahoraTs,
    verificado_en: null,
    verificado_por_uid: null,
    verificado_por_nombre: null,
    creado_en: server,
    creado_por: 'candidato_portal',
    actualizado_en: server,
    actualizado_por: 'candidato_portal',
  });
}
