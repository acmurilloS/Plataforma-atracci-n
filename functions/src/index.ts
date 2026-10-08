// Cloud Functions — Plataforma de Atracción EQUITEL (región us-central1).

// Hasta que exista UI de gestión de usuarios en /admin (la invoca el admin).
export { crearUsuarioCorporativo } from './auth/crearUsuarioCorporativo';
export { setearRolUsuario } from './auth/setearRolUsuario';
// Onboarding de autoservicio: el usuario elige su rol en el primer ingreso.
export { autoasignarRol } from './auth/autoasignarRol';
// El staff pre-asigna roles sensibles (gh, apoyo) por correo, en lote.
export { preasignarRoles } from './auth/preasignarRoles';
// Pestaña de Usuarios (admin): listar con último login + activar/desactivar (reu 03-jul).
export { listarUsuariosAdmin } from './auth/listarUsuariosAdmin';
export { cambiarEstadoUsuario } from './auth/cambiarEstadoUsuario';

// Subir PDFs (avales, CVs, docs) a la Shared Drive corporativa de Equitel.
export { subirArchivoADrive } from './drive/subirArchivoADrive';
// Depósito de la carpeta completa (CyD+GH al 100%) en la Unidad Compartida de GH.
export { onCarpetaCompletaTotal } from './drive/onCarpetaCompletaTotal';
export { probarConexionDrive, sincronizarCarpetaDrive } from './drive/callablesDrive';

export { onVacanteCreate } from './vacantes/onVacanteCreate';
// Asignación MANUAL de la analista por el staff (reu 26-jun): selector en la vacante.
export { asignarAnalista } from './vacantes/asignarAnalista';
// Eliminar una vacante completa (solo admin) con cascada + auditoría.
export { eliminarVacante } from './vacantes/eliminarVacante';
// Editar la identificación de la vacante (empresa/sede/unidad/tipo) — líder creador o staff.
export { editarDatosVacante } from './vacantes/editarDatosVacante';
// Resumen de postulaciones EN CURSO por vacante -> fase real en Seguimiento (reu Karen 10-sep).
export { onPostulacionResumen } from './vacantes/onPostulacionResumen';
// Reconciliación del resumen: callable admin (dry_run por defecto) + programada diaria 03:00.
export {
  recalcularResumenesVacantes,
  recalcularResumenesVacantesDiario,
} from './vacantes/recalcularResumenesVacantes';
// Reloj del líder tras el Concepto (reu Karen 09-sep, punto 7): se arma al enviar el
// Concepto/terna y se detiene al agendar la entrevista con el líder. Apagado por config.
export { onVacanteEnvioLider } from './vacantes/onVacanteEnvioLider';
export { onEntrevistaLiderDetieneReloj } from './entrevistas/onEntrevistaLiderDetieneReloj';
// Repostular un candidato a otra vacante activa sin re-inscribirlo (reu 26-jun).
export { repostularCandidato } from './postulaciones/repostularCandidato';
// Registrar fecha de vinculacion -> contratado + cierra la vacante (reu Karen 27-ago).
export { registrarFechaVinculacion } from './postulaciones/registrarFechaVinculacion';
// Movimiento interno: persona ya empleada, salta directo a contratacion (reu Karen sep-2026).
export { marcarMovimientoInterno } from './postulaciones/marcarMovimientoInterno';
// Seed idempotente de sedes nuevas (ciudades faltantes, reu Karen 27-ago).
export { seedSedesNuevas } from './catalogos/seedSedesNuevas';
export { onCandidatoCreate } from './candidatos/onCandidatoCreate';
// Edición de datos del candidato/integrante por staff, con auditoría (reu 26-jun).
export { editarDatosCandidato } from './candidatos/editarDatosCandidato';
export { scheduledSeedFestivos, sembrarFestivosCallable } from './festivos/festivos';
export { seedInicial } from './seed/seedInicial';
export { buscarCandidatosIA } from './sourcing/buscarCandidatosIA';
export { recibirCandidatosClay } from './sourcing/recibirCandidatosClay';
export {
  revisarRecordatoriosLider,
  revisarRecordatoriosLiderCallable,
} from './notificaciones/recordatoriosLider';
export { onNotificacionCreate } from './notificaciones/onNotificacionCreate';
export { analizarPerfilIA } from './perfilamiento/analizarPerfilIA';
export { registrarSolicitudHerramientas } from './solicitudes/registrarSolicitudHerramientas';
export { reintentarSolicitudesHojaIT } from './solicitudes/reintentarSolicitudesHojaIT';

