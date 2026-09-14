/**
 * Estados en los que el proceso de ESA postulación terminó sin contratación
 * (reu Karen 10-sep: carpeta huérfana de un repostulado de CU-BOG-1240 que GH
 * no podía aprobar). Una postulación así no debe tener carpeta viva, ni recibir
 * documentos por el portal, ni disparar avisos de "carpeta lista" o depósitos
 * en Drive.
 *
 * NO incluye 'contratado' (GH sigue cargando documentos tardíos de la carpeta)
 * ni 'en_examenes_medicos'. 'descartado_por_lider' puede reabrirse al pool; si se
 * reabre sale de esta lista sola, porque se evalúa el estado actual.
 *
 * Fuente única en functions: reemplaza las copias que ya se habían desalineado
 * (dotación en onDatosBasicosTallas, fases del portal en faseProceso).
 */
export const ESTADOS_TERMINALES_POSTULACION = [
  'repostulado',
  'desistio_candidato',
  'descartado_examenes_medicos',
  'descartado_por_lider',
  'descartado_entrevista_analista',
  'filtrado_no_cumple',
  'pre_entrevistado_no_interesado',
] as const;

export function esPostulacionTerminal(estado: unknown): boolean {
  return (ESTADOS_TERMINALES_POSTULACION as readonly string[]).includes(String(estado ?? ''));
}
