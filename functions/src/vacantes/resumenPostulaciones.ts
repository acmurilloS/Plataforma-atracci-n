import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { esPostulacionTerminal } from '../postulaciones/estadosTerminales';

/**
 * Resumen de postulaciones EN CURSO por vacante · `vacantes_resumen/{vacanteId}`
 * (reu Karen 10-sep: fase real en Seguimiento).
 *
 * VacanteCard pintaba la fase A–F solo con `vacante.estado`, pero las analistas
 * avanzan candidatos desde PostulacionesPage sin tocar la vacante (10 de 32
 * activas desfasadas). Calcularlo en cliente no sirve en Seguimiento: apoyo,
 * talentos y gerente no pueden leer postulaciones (PII). Por eso el servidor
 * mantiene un conteo por estado en una colección APARTE — no en el doc de la
 * vacante, cuyo get es público y cuyos snapshots re-disparan los efectos de
 * PerfilamientoPage/SolicitudIntegrantePage.
 *
 * Contrato del doc (lo lee el front):
 *   { vacante_id, por_estado: { [estado]: n }, total_en_curso, calculado_en }
 * `por_estado` cuenta SOLO postulaciones en curso: fuera los terminales
 * (esPostulacionTerminal) y 'sourceado_por_ia' (perfil sin contacto humano);
 * 'contratado' sí cuenta. Nunca guarda descartes → no expone resultados médicos.
 *
 * Lo mantienen onPostulacionResumen (cada cambio de estado/vacante) y la
 * reconciliación de recalcularResumenesVacantes (diaria + callable admin);
 * eliminarVacante lo borra junto con la vacante.
 */

export const COL_RESUMEN = 'vacantes_resumen';

export type PorEstado = Record<string, number>;

export interface ResumenEnCurso {
  por_estado: PorEstado;
  total_en_curso: number;
}

/** ¿Esta postulación suma en el resumen de su vacante? */
export function cuentaEnCurso(estado: unknown): boolean {
  const e = String(estado ?? '');
  // Sin estado = dato corrupto: no se cuenta (tampoco serviría como clave de mapa).
  return e !== '' && e !== 'sourceado_por_ia' && !esPostulacionTerminal(e);
}

/** Core puro: conteo por estado de las postulaciones en curso de UNA vacante. */
export function contarEnCurso(postulaciones: Iterable<Record<string, unknown>>): ResumenEnCurso {
  const por_estado: PorEstado = {};
  let total_en_curso = 0;
  for (const p of postulaciones) {
    if (!cuentaEnCurso(p.estado)) continue;
    const e = String(p.estado);
    por_estado[e] = (por_estado[e] ?? 0) + 1;
    total_en_curso += 1;
  }
  return { por_estado, total_en_curso };
}

/** Comparación por contenido (el orden de las claves no importa). */
export function mismoPorEstado(a: PorEstado, b: PorEstado): boolean {
  const claves = Object.keys(a);
  if (claves.length !== Object.keys(b).length) return false;
  return claves.every((k) => a[k] === b[k]);
}

/** `por_estado` guardado, tolerante a docs malformados; null = no hay resumen. */
function porEstadoGuardado(resumen: DocumentData | undefined): PorEstado | null {
  if (!resumen) return null;
  const out: PorEstado = {};
  const raw = resumen.por_estado;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number') out[k] = v;
    }
  }
  return out;
}

interface Plan {
  accion: 'ninguna' | 'escribir' | 'borrar';
  antes: PorEstado | null;
  despues: ResumenEnCurso | null;
}

/**
 * Qué hacer con el resumen de una vacante. `postulaciones` null = la vacante no
 * existe (se borra el resumen si quedó). Sin doc previo también se escribe,
 * aunque quede en cero: así "existe" = "ya se calculó" y la reconciliación deja
 * de reportarlo.
 */
function planificar(
  resumenActual: DocumentData | undefined,
  postulaciones: Iterable<Record<string, unknown>> | null,
): Plan {
  const antes = porEstadoGuardado(resumenActual);
  if (postulaciones === null) {
    return { accion: antes === null ? 'ninguna' : 'borrar', antes, despues: null };
  }
  const despues = contarEnCurso(postulaciones);
  const igual = antes !== null && mismoPorEstado(antes, despues.por_estado);
  return { accion: igual ? 'ninguna' : 'escribir', antes, despues };
}

export interface ResultadoRecalculo {
  vacante_id: string;
  cambiado: boolean;
  antes: PorEstado | null;
  /** null = la vacante no existe (el resumen se borró o no había). */
  despues: PorEstado | null;
  total_en_curso: number;
}

/**
 * Recalcula desde cero el resumen de una vacante, en transacción (lee vacante,
 * resumen y postulaciones antes de escribir). Idempotente y sin importar el
 * orden en que lleguen los eventos: siempre refleja el estado actual. Escribe
 * solo si `por_estado` cambió. null = id inválido (no se toca nada).
 */
