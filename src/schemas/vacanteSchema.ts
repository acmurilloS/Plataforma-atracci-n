import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import { codigoEmpresaSede, criticidad, estadoVacante, tipoSolicitud } from './enums';
import type { CamposAuditoria } from './auditoria';

export const vacanteInputSchema = z.object({
  empresa_codigo: codigoEmpresaSede,
  empresa_nombre: z.string().min(1),
  sede_codigo: codigoEmpresaSede,
  sede_nombre: z.string().min(1),
  unidad_id: z.string().min(1, 'Selecciona una unidad'),
  unidad_nombre: z.string().min(1),
  cargo_id: z.string().min(1, 'Selecciona un cargo'),
  cargo_nombre: z.string().min(1),
  cargo_criticidad_al_crear: criticidad,

  criticidad,
  tipo_solicitud: tipoSolicitud,
  /**
   * Si tipo_solicitud == 'reemplazo_indefinido', nombre de la persona que
   * sale. Permite a GH cruzar contra el control de planta y validar bajas.
   * Vacío si la vacante es aumento o temporal.
   */
  reemplaza_a_nombre: z.string().max(120).default(''),
  /**
   * Si tipo_solicitud == 'necesidad_temporal', meses estimados de la
   * cobertura (1–36). null en los otros tipos.
   */
  temporalidad_meses: z
    .union([z.number().int().min(1).max(36), z.null()])
    .default(null),
  /**
   * Detalle libre de la necesidad temporal (proyecto, pico, cobertura).
   * Vacío si la vacante no es temporal.
   */
  temporalidad_descripcion: z.string().max(500).default(''),
  justificacion: z
    .string()
    .min(20, 'La justificación debe tener al menos 20 caracteres')
    .max(2000, 'Máximo 2000 caracteres'),

  salario_base: z
    .number({
      required_error: 'Ingresa el salario base',
      invalid_type_error: 'Ingresa un valor numérico',
    })
    .positive('El salario debe ser mayor a 0')
    .max(100_000_000, 'Valor fuera de rango'),
  comisiones_texto: z.string().max(500).default(''),
  rodamiento: z.boolean().default(false),
  garantizado_texto: z.string().max(500).default(''),
  en_banda: z.boolean().nullable(),
  sin_banda_validada: z.boolean().default(false),
  requiere_validacion_gh: z.boolean().default(false),

  /**
   * URL del aval en Drive (webViewLink). NO obligatorio al crear la vacante —
   * si el líder no lo tiene firmado al momento, la solicitud queda con flag
   * `aval_pendiente=true` y Karen/Maribel la gestionan. Decisión de producto:
   * desbloquear al líder es prioridad sobre forzar aval previo.
   */
  aval_url: z
    .union([z.string().url(), z.literal('')])
    .default(''),
  /**
   * ID del archivo en Google Drive — habilita preview embebido vía iframe.
   * Opcional para tolerar avales viejos que aún están en Firebase Storage.
   */
  aval_drive_file_id: z.string().default(''),
  /**
   * True cuando el líder envía sin haber adjuntado el aval. GH/Coord lo ve
   * desde Aprobaciones y puede pedirlo después o adjuntarlo en nombre del líder.
   */
  aval_pendiente: z.boolean().default(false),

  fecha_entrevista_propuesta: z.date({
    required_error: 'Propón una fecha de entrevista',
    invalid_type_error: 'Fecha inválida',
  }),

  lider_uid: z.string().min(1),
  lider_nombre: z.string().min(1),
});

export type VacanteInput = z.infer<typeof vacanteInputSchema>;

export interface VacanteDoc extends Omit<VacanteInput, 'fecha_entrevista_propuesta'>, CamposAuditoria {
  id: string;
  consecutivo: string;
  estado: z.infer<typeof estadoVacante>;
  /**
   * Estado que tenía la vacante justo antes de suspenderse (estado = 'pausada').
   * Lo usa la bitácora de reprocesos para devolverla a su estado previo al
   * reactivarla. null cuando no está suspendida.
   */
  estado_previo_pausa?: z.infer<typeof estadoVacante> | null;
  fecha_entrevista_propuesta: Timestamp;
  fecha_entrevista_pactada: Timestamp | null;
  aval_aprobado_por: string | null;
  aval_aprobado_en: Timestamp | null;
  proceso_activo_id: string | null;
  analista_uid: string | null;
  analista_nombre: string | null;
  cerrada_en: Timestamp | null;
  razon_cierre: string | null;
  /**
   * Reloj de 48h del líder (paso 13).
   * `terna_enviada_en` arranca cuando la analista cierra la terna y la envía al líder.
   * Los `recordatorio_*_enviado_en` se setean por la scheduled function para evitar
   * duplicados. `terna_respondida_en` se setea cuando el líder toma cualquier
   * decisión (aprobar/descartar) en /vacantes/:id/terna, lo que detiene los recordatorios.
   */
  terna_enviada_en: Timestamp | null;
  terna_respondida_en: Timestamp | null;
  recordatorio_48h_enviado_en: Timestamp | null;
  recordatorio_24h_enviado_en: Timestamp | null;
  recordatorio_expirado_en: Timestamp | null;
  /**
   * Aviso automático a Cultura y Desarrollo (Diego) para validar las condiciones
   * de la solicitud. Lo escribe el trigger onVacanteCreate (Admin SDK). null
   * mientras no se haya enviado.
   */
  correo_cultura_enviado_en?: Timestamp | null;
  correo_cultura_destinatario?: string | null;
  correo_cultura_error?: string | null;
  correo_cultura_error_en?: Timestamp | null;
}

export { estadoVacante };
