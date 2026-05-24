import { z } from 'zod';

export const rolUsuario = z.enum(['lider', 'analista', 'coordinador', 'gh', 'apoyo', 'admin']);
export type RolUsuario = z.infer<typeof rolUsuario>;

export const areaApoyo = z.enum([
  'it',
  'compras',
  'bodega',
  'contabilidad',
  'administrativo',
  'talentos',
]);
export type AreaApoyo = z.infer<typeof areaApoyo>;

export const criticidad = z.enum(['Alta', 'Media', 'Baja']);
export type Criticidad = z.infer<typeof criticidad>;

export const tipoSolicitud = z.enum(['reemplazo', 'aumento']);
export type TipoSolicitud = z.infer<typeof tipoSolicitud>;

export const estadoVacante = z.enum([
  'borrador',
  'aprobada',
  'lista_para_publicar',
  'publicada',
  'en_proceso',
  'terna_enviada',
  'seleccionado',
  'en_contratacion',
  'cerrada',
  'desierta',
  'cancelada',
  'pausada',
]);
export type EstadoVacante = z.infer<typeof estadoVacante>;

// `estadoPostulacion` y `EstadoPostulacion` viven ahora en ./postulacionSchema.ts
// (16 estados — reemplazó al enum legado de 14 estados el 2026-04-29).

export const categoriaCargo = z.enum([
  'comercial',
  'tecnico',
  'administrativo',
  'operativo',
  'liderazgo',
]);
export type CategoriaCargo = z.infer<typeof categoriaCargo>;

export const codigoEmpresaSede = z
  .string()
  .regex(/^[A-Z]{3,4}$/, 'Código inválido (3 o 4 letras mayúsculas)');

/**
 * Motivo tipificado del descarte de una postulación.
 *
 * Reemplaza el texto libre que vivía sólo en `razon_descarte` (que se conserva
 * para notas adicionales). Sin tipificar es imposible agregar después para
 * análisis del pool ("¿cuántos descartados por feedback de líder blando?").
 *
 * Engancha con el pool futuro (ATR-11): permite distinguir reciclables
 * (feedback_lider_blando, otra_oferta_aceptada) de no reciclables
 * (no_cumple_perfil_duro, pase_judicial_rojo).
 */
export const motivoDescarte = z.enum([
  // Descartes "blandos" → candidato podría reciclar a otra vacante
  'feedback_lider_blando',          // no era el match cultural / preferencia subjetiva
  'apto_no_seleccionado',           // pasó todo bien pero el líder eligió otro
  'salario_no_satisfactorio',       // candidato pidió más de lo ofrecido
  'ubicacion_no_satisfactoria',     // distancia / sede no le convino
  'condiciones_horario',            // turnos / disponibilidad no le sirvió

  // Descartes "duros" → no reciclar al menos por 1 año
  'no_cumple_experiencia',
  'no_cumple_skills',
  'no_cumple_estudios',
  'no_cumple_documentacion',
  'feedback_lider_duro',            // razones objetivas (técnicas, ética)
  'no_apto_medico',
  'pase_judicial_rojo',
  'referencias_negativas',

  // Salidas del candidato
  'desistio_candidato',
  'otra_oferta_aceptada',
  'no_responde',

  // Operativo
  'duplicado',
  'otro',                            // requiere texto libre en razon_descarte
]);
export type MotivoDescarte = z.infer<typeof motivoDescarte>;

/** Etiqueta humana corta para mostrar en UI. */
export const MOTIVO_DESCARTE_LABEL: Record<MotivoDescarte, string> = {
  feedback_lider_blando: 'Líder: no era el match (blando)',
  apto_no_seleccionado: 'Apto, no seleccionado',
  salario_no_satisfactorio: 'Salario no le sirvió al candidato',
  ubicacion_no_satisfactoria: 'Ubicación / sede no le sirvió',
  condiciones_horario: 'Horario / turnos no le sirvió',
  no_cumple_experiencia: 'No cumple experiencia',
  no_cumple_skills: 'No cumple skills técnicos',
  no_cumple_estudios: 'No cumple estudios',
  no_cumple_documentacion: 'No cumple documentación',
  feedback_lider_duro: 'Líder: razón objetiva',
  no_apto_medico: 'No apto en exámenes médicos',
  pase_judicial_rojo: 'Pase judicial / antecedentes',
  referencias_negativas: 'Referencias negativas',
  desistio_candidato: 'Desistió el candidato',
  otra_oferta_aceptada: 'Aceptó otra oferta',
  no_responde: 'No responde / sin contacto',
  duplicado: 'Duplicado',
  otro: 'Otro (especificar en notas)',
};

/** Set de motivos "blandos" — candidatos que podrían reciclar al pool. */
export const MOTIVOS_RECICLABLES = new Set<MotivoDescarte>([
  'feedback_lider_blando',
  'apto_no_seleccionado',
  'salario_no_satisfactorio',
  'ubicacion_no_satisfactoria',
  'condiciones_horario',
  'otra_oferta_aceptada',
]);