// Referidos internos (módulo v1, 2026-06-03).
export { generarInvitacionesReferidos } from './referidos/generarInvitaciones';
export { resolverRefSlug } from './referidos/resolverRefSlug';
export { contextoOfertaPublica } from './carreras/contextoOfertaPublica';
export { marcarComoEnviadasReferidos } from './referidos/marcarComoEnviadas';

// Envío de pruebas al candidato por correo (paso 7, 2026-06-09).
export { enviarPruebaCandidato } from './pruebas/enviarPruebaCandidato';

// Asegura la solicitud de examen al ENTRAR a en_examenes_medicos (cualquier vía).
export { onPostulacionEnExamenes } from './examenes/onPostulacionEnExamenes';
// Correo de orden de exámenes médicos a los gestores SST (paso 15, 2026-06-09).
export { onExamenMedicoCreate } from './examenes/onExamenMedicoCreate';
// Reenvío manual de la orden a los gestores SST (botón de GH/analista, 2026-06-13).
export { reenviarOrdenGestores } from './examenes/reenviarOrdenGestores';
// Correo de la orden de exámenes al candidato (paso 16, 2026-06-16).
export { enviarOrdenExamenCandidato } from './examenes/enviarOrdenExamenCandidato';
// Aviso a gestores SST cuando una contratación TEMPORAL no lleva exámenes (reu 04-ago).
export { avisarGestoresTemporalSinExamenes } from './examenes/avisarGestoresTemporalSinExamenes';
// El gestor SST sube el resultado + novedad + acta (reu Karen 09-jul).
export { registrarResultadoExamen } from './examenes/registrarResultadoExamen';
// Reconciliación one-shot: examen -> no_apto para descartados por exámenes (reu 19-ago).
export { reconciliarExamenesDescartados } from './examenes/reconciliarExamenesDescartados';
// Don Diego (C&D) decide continúa / no-continúa una novedad (reu Karen 09-jul).
export { decisionCulturaExamen } from './examenes/decisionCulturaExamen';
// GH autoriza el envío a gestores de una persona en condición de discapacidad (reu Karen jul-2026).
export { autorizarGestoresDiscapacidad } from './examenes/autorizarGestoresDiscapacidad';

// Correo al candidato con el agendamiento de su entrevista (pasos 8/13, 2026-06-12).
export { onEntrevistaCreate } from './entrevistas/onEntrevistaCreate';

// Correo al candidato con el listado de documentos requeridos (paso 10, 2026-06-12).
export { enviarListadoDocumentos } from './documentos/enviarListadoDocumentos';
// Aviso a GH cuando la carpeta queda completa para validar (C.1, 2026-06-16).
export { notificarCarpetaListaValidar } from './documentos/notificarCarpetaListaValidar';
// Auto-armado de la carpeta cuando se completan los obligatorios (Portal F5, 2026-06-17).
export { onCarpetaCompletaCheck } from './documentos/onCarpetaCompletaCheck';
// Aviso a GH cuando la carpeta se ENTREGA formalmente (paso 19, 2026-06-25).
export { onCarpetaEntregada } from './documentos/onCarpetaEntregada';
// Correo de agradecimiento al candidato descartado (D.3, 2026-06-16).
export { enviarAgradecimientoCandidato } from './notificaciones/enviarAgradecimientoCandidato';
// Agradecimiento AUTOMÁTICO al pasar a un estado de descarte (audit #17).
export { onPostulacionDescartada } from './notificaciones/onPostulacionDescartada';
// Borrador de mensaje al candidato con IA enchufable (categoría segura, confidencialidad).
export { maquillarMensajeIA } from './notificaciones/maquillarMensaje';
// Correos de plan de conexión/dotación al marcar contratado (F.2, 2026-06-16).
export { onCandidatoContratado } from './tickets/onCandidatoContratado';
// Aprobar carpeta = contratar + cerrar vacante + tickets, transaccional y con
// unicidad de 1 contratado por vacante (BUG 3+4, 2026-06-24).
export { aprobarCarpeta } from './carpetas/aprobarCarpeta';
// Revisión automática de la carpeta (capa 0, sin IA): cruces de cédula/nombre/
// correo/celular/cargo entre candidato, postulación, vacante y DGH-F-05 (reu 16-sep).
export { revisarCarpeta } from './carpetas/revisarCarpeta';
export { decidirTerna } from './decisiones/decidirTerna';
// Solicitud de dotación con tallas (subpaso de entrega de carpeta, reu 26-jun).
export { enviarSolicitudDotacion } from './dotacion/enviarSolicitudDotacion';
// Dotación AUTOMÁTICA al diligenciar las tallas en Datos Básicos (reu Karen 02-jul).
export { onDatosBasicosTallas } from './dotacion/onDatosBasicosTallas';

