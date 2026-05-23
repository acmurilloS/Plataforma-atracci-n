import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';
import { areaApoyo } from './enums';
import type { AreaApoyo } from './enums';

/**
 * Tickets de conexión y vinculación · Módulo 8 del flujograma (paso 20).
 *
 * Cuando el líder aprueba un candidato (paso 14), la plataforma dispara
 * automáticamente tickets a las áreas que tienen que prepararle el ingreso:
 * IT (accesos + equipo), compras + bodega (dotación), contabilidad (labroides),
 * talentos (universidad corporativa), administrativo CJ (puesto físico si nueva sede).
 *
 * Cada área (rol `apoyo`) ve solo sus tickets en `/tickets`. La regla Firestore
 * filtra por `area == request.auth.token.area_apoyo`.
 *
 * Reemplaza el cruce manual de correos que describió Karen en la reunión 2026-04-14.
 */

export const estadoTicketConexion = z.enum([
  'abierto',        // creado, área no ha respondido
  'en_progreso',    // área tomó el ticket y está trabajando
  'bloqueado',      // necesita info adicional
  'resuelto',       // completado satisfactoriamente
  'no_aplica',      // área marcó que no requiere acción
  'cancelado',      // analista canceló el ticket
]);
export type EstadoTicketConexion = z.infer<typeof estadoTicketConexion>;

export const tipoTicketConexion = z.enum([
  'accesos_sistemas',     // IT — correo + cuentas básicas
  'computador',           // IT — equipo + setup
  'office',               // IT — licencia Office/M365
  'dotacion_compras',     // compras — uniforme/EPP
  'dotacion_bodega',      // bodega — entrega física
  'labroides',            // contabilidad — usuarios Labroides
  'induccion_talentos',   // talentos — universidad corporativa
  'puesto_fisico',        // administrativo CJ — sede nueva
  'otro',
]);
export type TipoTicketConexion = z.infer<typeof tipoTicketConexion>;

export const TIPO_LABEL: Record<TipoTicketConexion, string> = {
  accesos_sistemas: 'Accesos y cuentas',
  computador: 'Computador / equipo',
  office: 'Licencia Office / M365',
  dotacion_compras: 'Dotación · compras',
  dotacion_bodega: 'Dotación · bodega',
  labroides: 'Usuario Labroides',
  induccion_talentos: 'Inducción · universidad corporativa',
  puesto_fisico: 'Puesto físico',
  otro: 'Otro',
};

/**
 * Mapa tipo → área responsable. Usado por el helper de disparo automático.
 */
export const AREA_POR_TIPO: Record<TipoTicketConexion, AreaApoyo> = {
  accesos_sistemas: 'it',
  computador: 'it',
  office: 'it',
  dotacion_compras: 'compras',
  dotacion_bodega: 'bodega',
  labroides: 'contabilidad',
  induccion_talentos: 'talentos',
  puesto_fisico: 'administrativo',
  otro: 'it',
};

/**
 * ANS por criticidad de la vacante (días hábiles desde la creación del ticket).
 */
export const ANS_DIAS_POR_CRITICIDAD: Record<'Alta' | 'Media' | 'Baja', number> = {
  Alta: 3,
  Media: 5,
  Baja: 7,
};

// ─── Documento Firestore ────────────────────────────────────────────────

export interface TicketConexionDoc extends CamposAuditoria {
  id: string;

  // Contexto de la vacante / postulación
  vacante_id: string;
  vacante_consecutivo: string;
  postulacion_id: string;
  candidato_id: string;
  candidato_nombre: string;
  cargo_nombre: string;
  empresa_codigo: string;
  empresa_nombre: string;
  sede_codigo: string;
  sede_nombre: string;

  // Asignación
  area: AreaApoyo;
  tipo: TipoTicketConexion;
  titulo: string;
  descripcion: string;

  // Estado + workflow
  estado: EstadoTicketConexion;
  criticidad: 'Alta' | 'Media' | 'Baja';
  ans_dias_habiles: number;
  ans_expira_en: Timestamp;

  // Acuse de recibo
  acuse_recibo_en: Timestamp | null;
  acuse_recibo_por_uid: string | null;
  acuse_recibo_por_nombre: string | null;

  // Resolución
  resuelto_en: Timestamp | null;
  resuelto_por_uid: string | null;
  resuelto_por_nombre: string | null;
  evidencia_url: string | null;
  notas_resolucion: string;
  bloqueo_razon: string | null;

  // Disparo automático
  disparado_por: 'automatico_terna' | 'manual' | 'automatico_perfilamiento';
}

export const ticketConexionInputSchema = z.object({
  vacante_id: z.string().min(1),
  vacante_consecutivo: z.string(),
  postulacion_id: z.string().min(1),
  candidato_id: z.string().min(1),
  candidato_nombre: z.string().min(1),
  cargo_nombre: z.string().min(1),
  empresa_codigo: z.string().min(1),
  empresa_nombre: z.string().min(1),
  sede_codigo: z.string(),
  sede_nombre: z.string(),
  area: areaApoyo,
  tipo: tipoTicketConexion,
  titulo: z.string().min(1),
  descripcion: z.string().default(''),
  criticidad: z.enum(['Alta', 'Media', 'Baja']),
});
export type TicketConexionInput = z.infer<typeof ticketConexionInputSchema>;
