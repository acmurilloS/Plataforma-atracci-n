import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import type { CamposAuditoria } from './auditoria';

/**
 * Carpeta digital del candidato · alineado al formato oficial Equitel DGH-F-04 v5.
 * Cada postulación tiene 18 documentos agrupados en 3 secciones.
 * Algunos son "si aplica" (no obligatorios para todo candidato).
 */

export const seccionDocumento = z.enum(['generales', 'seguridad_social', 'hoja_vida']);
export type SeccionDocumento = z.infer<typeof seccionDocumento>;

export const estadoDocumento = z.enum([
  'pendiente',   // no se ha entregado aún
  'entregado',   // candidato lo subió, falta verificar
  'verificado',  // GH revisó y dio OK
  'no_aplica',   // marcado por GH como no requerido para este candidato
]);
export type EstadoDocumento = z.infer<typeof estadoDocumento>;

export interface DocumentoCarpetaCatalogo {
  /** Llave única del documento dentro del checklist (estable, no cambia). */
  clave: string;
  seccion: SeccionDocumento;
  nombre: string;
  /** True si se permite marcar 'no_aplica'. */
  opcional: boolean;
  /** Texto guía para el candidato / GH. */
  ayuda?: string;
  /**
   * True si este documento lo APORTA el candidato (cédula, certificados, HV…).
   * Los internos/generados (contrato, afiliaciones, autorización, referencias)
   * van en false. Se usa para el correo "envío de listado al candidato".
   */
  aporta_candidato?: boolean;
  /**
   * True si lo gestiona directamente Gestión Humana (contrato, afiliaciones).
   * No lo sube el candidato ni Atracción → NO cuenta como obligatorio de la
   * carpeta de Atracción; se muestra con la nota "Omitir — gestión de GH".
   */
  gestionado_por_gh?: boolean;
  /** True si el ítem admite VARIOS archivos (p. ej. antecedentes judiciales). */
  multiple?: boolean;
}

/**
 * Catálogo canónico DGH-F-04 v5. NO eliminar ítems sin coordinar con GH.
 * Si Equitel lanza una versión nueva del formato, agregar ítems aquí y migrar
 * documentos existentes con un script.
 */
