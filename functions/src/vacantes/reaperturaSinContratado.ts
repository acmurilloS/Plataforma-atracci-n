import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../utils/admin';

/**
 * Reapertura automática de una vacante que se quedó sin contratado (incidente
 * ET-MOS-1017, 15-oct).
 *
 * Aprobar la carpeta (o registrar la fecha de vinculación) deja a la persona
 * `contratado` y CIERRA la vacante. Si después esa persona sale del proceso
 * —desiste antes de ingresar, C&D decide que no continúa por el examen, o la
 * analista le cambia el estado—, la vacante seguía `cerrada`: contaba como
 * contratada en Seguimiento (reu Karen 15-oct: en "Cerradas" solo van las
 * contratadas) y bloqueaba la carpeta de la siguiente persona ("Ya hay un
 * candidato contratado en esta vacante").
 *
 * `onContratacionRevertida` detecta la salida de `contratado` venga de donde
 * venga (el desplegable de estado, una callable, un script) y, si la vacante
 * quedó sin ningún contratado, en una sola transacción:
 *  - la reabre: a `en_contratacion` si ya hay otra persona en contratación, si
 *    no a `en_proceso` (la fase real la sigue pintando `vacantes_resumen`);
 *  - borra `cerrada_en` y guarda la traza del cierre revertido;
 *  - deja la novedad en la bitácora y avisa por campana a coordinación y a la
 *    analista (menos a quien hizo el cambio).
 * Privacidad: el doc de la vacante es de lectura PÚBLICA (landing) y la bitácora
 * la lee cualquier usuario interno, así que ahí no va el nombre de la persona y
 * el estado se nombra sin delatar un resultado médico. El nombre solo va en la
 * campana (la lee únicamente su destinatario) y el estado exacto en `eventos`
 * (solo staff).
 * Idempotente (si la vacante ya no está cerrada o aún hay un contratado, no hace
 * nada), por eso `retry: true` es seguro.
 */

const ETIQUETA_ESTADO: Record<string, string> = {
  desistio_candidato: 'desistió',
  // Neutral a propósito: no exponer un resultado médico (ver arriba).
  descartado_examenes_medicos: 'descartado',
  descartado_por_lider: 'descartado por el líder',
  descartado_entrevista_analista: 'descartado en la entrevista',
  filtrado_no_cumple: 'no cumple',
  en_contratacion: 'en contratación',
  en_examenes_medicos: 'en exámenes médicos',
  repostulado: 'movido a otra vacante',
};

export function etiquetaEstadoPostulacion(estado: string): string {
  return ETIQUETA_ESTADO[estado] ?? estado.replace(/_/g, ' ');
}

/** Estado al que vuelve la vacante según quién sigue en el proceso. */
export function estadoAlReabrir(estadosPostulaciones: string[]): 'en_contratacion' | 'en_proceso' {
  return estadosPostulaciones.includes('en_contratacion') ? 'en_contratacion' : 'en_proceso';
}

/** ¿Este cambio de la postulación es la salida de un contratado? */
export function salioDeContratado(antes: unknown, despues: unknown): boolean {
  return String(antes ?? '') === 'contratado' && String(despues ?? '') !== 'contratado';
}

async function uidsCoordinacion(): Promise<string[]> {
  const uids = new Set<string>();
  for (const rol of ['coordinador', 'admin']) {
    const snap = await db.collection('usuarios').where('rol', '==', rol).where('activo', '==', true).get();
    snap.forEach((d) => uids.add(d.id));
  }
  return [...uids];
}

async function nombreDe(uid: string): Promise<string> {
  if (!uid || uid.startsWith('system')) return '';
  try {
    const d = (await db.collection('usuarios').doc(uid).get()).data() ?? {};
    return `${String(d.nombre ?? '')} ${String(d.apellido ?? '')}`.trim();
  } catch {
    return '';
  }
}

