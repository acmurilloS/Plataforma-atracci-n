/**
 * Réplica server-side del catálogo de la carpeta digital (DGH-F-04 v5).
 *
 * El catálogo "fuente de verdad" vive en src/schemas/documentoCarpetaSchema.ts
 * (frontend). Las Cloud Functions no pueden importar desde src/, así que se
 * replican aquí las claves + flags que el backend necesita (slots del candidato,
 * obligatorios, nombre/sección para escribir documentos_candidato).
 *
 * MANTENER EN SYNC con documentoCarpetaSchema.ts si el catálogo cambia.
 */

export interface ItemCatalogoCarpeta {
  clave: string;
  seccion: 'generales' | 'seguridad_social' | 'hoja_vida';
  nombre: string;
  opcional: boolean;
  aporta_candidato: boolean;
  /** Responsable: 'gh' (contrato, afiliaciones) NO bloquea la parte de CyD. */
  responsable?: 'cyd' | 'gh';
}

export const CATALOGO_CARPETA: ItemCatalogoCarpeta[] = [
  { clave: 'datos_basicos_integrante', seccion: 'generales', nombre: 'Datos Básicos del Integrante (DGH-F-05)', opcional: false, aporta_candidato: false },
  { clave: 'contrato_trabajo', seccion: 'generales', nombre: 'Contrato de Trabajo', opcional: false, aporta_candidato: false, responsable: 'gh' },
  { clave: 'solicitud_integrantes', seccion: 'generales', nombre: 'Solicitud de Integrantes / Reporte de Novedad', opcional: false, aporta_candidato: false },
  { clave: 'afiliacion_arl', seccion: 'seguridad_social', nombre: 'Afiliación ARL', opcional: false, aporta_candidato: false, responsable: 'gh' },
  { clave: 'afiliacion_eps', seccion: 'seguridad_social', nombre: 'Afiliación EPS', opcional: false, aporta_candidato: false, responsable: 'gh' },
  { clave: 'afiliacion_caja', seccion: 'seguridad_social', nombre: 'Afiliación Caja de Compensación', opcional: false, aporta_candidato: false, responsable: 'gh' },
  { clave: 'certificacion_eps', seccion: 'seguridad_social', nombre: 'Certificación de EPS', opcional: true, aporta_candidato: true },
  { clave: 'certificacion_afp', seccion: 'seguridad_social', nombre: 'Certificación de AFP', opcional: true, aporta_candidato: true },
  { clave: 'carta_cesantias', seccion: 'seguridad_social', nombre: 'Carta de Cesantías', opcional: true, aporta_candidato: true },
  { clave: 'fotocopia_cedula', seccion: 'hoja_vida', nombre: 'Fotocopias de la Cédula de Ciudadanía (4)', opcional: false, aporta_candidato: true },
  { clave: 'certificado_judicial', seccion: 'hoja_vida', nombre: 'Certificado Judicial Vigente y antecedentes', opcional: false, aporta_candidato: true },
  { clave: 'certificados_laborales', seccion: 'hoja_vida', nombre: 'Certificados Laborales (2)', opcional: false, aporta_candidato: true },
  { clave: 'certificados_estudio', seccion: 'hoja_vida', nombre: 'Fotocopias de los Certificados de Estudio', opcional: false, aporta_candidato: true },
  { clave: 'certificado_medico', seccion: 'hoja_vida', nombre: 'Certificado médico de aptitud laboral', opcional: false, aporta_candidato: false },
  { clave: 'hoja_vida', seccion: 'hoja_vida', nombre: 'Hoja de Vida', opcional: false, aporta_candidato: true },
  { clave: 'autorizacion_datos', seccion: 'hoja_vida', nombre: 'Autorización para recolección y tratamiento de datos personales', opcional: false, aporta_candidato: false },
  { clave: 'debida_diligencia', seccion: 'hoja_vida', nombre: 'Debida Diligencia / SAGRILAFT (F-CAR-01)', opcional: false, aporta_candidato: false },
  { clave: 'evaluacion_psicologica', seccion: 'hoja_vida', nombre: 'Informe de Evaluación Psicológica', opcional: false, aporta_candidato: false },
  { clave: 'resultado_pruebas_psicologicas', seccion: 'hoja_vida', nombre: 'Resultado de pruebas psicológicas del candidato', opcional: false, aporta_candidato: false },
  { clave: 'pruebas_tecnicas', seccion: 'hoja_vida', nombre: 'Informe de Pruebas Técnicas', opcional: true, aporta_candidato: false },
  { clave: 'verificacion_referencias', seccion: 'hoja_vida', nombre: 'Verificación de Referencias', opcional: false, aporta_candidato: false },
];

export const ITEM_POR_CLAVE: Record<string, ItemCatalogoCarpeta> = Object.fromEntries(
  CATALOGO_CARPETA.map((i) => [i.clave, i]),
);

/** Claves que aporta el candidato (los slots del portal). */
export const CLAVES_APORTA_CANDIDATO = CATALOGO_CARPETA.filter((i) => i.aporta_candidato).map(
  (i) => i.clave,
);

const esGH = (i: ItemCatalogoCarpeta) => i.responsable === 'gh';

/**
 * Claves obligatorias de la parte de CyD/Atracción (evalúan si CyD completó su
 * parte → dispara el aviso a GH y el auto-armado). Excluye los de GH (contrato,
 * afiliaciones): esos no bloquean la parte de CyD.
 */
export const CLAVES_OBLIGATORIAS = CATALOGO_CARPETA.filter(
  (i) => !i.opcional && !esGH(i),
).map((i) => i.clave);

/** Claves obligatorias a cargo de Gestión Humana (contrato, afiliaciones). */
export const CLAVES_OBLIGATORIAS_GH = CATALOGO_CARPETA.filter(
  (i) => !i.opcional && esGH(i),
).map((i) => i.clave);