export const CATALOGO_DOCUMENTOS_CARPETA: readonly DocumentoCarpetaCatalogo[] = [
  // ─── Generales ────────────────────────────────────────────────────────
  {
    clave: 'datos_basicos_integrante',
    seccion: 'generales',
    nombre: 'Datos Básicos del Integrante (DGH-F-05)',
    opcional: false,
    ayuda: 'Formato interno con datos personales, laborales y familiares del candidato.',
  },
  {
    clave: 'contrato_trabajo',
    seccion: 'generales',
    nombre: 'Contrato de Trabajo',
    opcional: false,
    gestionado_por_gh: true,
  },
  {
    clave: 'solicitud_integrantes',
    seccion: 'generales',
    nombre: 'Solicitud de Integrantes / Reporte de Novedad',
    opcional: false,
  },

  // ─── Seguridad Social ─────────────────────────────────────────────────
  {
    clave: 'afiliacion_arl',
    seccion: 'seguridad_social',
    nombre: 'Afiliación ARL',
    opcional: false,
    gestionado_por_gh: true,
  },
  {
    clave: 'afiliacion_eps',
    seccion: 'seguridad_social',
    nombre: 'Afiliación EPS',
    opcional: false,
    gestionado_por_gh: true,
  },
  {
    clave: 'afiliacion_caja',
    seccion: 'seguridad_social',
    nombre: 'Afiliación Caja de Compensación',
    opcional: false,
    gestionado_por_gh: true,
  },
  {
    clave: 'certificacion_eps',
    seccion: 'seguridad_social',
    nombre: 'Certificación de EPS',
    opcional: true,
    aporta_candidato: true,
    ayuda: 'Solo si el candidato ya estaba afiliado a una EPS y la mantiene.',
  },
  {
    clave: 'certificacion_afp',
    seccion: 'seguridad_social',
    nombre: 'Certificación de AFP',
    opcional: true,
    aporta_candidato: true,
    ayuda: 'Solo si el candidato ya estaba afiliado a un fondo de pensiones.',
  },
  {
    clave: 'carta_cesantias',
    seccion: 'seguridad_social',
    nombre: 'Carta de Cesantías',
    opcional: true,
    aporta_candidato: true,
    ayuda: 'Solo si traslada cesantías de un empleador anterior.',
  },

  // ─── Documentos Hoja de Vida ──────────────────────────────────────────
  {
    clave: 'fotocopia_cedula',
    seccion: 'hoja_vida',
    nombre: 'Fotocopias de la Cédula de Ciudadanía (4)',
    opcional: false,
    aporta_candidato: true,
  },
  {
    clave: 'certificado_judicial',
    seccion: 'hoja_vida',
    nombre: 'Certificado Judicial Vigente y antecedentes',
    opcional: false,
    aporta_candidato: true,
    multiple: true,
    ayuda: 'Admite varios archivos: antecedentes de Policía e Informa Colombia y, si hubo novedad, el concepto de Jurídica (trazabilidad de la validación).',
  },
  {
    clave: 'certificados_laborales',
    seccion: 'hoja_vida',
    nombre: 'Certificados Laborales (2)',
    opcional: false,
    aporta_candidato: true,
  },
  {
    clave: 'certificados_estudio',
    seccion: 'hoja_vida',
    nombre: 'Fotocopias de los Certificados de Estudio',
    opcional: false,
    aporta_candidato: true,
  },
  {
    clave: 'certificado_medico',
    seccion: 'hoja_vida',
    nombre: 'Certificado médico de aptitud laboral',
    opcional: false,
    multiple: true,
    ayuda: 'Admite varios archivos: el concepto de aptitud y, si el candidato ingresa con recomendaciones médicas, el documento firmado de aceptación.',
  },
  {
    clave: 'hoja_vida',
    seccion: 'hoja_vida',
    nombre: 'Hoja de Vida',
    opcional: false,
    aporta_candidato: true,
  },
  {
    clave: 'autorizacion_datos',
    seccion: 'hoja_vida',
    nombre: 'Autorización para recolección y tratamiento de datos personales',
    opcional: false,
    ayuda: 'Habeas Data · Ley 1581 de 2012. Plantilla auto-generada por la plataforma.',
  },
  {
    clave: 'evaluacion_psicologica',
    seccion: 'hoja_vida',
    nombre: 'Informe de Evaluación Psicológica',
    opcional: false,
  },
  {
    clave: 'resultado_pruebas_psicologicas',
    seccion: 'hoja_vida',
    nombre: 'Resultado de pruebas psicológicas del candidato',
    opcional: false,
    multiple: true,
    ayuda: 'Admite varios archivos: los resultados de las pruebas psicológicas aplicadas al candidato.',
  },
  {
    clave: 'pruebas_tecnicas',
    seccion: 'hoja_vida',
    nombre: 'Informe de Pruebas Técnicas',
    opcional: true,
    ayuda: 'Si aplica al cargo (técnicos, comerciales).',
  },
  {
    clave: 'verificacion_referencias',
    seccion: 'hoja_vida',
    nombre: 'Verificación de Referencias',
    opcional: false,
    ayuda: 'Formato VIDA-F-12 diligenciado dentro de la plataforma.',
  },
];

export const SECCIONES_LABEL: Record<SeccionDocumento, string> = {
  generales: 'Generales',
  seguridad_social: 'Seguridad Social',
  hoja_vida: 'Documentos Hoja de Vida',
};

/**
 * Helper: cuántos del checklist son obligatorios para ATRACCIÓN (no opcionales
 * y no gestionados por GH). Los de GH no bloquean la completitud de la carpeta.
 */
export function totalObligatorios(): number {
  return CATALOGO_DOCUMENTOS_CARPETA.filter((d) => !d.opcional && !d.gestionado_por_gh).length;
}

// ─── Documento individual del candidato (un row por ítem del checklist) ───

/** Un archivo dentro de un ítem que admite varios (catalogo.multiple). */
export interface ArchivoCarpeta {
  url: string;
  nombre: string;
  tamano_bytes?: number | null;
  subido_en?: Timestamp | null;
}

export interface DocumentoCandidatoDoc extends CamposAuditoria {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  candidato_nombre: string;

  /** Llave del catálogo (datos_basicos_integrante, afiliacion_arl, etc.). */
  clave: string;
  seccion: SeccionDocumento;
  nombre: string;

  estado: EstadoDocumento;

  // Archivo subido (cuando estado != 'pendiente' y != 'no_aplica').
  // En ítems `multiple`, archivo_url/nombre_archivo apuntan al PRIMER archivo y
  // la lista completa vive en `archivos`.
  archivo_url: string | null;
  nombre_archivo: string | null;
  tamano_bytes: number | null;
  /** Lista de archivos cuando el ítem admite varios (catalogo.multiple). */
  archivos?: ArchivoCarpeta[];

  observaciones: string;

  // Auditoría de la verificación
  fecha_entrega: Timestamp | null;
  verificado_en: Timestamp | null;
  verificado_por_uid: string | null;
  verificado_por_nombre: string | null;
}