// Portal del candidato (público, sin login): consentimientos digitales (2026-06-13).
export { enviarPortalCandidato } from './portal/enviarPortalCandidato';
export { resolverPortalToken } from './portal/resolverPortalToken';
export { registrarConsentimientoPortal } from './portal/registrarConsentimientoPortal';
export { registrarDocumentoPortal } from './portal/registrarDocumentoPortal';
// Subida del candidato a un slot de su carpeta real documentos_candidato (Portal F4, 2026-06-17).
export { registrarDocumentoCarpetaPortal } from './portal/registrarDocumentoCarpetaPortal';
// Diagnóstico de subidas fallidas del portal (solo Cloud Logging; incidente 08-oct).
export { reportarFalloSubidaPortal } from './portal/reportarFalloSubidaPortal';
// Quitar uno de los archivos de un item multiple desde el portal (reporte 09-sep).
export { quitarArchivoCarpetaPortal } from './portal/quitarArchivoCarpetaPortal';
// Aviso al candidato (correo con link al portal) cuando su proceso avanza (D.1, 2026-06-16).
export { onPostulacionAvance } from './portal/onPostulacionAvance';
// Revocar el portal del candidato (cierra el bearer-token, 2026-06-16).
export { revocarPortalCandidato } from './portal/revocarPortalCandidato';
// Firma de documentos del proceso (datos básicos / debida diligencia) en el portal (D.2, 2026-06-16).
export { registrarFirmaDocumento } from './portal/registrarFirmaDocumento';
// El integrante diligencia y firma sus Datos Básicos (DGH-F-05) desde el portal (reu 26-jun).
export { registrarDatosBasicosPortal } from './portal/registrarDatosBasicosPortal';
// El integrante diligencia y firma su Debida Diligencia / SAGRILAFT (F-CAR-01) desde el portal (B2).
export { registrarDebidaDiligenciaPortal } from './portal/registrarDebidaDiligenciaPortal';
// Corregir un formato controlado (Datos Básicos / SAGRILAFT) + regenerar con trazabilidad (reu 26-jun).
export { regenerarFormatoOficial } from './formatos/regenerarFormatoOficial';
// Condiciones laborales: envío al candidato + aceptación en el portal (E, 2026-06-16).
export { enviarCondicionesLaborales } from './condiciones/enviarCondicionesLaborales';
export { aceptarCondicionesLaborales } from './condiciones/aceptarCondicionesLaborales';
// Carta de bienvenida: envío al candidato con el PDF adjunto (#4b, reu 18-ago).
export { enviarCartaBienvenida } from './cartas/enviarCartaBienvenida';

// ── API pública v1 (reu DOTATRACK 06-oct-2026) ─────────────────────────────
// `api` atiende https://ptm-atraccion.web.app/api/v1/* (hosting reescribe /api/**).
// Las callables api* son la administración (solo admin): integraciones, llaves y registro.
export { api } from './api/router';
export {
  apiListarIntegraciones,
  apiGuardarIntegracion,
  apiEliminarIntegracion,
  apiCrearLlave,
  apiRevocarLlave,
  apiRotarLlave,
  apiListarRegistro,
} from './api/admin';
