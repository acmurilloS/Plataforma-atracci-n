import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';
import { codigoEmpresaSede } from './enums';

/**
 * Debida Diligencia · alineado al formato oficial Equitel F-CAR-01 v5.
 * Cumplimiento legal SAGRILAFT (Circular Básica Jurídica 100-000016/2020,
 * Decreto 830/2021, Decreto 1674, Estatuto Anticorrupción Ley 190/1995).
 *
 * Se diligencia post-selección (antes de contratación). El integrante firma,
 * el oficial de cumplimiento de la empresa verifica en listas vinculantes y aprueba.
 */

export const tipoDocumentoIdentidad = z.enum(['CC', 'CE', 'PEP', 'PA', 'OTRO']);
export type TipoDocumentoIdentidad = z.infer<typeof tipoDocumentoIdentidad>;

export const tipoVinculacion = z.enum(['directo', 'temporal', 'aprendiz', 'practica', 'contratista']);
export type TipoVinculacion = z.infer<typeof tipoVinculacion>;

export const tipoRegistroDiligencia = z.enum(['nuevo_integrante', 'actualizacion_anual', 'cambio_cargo']);
export type TipoRegistroDiligencia = z.infer<typeof tipoRegistroDiligencia>;

export const estadoDebidaDiligencia = z.enum([
  'borrador',                  // analista creó, integrante aún no firma
  'firmado_integrante',        // el candidato firmó las 3 cláusulas
  'verificado_cumplimiento',   // oficial de cumplimiento verificó listas
  'completado',                // todo OK
  'rechazado',                 // se encontraron incidencias en listas
]);
export type EstadoDebidaDiligencia = z.infer<typeof estadoDebidaDiligencia>;

// ─── Subdocs ────────────────────────────────────────────────────────────

export const vinculadoPepSchema = z.object({
  nombre: z.string().min(1),
  relacion: z.string().min(1),
  identidad: z.string().min(1),
  cargo_ocupacion: z.string().min(1),
  fecha_desvinculacion: z.string().optional(), // ISO date string o vacío
});
export type VinculadoPep = z.infer<typeof vinculadoPepSchema>;

// ─── Documento principal ────────────────────────────────────────────────

export interface DebidaDiligenciaDoc extends CamposAuditoria {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  candidato_nombre: string;

  estado: EstadoDebidaDiligencia;

  // 1. Datos de empresa y registro
  empresa_codigo: string;
  empresa_nombre: string;
  tipo_registro: TipoRegistroDiligencia;
  departamento: string;
  ciudad_municipio: string;
  fecha_diligenciamiento: Timestamp;
  fecha_ingreso: Timestamp | null;
  cargo: string;
  tipo_vinculacion: TipoVinculacion;

  // 2. Datos generales del integrante
  primer_apellido: string;
  segundo_apellido: string;
  nombres: string;
  identificacion: string;
  tipo_documento: TipoDocumentoIdentidad;
  tipo_documento_otro: string; // si tipo_documento='OTRO'
  fecha_nacimiento: Timestamp | null;
  celular: string;
  pais: string;
  fecha_expedicion_documento: Timestamp | null;
  lugar_expedicion: string;
  direccion_residencial: string;
  correo_electronico: string;

  // Familiar en la empresa
  tiene_familiar_empresa: boolean;
  nombre_apellidos_familiar: string;
  parentesco_familiar: string;
  cargo_familiar: string;

  // 3. Información del cónyuge
  conyuge_primer_apellido: string;
  conyuge_segundo_apellido: string;
  conyuge_nombres: string;
  conyuge_identificacion: string;
  conyuge_tipo_documento: TipoDocumentoIdentidad | null;
  conyuge_telefono: string;
  conyuge_ocupacion: string;
  conyuge_empleador: string;
  conyuge_parentesco: string;

  // 4. Información financiera
  realiza_operaciones_moneda_extranjera: boolean;
  operaciones_moneda_extranjera_detalle: string;
  posee_productos_financieros_extranjero: boolean;
  productos_financieros_extranjero_detalle: string;
  realiza_actividad_ingresos_adicionales: boolean;
  ingresos_adicionales_observaciones: string;

  // 5. PEP (Persona Expuesta Políticamente)
  posee_reconocimiento_publico: boolean;
  posee_vinculo_pep: boolean;
  vinculados_pep: VinculadoPep[];

  // 6, 7, 8. Cláusulas firmadas por el integrante
  acepta_clausulas_anticorrupcion: boolean;
  acepta_declaracion_origenes_ingreso: boolean;
  acepta_politicas_laft: boolean;
  firma_integrante_url: string | null; // PDF o imagen de firma escaneada
  fecha_firma_integrante: Timestamp | null;

  // 9. Espacio exclusivo de la empresa (oficial de cumplimiento)
  verificado_listas_vinculantes: boolean | null; // null = no verificado aún
  fecha_consulta_listas: Timestamp | null;
  observaciones_verificacion: string;
  verificado_por_uid: string | null;
  verificado_por_nombre: string | null;
  cargo_verificador: string;
  vobo_oficial_cumplimiento: boolean;
}

// ─── Input mínimo para crear (lo que registra el analista al iniciar) ───

export const debidaDiligenciaInputSchema = z.object({
  empresa_codigo: codigoEmpresaSede,
  empresa_nombre: z.string().min(1),
  tipo_registro: tipoRegistroDiligencia.default('nuevo_integrante'),
  cargo: z.string().min(1),
  tipo_vinculacion: tipoVinculacion.default('directo'),
});
export type DebidaDiligenciaInput = z.infer<typeof debidaDiligenciaInputSchema>;
