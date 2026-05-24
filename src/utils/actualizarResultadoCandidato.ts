import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MOTIVOS_RECICLABLES, type MotivoDescarte } from '../schemas';
import type { ResultadoUltimaPostulacion } from '../schemas';

/**
 * Denormaliza el resultado de una postulación al candidato.
 *
 * Por qué: el pool futuro (ATR-11) necesita poder filtrar candidatos por su
 * resultado consolidado sin joinear con la colección de postulaciones. Cada
 * vez que una postulación llega a estado terminal, actualizamos el candidato.
 *
 * Casos:
 *  - Descarte con motivo reciclable → 'apto_no_contratado' (candidato del pool)
 *  - Descarte con motivo duro → 'descartado_lider' o 'filtrado_no_cumple'
 *  - Desistió → 'desistio' (no reciclar si pasa 2+ veces)
 *  - No apto médico → 'no_apto_medico' + apto_para_pool_futuro=false
 *  - Contratado → 'contratado' (ya está dentro)
 */

interface OpcionesActualizar {
  candidato_id: string;
  resultado: ResultadoUltimaPostulacion;
  vacante_id: string;
  vacante_consecutivo: string;
  motivo_descarte?: MotivoDescarte | null;
  uid: string;
}

export async function actualizarResultadoCandidato(opts: OpcionesActualizar): Promise<void> {
  const { candidato_id, resultado, vacante_id, vacante_consecutivo, motivo_descarte, uid } = opts;

  const candRef = doc(db, 'candidatos', candidato_id);
  const snap = await getDoc(candRef);
  if (!snap.exists()) {
    console.warn('[actualizarResultadoCandidato] candidato no existe', candidato_id);
    return;
  }

  const data = snap.data();
  const desistiosPrevios = data.desistios_acumulados ?? 0;

  // Cuando el motivo es duro (no reciclable) o no apto médico, bajamos el
  // flag del pool. Reciclable + apto_no_contratado mantienen el flag.
  let aptoParaPool = data.apto_para_pool_futuro ?? true;
  let motivoNoApto: string | null = data.motivo_no_apto_pool ?? null;

  if (resultado === 'no_apto_medico') {
    aptoParaPool = false;
    motivoNoApto = 'No apto en exámenes médicos';
  } else if (motivo_descarte && !MOTIVOS_RECICLABLES.has(motivo_descarte)) {
    aptoParaPool = false;
    motivoNoApto = `Descarte duro: ${motivo_descarte}`;
  } else if (resultado === 'desistio' && desistiosPrevios + 1 >= 2) {
    aptoParaPool = false;
    motivoNoApto = 'Desistió 2+ veces';
  }

  const patch: Record<string, unknown> = {
    resultado_ultima_postulacion: resultado,
    fecha_ultima_postulacion: Timestamp.now(),
    ultima_vacante_id: vacante_id,
    ultima_vacante_consecutivo: vacante_consecutivo,
    apto_para_pool_futuro: aptoParaPool,
    motivo_no_apto_pool: motivoNoApto,
    actualizado_en: serverTimestamp(),
    actualizado_por: uid,
  };
  if (resultado === 'desistio') {
    patch.desistios_acumulados = desistiosPrevios + 1;
  }

  await updateDoc(candRef, patch);
}
