import type { EstadoPostulacion } from '../schemas';

/**
 * Mapeos centralizados del Portal del Candidato (F0).
 *
 * Traduce los 18 estados técnicos de la postulación a 6 fases AMABLES que ve el
 * candidato (nunca ve el estado técnico). Acá viven las etiquetas humanas y los
 * "tiempos esperados" por fase — editables en este único lugar (no quemados en
 * el JSX). A futuro se pueden leer de `configuracion_global/portal_fases` sin
 * cambiar los componentes.
 */

export type ClaveFase =
  | 'postulado'
  | 'pruebas'
  | 'entrevistas'
  | 'examenes'
  | 'documentos'
  | 'contratacion';

export interface FasePortal {
  clave: ClaveFase;
  etiqueta: string;
  descripcion: string;
  /** Expectativa de tiempo configurable por fase. */
  dias_esperados: string;
}

/** Fases en orden real del proceso (monotónico con el flujo). */
export const FASES_PORTAL: FasePortal[] = [
  {
    clave: 'postulado',
    etiqueta: 'Postulación recibida',
    descripcion: 'Recibimos tu postulación y estamos revisando tu perfil.',
    dias_esperados: 'Suele tomar 1 a 3 días hábiles',
  },
  {
    clave: 'pruebas',
    etiqueta: 'Pruebas',
    descripcion: 'Te compartimos las pruebas para que las completes.',
    dias_esperados: 'Suele tomar 2 a 4 días hábiles',
  },
  {
    clave: 'entrevistas',
    etiqueta: 'Entrevistas',
    descripcion: 'Entrevistas y revisión final de tu perfil.',
    dias_esperados: 'Suele tomar 3 a 7 días hábiles',
  },
  {
    clave: 'examenes',
    etiqueta: 'Exámenes médicos',
    descripcion: 'Realización de tus exámenes médicos de ingreso.',
    dias_esperados: 'Suele tomar 2 a 5 días hábiles',
  },
  {
    clave: 'documentos',
    etiqueta: 'Documentos',
    descripcion: 'Carga y revisión de tus documentos de vinculación.',
    dias_esperados: 'Suele tomar 3 a 5 días hábiles',
  },
  {
    clave: 'contratacion',
    etiqueta: 'Contratación',
    descripcion: '¡Felicitaciones! Tu vinculación quedó lista.',
    dias_esperados: '',
  },
];

/**
 * Mensaje cálido de "buena noticia" por fase, que el portal muestra junto al
 * estado (mensajes al candidato). Tono positivo para que cada avance se sienta
 * bien. Editable en este único lugar.
 */
export const MENSAJE_FASE: Record<ClaveFase, string> = {
  postulado:
    '¡Gracias por postularte! Estamos revisando tu perfil con cuidado. Cualquier novedad la verás aquí y te escribiremos al correo.',
  pruebas:
    '¡Avanzaste a la etapa de pruebas! Complétalas a tu ritmo; si tienes dudas, escríbenos por la pestaña ¿Dudas?.',
  entrevistas:
    '¡Buenas noticias! Tu perfil nos interesa y avanzaste a entrevistas. Revisa tus citas en esta página.',
  examenes:
    '¡Vas muy bien! Estás en la etapa de exámenes médicos de ingreso. Aquí encontrarás los detalles de tu cita.',
  documentos:
    '¡Estás muy cerca! Ya estás organizando tus documentos de vinculación. Súbelos en la pestaña Documentos.',
  contratacion: '¡Felicitaciones! 🎉 Tu proceso culminó con tu contratación. ¡Bienvenido(a) a Equitel!',
};

export function mensajeFase(fase: string): string {
  return (MENSAJE_FASE as Record<string, string>)[fase] ?? '';
}

/** Estado técnico → fase amable (o 'finalizado' para descartes/desistió). */
const MAPA_ESTADO_FASE: Record<EstadoPostulacion, ClaveFase | 'finalizado'> = {
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
  en_examenes_medicos: 'examenes',
  descartado_examenes_medicos: 'finalizado',
  en_contratacion: 'documentos',
  contratado: 'contratacion',
  desistio_candidato: 'finalizado',
};

export function faseDeEstado(estado: string): ClaveFase | 'finalizado' {
  return MAPA_ESTADO_FASE[estado as EstadoPostulacion] ?? 'postulado';
}

export function esEstadoFinalizado(estado: string): boolean {
  return faseDeEstado(estado) === 'finalizado';
}

export function indiceFase(clave: ClaveFase): number {
  return FASES_PORTAL.findIndex((f) => f.clave === clave);
}

/**
 * Mensaje por defecto cuando el proceso finaliza sin continuar. El candidato
 * NUNCA ve la causa; si el analista escribió un `mensaje_portal_descarte`, ese
 * tiene prioridad sobre este texto.
 */
export const MENSAJE_FINALIZADO_DEFAULT =
  'Agradecemos sinceramente el tiempo, el interés y la confianza que depositaste en este proceso. ' +
  'En esta ocasión tu participación en esta vacante ha concluido; no obstante, valoramos tu perfil y ' +
  'nos gustaría tenerte en cuenta para futuras oportunidades. Te deseamos muchos éxitos en tus próximos proyectos.';

/**
 * Mensaje amable para el banner (caso finalizado o fallback). El candidato nunca
 * ve la causa del descarte.
 */
export function estadoAmigable(estado: string): {
  texto: string;
  tono: 'success' | 'info' | 'neutral';
} {
  if (estado === 'contratado')
    return { texto: '¡Felicitaciones! Tu proceso culminó con tu contratación 🎉', tono: 'success' };
  if (esEstadoFinalizado(estado))
    return {
      texto: 'Tu proceso para esta vacante ha finalizado. Te agradecemos mucho tu participación.',
      tono: 'neutral',
    };
  return {
    texto: 'Tu proceso está en marcha; el equipo de Atracción avanza con tu selección.',
    tono: 'info',
  };
}

/**
 * Canal de ayuda del portal. El correo por defecto es el del analista del proceso
 * (lo entrega el resolver por postulación); acá queda el fallback + WhatsApp
 * enganchable (vacío = oculto hasta tener número).
 */
export const CONTACTO_ATRACCION = {
  correo_fallback: 'atraccion@equitel.com.co',
  whatsapp: '', // ej. '573001234567' — vacío oculta el botón de WhatsApp
};
