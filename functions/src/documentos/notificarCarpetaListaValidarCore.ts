import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';
import { revisarCarpetaCore } from '../carpetas/revisarCarpetaCore';

/**
 * notificarCarpetaListaValidarCore · C.1 / F5.
 *
 * Lógica pura (Admin SDK, sin auth) que avisa a Gestión Humana que la carpeta de
 * un candidato está completa y lista para validar: notificación in-app + correo
 * (vía onNotificacionCreate). Idempotente con `carpeta_lista_validar_notificada_en`
 * en la postulación.
 *
 * La comparte la callable `notificarCarpetaListaValidar` (disparada desde el tab
 * Documentos) y el trigger `onCarpetaCompletaCheck` (auto-armado de carpeta).
 *
 * Postulación terminal (repostulado, descartado, desistió…): NO notifica y
 * devuelve `omitido: 'postulacion_terminal'`. El guard vive AQUÍ para cubrir la
 * callable y el trigger a la vez (reu Karen 10-sep: carpeta huérfana de un
 * repostulado). No marca el flag: si un descarte se reabre, el aviso aún sale.
 */
export async function notificarCarpetaListaValidarCore(
  postulacionId: string,
  creadoPor: string,
): Promise<{
  ok: true;
  notificados: number;
  yaNotificado: boolean;
  omitido?: 'postulacion_terminal';
}> {
  const postRef = db.collection('postulaciones').doc(postulacionId);

  // Idempotencia bajo concurrencia: ganar la carrera del flag dentro de una
  // transacción. Solo el ganador notifica (el trigger F5 puede dispararse en
  // paralelo por varias subidas casi simultáneas). El estado terminal se evalúa
  // en la misma lectura que el flag.
  const turno = await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists) return { tipo: 'ya' as const };
    const data = snap.data() as Record<string, unknown>;
    if (esPostulacionTerminal(data.estado)) {
      return {
        tipo: 'terminal' as const,
        yaNotificado: Boolean(data.carpeta_lista_validar_notificada_en),
      };
    }
    if (data.carpeta_lista_validar_notificada_en) return { tipo: 'ya' as const };
    tx.update(postRef, { carpeta_lista_validar_notificada_en: FieldValue.serverTimestamp() });
    return { tipo: 'gano' as const, data };
  });
  if (turno.tipo === 'terminal') {
    logger.info('[carpeta] aviso a GH omitido · postulación terminal', { postulacionId });
    return {
      ok: true,
      notificados: 0,
      yaNotificado: turno.yaNotificado,
      omitido: 'postulacion_terminal',
    };
  }
  if (turno.tipo === 'ya') {
    return { ok: true, notificados: 0, yaNotificado: true };
  }
  const post = turno.data;

  // Revisión automática de datos (reu Karen 16-sep, C): cuando la carpeta queda
  // lista para GH, deja las alertas calculadas para que Diego/Paola/Carla las
  // vean de una en /carpetas. Best-effort: si la carpeta aún no existe (la crea
  // onCarpetaCompletaCheck) el botón "Revisar datos" la calcula después.
  try {
    await revisarCarpetaCore(`carpeta_${postulacionId}`, 'system');
  } catch (e) {
    logger.info('[carpeta] revisión automática omitida', {
      postulacionId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  const nombre = String(post.candidato_nombre ?? 'el candidato').trim();
  const cargo = String(post.cargo_nombre ?? '').trim();

  // GH (Diego/Paola) Y Documentación (Carla): los tres trabajan la carpeta, así
  // que a los tres les llega el aviso. Antes Carla —cuyo único trabajo es
  // Carpetas— no recibía NADA (revisión 16-jul). Dos queries separadas (mismo
  // patrón ya probado en prod) en vez de un `in`, para no depender de otro índice.
  const destinatarios = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const rol of ['gh', 'documentacion']) {
    const snap = await db
      .collection('usuarios')
      .where('rol', '==', rol)
      .where('activo', '==', true)
      .get();
    snap.docs.forEach((d) => destinatarios.set(d.id, d));
  }

  let notificados = 0;
  for (const g of destinatarios.values()) {
    await db.collection('notificaciones').add({
      destinatario_uid: g.id,
      tipo: 'generica',
      titulo: 'Carpeta lista para tu validación (GH)',
      mensaje: `La parte de Cultura y Desarrollo de la carpeta de ${nombre}${
        cargo ? ` (${cargo})` : ''
      } está completa. Entra a Carpetas para revisarla, cargar los documentos a cargo de Gestión Humana (contrato y afiliaciones) y aprobarla.`,
      link: '/carpetas',
      leida: false,
      leida_en: null,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });
    notificados++;
  }

  // Copias por correo a buzones que NO son usuarios de la plataforma: reciben el
  // mismo aviso cuando la carpeta queda lista (Cumplimiento reu 28-jul; Conexión
  // de talentos + U corporativa reu 04-ago). `email_a` hace que onNotificacionCreate
  // los envíe a esas direcciones; sin destinatario_uid no aparecen en ninguna
  // campana, y `leida:true` evita cualquier conteo.
  const COPIAS_EXTERNAS: { email: string; nombre: string }[] = [
    { email: 'cumplimiento@equitel.com.co', nombre: 'Cumplimiento' },
    { email: 'jhoyos@equitel.com.co', nombre: 'Conexión de talentos' },
    { email: 'ucorporativa@equitel.com.co', nombre: 'U corporativa' },
  ];
  for (const cp of COPIAS_EXTERNAS) {
    await db.collection('notificaciones').add({
      destinatario_uid: '',
      email_a: cp.email,
      email_a_nombre: cp.nombre,
      tipo: 'generica',
      titulo: 'Carpeta lista para validación (GH)',
      mensaje: `La carpeta de ${nombre}${
        cargo ? ` (${cargo})` : ''
      } está completa por la parte de Cultura y Desarrollo. Se avisó a Gestión Humana para su validación.`,
      link: '/carpetas',
      leida: true,
      leida_en: FieldValue.serverTimestamp(),
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'system',
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: 'system',
    });
  }

  await db.collection('eventos').add({
    tipo: 'carpeta_lista_validar',
    postulacion_id: postulacionId,
    gh_notificados: notificados,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: creadoPor,
  });

  logger.info('[carpeta] GH notificado · carpeta lista para validar', {
    postulacionId,
    notificados,
  });
  return { ok: true, notificados, yaNotificado: false };
}
