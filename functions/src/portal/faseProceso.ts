/**
 * Réplica server-side del mapeo estado→fase del Portal del Candidato.
 *
 * La fuente de verdad (etiquetas + tiempos) vive en src/portal/faseProceso.ts
 * (frontend). Acá solo se replica el COLAPSO de los estados técnicos a las 6
 * fases amables (+ 'finalizado'), para que el resolver entregue al candidato una
 * `fase` neutra y NUNCA el estado técnico (que revelaría la etapa/causa de un
 * descarte). MANTENER EN SYNC con el frontend si el enum cambia: un estado que
 * falte aquí cae en 'postulado' (les pasó a 'repostulado' y
 * 'descartado_entrevista_analista' hasta el 10-sep).
 */

export type FasePortalServer =
  | 'postulado'
  | 'pruebas'
  | 'entrevistas'
  | 'examenes'
  | 'documentos'
  | 'contratacion'
  | 'finalizado';

const MAPA_ESTADO_FASE: Record<string, FasePortalServer> = {
  sourceado_por_ia: 'postulado',
  postulado: 'postulado',
  pre_entrevistado_pendiente: 'postulado',
  pre_entrevistado_ok: 'postulado',
  pre_entrevistado_no_interesado: 'finalizado',
  filtrado_no_cumple: 'finalizado',
  pruebas_enviadas: 'pruebas',
  pruebas_completadas: 'pruebas',
  entrevistado_analista: 'entrevistas',
  referencias_validadas: 'entrevistas',
  en_terna: 'entrevistas',
  seleccionado_por_lider: 'entrevistas',
  descartado_por_lider: 'finalizado',
  descartado_entrevista_analista: 'finalizado',
  en_examenes_medicos: 'examenes',
  descartado_examenes_medicos: 'finalizado',
  en_contratacion: 'documentos',
  contratado: 'contratacion',
  desistio_candidato: 'finalizado',
  // Repostulado a otra vacante: para ESTA postulación el proceso terminó (el
  // candidato sigue activo en la del destino). El portal lo trata como finalizado.
  repostulado: 'finalizado',
};

export function faseDeEstado(estado: string): FasePortalServer {
  return MAPA_ESTADO_FASE[estado] ?? 'postulado';
}

export function esEstadoFinalizado(estado: string): boolean {
  return faseDeEstado(estado) === 'finalizado';
}

/** ¿El candidato culminó con contratación? (para celebrar sin filtrar nada.) */
export function esContratado(estado: string): boolean {
  return estado === 'contratado';
}