export const onContratacionRevertida = onDocumentUpdated(
  { document: 'postulaciones/{id}', region: 'us-central1', retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (!salioDeContratado(before.estado, after.estado)) return;

    const postId = event.params.id;
    const vacanteId = String(after.vacante_id ?? before.vacante_id ?? '').trim();
    if (!vacanteId || vacanteId.includes('/')) return;

    const estadoPost = String(after.estado ?? '');
    const candidato = String(after.candidato_nombre ?? '').trim() || 'La persona contratada';
    const actor = String(after.actualizado_por ?? '').trim();
    const [actorNombre, coordinacion] = await Promise.all([nombreDe(actor), uidsCoordinacion()]);

    const vacRef = db.collection('vacantes').doc(vacanteId);
    const resultado = await db.runTransaction(async (tx) => {
      // ── Lecturas primero ────────────────────────────────────────────────
      const vacSnap = await tx.get(vacRef);
      if (!vacSnap.exists) return null;
      const v = vacSnap.data() as Record<string, unknown>;
      if (String(v.estado ?? '') !== 'cerrada') return null;
      const postsSnap = await tx.get(db.collection('postulaciones').where('vacante_id', '==', vacanteId));
      const estados = postsSnap.docs.map((d) => String(d.data().estado ?? ''));
      // Otro contratado sigue cubriendo la vacante: queda cerrada.
      if (estados.includes('contratado')) return null;

      const estadoNuevo = estadoAlReabrir(estados);
      const consecutivo = String(v.consecutivo ?? '').trim();
      const cargo = String(v.cargo_nombre ?? '').trim() || 'la vacante';
      const etiqueta = `${cargo}${consecutivo ? ` (${consecutivo})` : ''}`;
      const fase = estadoNuevo === 'en_contratacion' ? 'contratación' : 'proceso';
      const estadoTexto = etiquetaEstadoPostulacion(estadoPost);
      const ahora = FieldValue.serverTimestamp();
      const autor = actor || 'system';

      tx.update(vacRef, {
        estado: estadoNuevo,
        cerrada_en: null,
        reabierta_en: ahora,
        reabierta_por: actor || null,
        reaperturas: FieldValue.increment(1),
        // Sin nombre ni estado de la persona: este doc es público.
        cierre_revertido: { cerrada_en: v.cerrada_en ?? null, postulacion_id: postId },
        actualizado_en: ahora,
        actualizado_por: autor,
      });

      const novRef = db.collection('vacante_novedades').doc();
      tx.set(novRef, {
        id: novRef.id,
        vacante_id: vacanteId,
        vacante_consecutivo: consecutivo,
        tipo: 'reapertura',
        motivo:
          `La persona contratada salió del proceso (pasó a «${estadoTexto}»)` +
          `${actorNombre ? `; cambio de ${actorNombre}` : ''}. ` +
          `La vacante se reabrió sola en ${fase}: ya no tiene a nadie contratado.`,
        estado_anterior: 'cerrada',
        estado_nuevo: estadoNuevo,
        registrado_por_nombre: actorNombre || 'Plataforma (automático)',
        creado_en: ahora,
        creado_por: autor,
        actualizado_en: ahora,
        actualizado_por: autor,
      });

      const destinatarios = new Set(coordinacion);
      const analista = String(v.analista_uid ?? '').trim();
      if (analista) destinatarios.add(analista);
      destinatarios.delete(actor);
      for (const d of destinatarios) {
        tx.set(db.collection('notificaciones').doc(), {
          destinatario_uid: d,
          tipo: 'vacante_reabierta',
          titulo: `Se reabrió ${consecutivo || etiqueta}: ya no tiene contratado`,
          mensaje:
            `${candidato} pasó de contratado a «${estadoTexto}». ` +
            `${etiqueta} vuelve a ${fase} y deja de contar como cerrada.`,
          link: `/vacantes/${vacanteId}`,
          vacante_id: vacanteId,
          leida: false,
          leida_en: null,
          solo_campana: true,
          creado_en: ahora,
          creado_por: autor,
          actualizado_en: ahora,
          actualizado_por: autor,
        });
      }
      return { consecutivo, estadoNuevo, destinatarios: destinatarios.size };
    });

    if (resultado) {
      logger.info('[onContratacionRevertida] vacante reabierta', {
        vacante_id: vacanteId,
        post_id: postId,
        estado_postulacion: estadoPost,
        ...resultado,
      });
      try {
        await db.collection('eventos').add({
          tipo: 'vacante.reabierta_sin_contratado',
          vacante_id: vacanteId,
          postulacion_id: postId,
          estado_postulacion: estadoPost,
          estado_nuevo: resultado.estadoNuevo,
          creado_en: FieldValue.serverTimestamp(),
          creado_por: actor || 'system',
        });
      } catch (e) {
        logger.warn('[onContratacionRevertida] no se pudo registrar el evento', {
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
);