export async function recalcularResumenVacante(vacanteId: string): Promise<ResultadoRecalculo | null> {
  // Un id vacío o con '/' rompería doc() en cada reintento del trigger.
  if (!vacanteId || vacanteId.includes('/')) return null;

  const vacRef = db.collection('vacantes').doc(vacanteId);
  const resRef = db.collection(COL_RESUMEN).doc(vacanteId);

  return db.runTransaction(async (tx) => {
    // ── Lecturas (todas antes de cualquier escritura) ──────────────────────
    const vacSnap = await tx.get(vacRef);
    const resSnap = await tx.get(resRef);
    const postSnap = vacSnap.exists
      ? await tx.get(db.collection('postulaciones').where('vacante_id', '==', vacanteId))
      : null;

    const plan = planificar(resSnap.data(), postSnap ? postSnap.docs.map((d) => d.data()) : null);

    // ── Escritura ───────────────────────────────────────────────────────────
    if (plan.accion === 'borrar') {
      tx.delete(resRef);
    } else if (plan.accion === 'escribir' && plan.despues) {
      // set SIN merge: los estados que ya no tienen a nadie desaparecen del mapa.
      tx.set(resRef, {
        vacante_id: vacanteId,
        por_estado: plan.despues.por_estado,
        total_en_curso: plan.despues.total_en_curso,
        calculado_en: FieldValue.serverTimestamp(),
      });
    }

    return {
      vacante_id: vacanteId,
      cambiado: plan.accion !== 'ninguna',
      antes: plan.antes,
      despues: plan.despues?.por_estado ?? null,
      total_en_curso: plan.despues?.total_en_curso ?? 0,
    };
  });
}

export interface DetalleReconciliacion {
  vacante_id: string;
  /** '' si la vacante ya no existe (resumen huérfano). */
  consecutivo: string;
  antes: PorEstado | null;
  despues: PorEstado | null;
}

export interface ResultadoReconciliacion {
  /** Vacantes revisadas (los resúmenes huérfanos van aparte, en el detalle). */
  revisadas: number;
  cambiadas: number;
  errores: number;
  detalle: DetalleReconciliacion[];
}

/**
 * Compara el resumen de TODAS las vacantes contra sus postulaciones reales y,
 * si no es dry run, corrige las que no calzan y borra los resúmenes huérfanos
 * (vacante inexistente). El detalle solo lleva consecutivos y conteos — sin
 * nombres de personas.
 *
 * La foto se toma en 3 lecturas (solo los campos que importan), así el dry run
 * no abre una transacción por vacante. En el run real cada candidata pasa por
 * recalcularResumenVacante, que vuelve a leer y decide: si un trigger ya la
 * corrigió entre tanto, no cuenta como cambio.
 */
export async function reconciliarResumenes(opts: { dryRun: boolean }): Promise<ResultadoReconciliacion> {
  const [vacSnap, postSnap, resSnap] = await Promise.all([
    db.collection('vacantes').select('consecutivo').get(),
    db.collection('postulaciones').select('vacante_id', 'estado').get(),
    db.collection(COL_RESUMEN).get(),
  ]);

  const postPorVacante = new Map<string, DocumentData[]>();
  for (const d of postSnap.docs) {
    const p = d.data();
    const vid = String(p.vacante_id ?? '');
    if (!vid) continue;
    const lista = postPorVacante.get(vid) ?? [];
    lista.push(p);
    postPorVacante.set(vid, lista);
  }
  const resumenes = new Map(resSnap.docs.map((d) => [d.id, d.data()] as const));

  // Candidatas: vacantes cuyo resumen no calza + resúmenes sin vacante.
  const candidatas: Array<{ id: string; consecutivo: string; plan: Plan }> = [];
  const idsVacantes = new Set<string>();
  for (const v of vacSnap.docs) {
    idsVacantes.add(v.id);
    const plan = planificar(resumenes.get(v.id), postPorVacante.get(v.id) ?? []);
    if (plan.accion !== 'ninguna') {
      candidatas.push({ id: v.id, consecutivo: String(v.data().consecutivo ?? ''), plan });
    }
  }
  for (const [id, data] of resumenes) {
    if (!idsVacantes.has(id)) candidatas.push({ id, consecutivo: '', plan: planificar(data, null) });
  }

  const detalle: DetalleReconciliacion[] = [];
  let errores = 0;
  for (const c of candidatas) {
    if (opts.dryRun) {
      detalle.push({
        vacante_id: c.id,
        consecutivo: c.consecutivo,
        antes: c.plan.antes,
        despues: c.plan.despues?.por_estado ?? null,
      });
      continue;
    }
    try {
      const r = await recalcularResumenVacante(c.id);
      if (r?.cambiado) {
        detalle.push({ vacante_id: c.id, consecutivo: c.consecutivo, antes: r.antes, despues: r.despues });
      }
    } catch (e) {
      // Una vacante con problemas no frena al resto; el trigger o la próxima
      // corrida la vuelven a intentar.
      errores += 1;
      logger.error('[reconciliarResumenes] no se pudo recalcular la vacante', {
        vacante_id: c.id,
        consecutivo: c.consecutivo,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { revisadas: vacSnap.size, cambiadas: detalle.length, errores, detalle };
}
