import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Datos Básicos del Integrante · alineado al formato oficial Equitel DGH-F-05 v8.
 * Cubre la información que el candidato seleccionado completa para que GH pueda
 * registrarlo en nómina. Se diligencia en la Fase E (Ingreso, paso 18-19).
 *
 * Algunos campos solo los puede llenar GH (caja de compensación, ARL, riesgo %).
 */

export const tipoContratacion = z.enum(['directo', 'temporal']);
export type TipoContratacion = z.infer<typeof tipoContratacion>;

export const estadoCivil = z.enum([
  'soltero',
  'casado',
  'union_libre',
  'separado',
  'divorciado',
  'viudo',
]);
export type EstadoCivil = z.infer<typeof estadoCivil>;

export const generoIntegrante = z.enum(['masculino', 'femenino', 'otro']);
export type GeneroIntegrante = z.infer<typeof generoIntegrante>;

export const grupoSanguineo = z.enum([
  'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-',
]);
export type GrupoSanguineo = z.infer<typeof grupoSanguineo>;

export const estadoDatosBasicos = z.enum([
  'borrador',                  // analista creó, candidato aún no diligencia
  'diligenciado_integrante',   // candidato completó sus datos
  'autorizado_gh',             // GH validó + agregó caja/ARL/riesgo
  'registrado_nomina',         // ya está en nómina
]);
export type EstadoDatosBasicos = z.infer<typeof estadoDatosBasicos>;

// ─── Subdocs ────────────────────────────────────────────────────────────

export const hijoSchema = z.object({
  nombre: z.string().min(1),
  fecha_nacimiento: z.string().optional(), // ISO date
});
export type Hijo = z.infer<typeof hijoSchema>;

export const contactoEmergenciaSchema = z.object({
  nombre: z.string(),
  telefono: z.string(),
});
export type ContactoEmergencia = z.infer<typeof contactoEmergenciaSchema>;

// ─── Documento principal ────────────────────────────────────────────────

export interface DatosBasicosIntegranteDoc extends CamposAuditoria {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  candidato_nombre: string;

  estado: EstadoDatosBasicos;

  // Cabecera
  tipo_contratacion: TipoContratacion;
  empresa_codigo: string;
  empresa_nombre: string;

  // 1. Información personal
  nombres: string;
  apellidos: string;
  documento_tipo: string;            // CC, CE, PEP, PA
  documento_numero: string;
  documento_ciudad_expedicion: string;
  documento_dpto_expedicion: string;
  direccion: string;
  barrio: string;
  ciudad_domicilio: string;
  telefono_fijo: string;
  celular: string;
  fecha_nacimiento: Timestamp | null;
  lugar_nacimiento: string;
  estado_civil: EstadoCivil | null;
  profesion_actividad: string;
  genero: GeneroIntegrante | null;
  grupo_sanguineo: GrupoSanguineo | null;
  alergico_a: string;
  dependiente_medicamento: string;
  libreta_militar_numero: string;
  libreta_militar_clase: string;
  correo_electronico: string;

  // 2. Información laboral
  cuenta_banco_numero: string;
  entidad_bancaria: string;
  fondo_pensiones_obligatorias: string;   // AFP
  entidad_promotora_salud: string;        // EPS
  fondo_cesantias: string;
  caja_compensacion: string;              // solo GH
  arl: string;                            // solo GH
  riesgo_porcentaje: string;              // solo GH

  // 3. Información familiar
  conyuge_nombre: string;
  conyuge_documento: string;
  conyuge_profesion_actividad: string;
  conyuge_fecha_nacimiento: Timestamp | null;
  hijos: Hijo[];

  // 4. Emergencia (hasta 2 contactos)
  emergencia_contacto_1: ContactoEmergencia;
  emergencia_contacto_2: ContactoEmergencia;

  // 5. Dotación - tallajes
  talla_calzado: string;
  talla_pantalon: string;
  talla_chaleco: string;
  talla_guantes: string;
  talla_overol: string;
  talla_camisa_blusa: string;
  talla_otros: string;

  // 6. Observaciones + familiares en la organización
  observaciones: string;
  tiene_familiares_organizacion: boolean;
  nombre_familiar_organizacion: string;

  // 7. Firmas (auditoría de las 3 etapas del workflow)
  firma_integrante_url: string | null;
  fecha_firma_integrante: Timestamp | null;

  autorizacion_gh_uid: string | null;
  autorizacion_gh_nombre: string | null;
  fecha_autorizacion_gh: Timestamp | null;

  registrado_nomina_uid: string | null;
  registrado_nomina_nombre: string | null;
  fecha_registrado_nomina: Timestamp | null;
}
