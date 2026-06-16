import type { EstadoPostulacion } from './postulacionSchema';

/**
 * Mapa de transiciones válidas para el estado de una postulación.
 * Llave = estado actual; valor = conjunto de estados a los que puede saltar.
 *
 * Reglas del flujograma:
 * - Estados terminales (no salen a nada): filtrado_no_cumple,
 *   descartado_examenes_medicos, contratado, pre_entrevistado_no_interesado, desistio_candidato.
 * - `descartado_por_lider` NO es terminal: puede reabrirse al pool (paso 14 del flujograma —
 *   "candidato no aprobado vuelve al paso 5"). Permite reusar la terna sin abrir proceso nuevo.
 * - `desistio_candidato` puede alcanzarse desde cualquier estado no-terminal
 *   (la persona se cae en cualquier punto). Se modela explícitamente en cada
 *   transición no-terminal en lugar de "comodín" para que sea inspeccionable.
 * - El descarte por filtro duro (`filtrado_no_cumple`) puede ocurrir hasta
 *   referencias_validadas — después es muy tarde para "no cumple criterios".
 *
 * No usar para validación dura todavía: es una guía de UI/UX. Cuando se
 * conecte al patcher de estados, agregar también validación en Cloud Function.
 */

const T: Record<EstadoPostulacion, readonly EstadoPostulacion[]> = {
  // Paso 4.5 · IA encontró al candidato. Analista valida y promueve, descarta o marca no interesado.
  sourceado_por_ia: ['postulado', 'filtrado_no_cumple', 'desistio_candidato'],

  postulado: ['pre_entrevistado_pendiente', 'filtrado_no_cumple', 'desistio_candidato'],

  pre_entrevistado_pendiente: [
    'pre_entrevistado_ok',
    'pre_entrevistado_no_interesado',
    'desistio_candidato',
  ],
  pre_entrevistado_ok: ['pruebas_enviadas', 'filtrado_no_cumple', 'desistio_candidato'],
  pre_entrevistado_no_interesado: [],

  filtrado_no_cumple: [],

  pruebas_enviadas: ['pruebas_completadas', 'filtrado_no_cumple', 'desistio_candidato'],
  pruebas_completadas: ['entrevistado_analista', 'filtrado_no_cumple', 'desistio_candidato'],

  entrevistado_analista: ['referencias_validadas', 'filtrado_no_cumple', 'desistio_candidato'],
  referencias_validadas: ['en_terna', 'filtrado_no_cumple', 'desistio_candidato'],

  en_terna: ['seleccionado_por_lider', 'en_examenes_medicos', 'descartado_por_lider', 'desistio_candidato'],
  // Loop paso 14: el analista puede reabrir un descartado al pool para considerarlo en
  // una próxima vuelta de terna (sin abrir proceso nuevo).
  descartado_por_lider: ['postulado', 'desistio_candidato'],

  // Al aprobar al líder, la solicitud de exámenes se dispara de inmediato, así que
  // el candidato entra directo a "en exámenes médicos" (visible en el embudo).
  seleccionado_por_lider: ['en_examenes_medicos', 'en_contratacion', 'desistio_candidato'],

  en_examenes_medicos: ['en_contratacion', 'descartado_examenes_medicos', 'desistio_candidato'],

  en_contratacion: ['contratado', 'descartado_examenes_medicos', 'desistio_candidato'],
  descartado_examenes_medicos: [],
  contratado: [],

  desistio_candidato: [],
};

export const transicionesPostulacion = T;

export function transicionesValidasDesde(
  estadoActual: EstadoPostulacion,
): readonly EstadoPostulacion[] {
  return T[estadoActual];
}

export function validarTransicion(
  estadoActual: EstadoPostulacion,
  nuevoEstado: EstadoPostulacion,
): boolean {
  if (estadoActual === nuevoEstado) return false;
  return T[estadoActual].includes(nuevoEstado);
}

export function esEstadoTerminal(estado: EstadoPostulacion): boolean {
  return T[estado].length === 0;
}
