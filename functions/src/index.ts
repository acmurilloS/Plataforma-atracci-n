// Cloud Functions — Plataforma de Atracción EQUITEL (región us-central1).

// Hasta que exista UI de gestión de usuarios en /admin (la invoca el admin).
export { crearUsuarioCorporativo } from './auth/crearUsuarioCorporativo';
export { setearRolUsuario } from './auth/setearRolUsuario';

// Subir PDFs (avales, CVs, docs) a la Shared Drive corporativa de Equitel.
export { subirArchivoADrive } from './drive/subirArchivoADrive';

export { onVacanteCreate } from './vacantes/onVacanteCreate';
export { onCandidatoCreate } from './candidatos/onCandidatoCreate';
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

// Referidos internos (módulo v1, 2026-06-03).
export { generarInvitacionesReferidos } from './referidos/generarInvitaciones';
export { resolverRefSlug } from './referidos/resolverRefSlug';
export { marcarComoEnviadasReferidos } from './referidos/marcarComoEnviadas';

// Envío de pruebas al candidato por correo (paso 7, 2026-06-09).
export { enviarPruebaCandidato } from './pruebas/enviarPruebaCandidato';

// Correo de orden de exámenes médicos a los gestores SST (paso 15, 2026-06-09).
export { onExamenMedicoCreate } from './examenes/onExamenMedicoCreate';
// Reenvío manual de la orden a los gestores SST (botón de GH/analista, 2026-06-13).
export { reenviarOrdenGestores } from './examenes/reenviarOrdenGestores';
// Correo de la orden de exámenes al candidato (paso 16, 2026-06-16).
export { enviarOrdenExamenCandidato } from './examenes/enviarOrdenExamenCandidato';

// Correo al candidato con el agendamiento de su entrevista (pasos 8/13, 2026-06-12).
export { onEntrevistaCreate } from './entrevistas/onEntrevistaCreate';

// Correo al candidato con el listado de documentos requeridos (paso 10, 2026-06-12).
export { enviarListadoDocumentos } from './documentos/enviarListadoDocumentos';
// Aviso a GH cuando la carpeta queda completa para validar (C.1, 2026-06-16).
export { notificarCarpetaListaValidar } from './documentos/notificarCarpetaListaValidar';
// Correo de agradecimiento al candidato descartado (D.3, 2026-06-16).
export { enviarAgradecimientoCandidato } from './notificaciones/enviarAgradecimientoCandidato';
// Correos de plan de conexión/dotación al marcar contratado (F.2, 2026-06-16).
export { onCandidatoContratado } from './tickets/onCandidatoContratado';

// Portal del candidato (público, sin login): consentimientos digitales (2026-06-13).
export { enviarPortalCandidato } from './portal/enviarPortalCandidato';
export { resolverPortalToken } from './portal/resolverPortalToken';
export { registrarConsentimientoPortal } from './portal/registrarConsentimientoPortal';
export { registrarDocumentoPortal } from './portal/registrarDocumentoPortal';
// Aviso al candidato (correo con link al portal) cuando su proceso avanza (D.1, 2026-06-16).
export { onPostulacionAvance } from './portal/onPostulacionAvance';
// Revocar el portal del candidato (cierra el bearer-token, 2026-06-16).
export { revocarPortalCandidato } from './portal/revocarPortalCandidato';
// Firma de documentos del proceso (datos básicos / debida diligencia) en el portal (D.2, 2026-06-16).
export { registrarFirmaDocumento } from './portal/registrarFirmaDocumento';
// Condiciones laborales: envío al candidato + aceptación en el portal (E, 2026-06-16).
export { enviarCondicionesLaborales } from './condiciones/enviarCondicionesLaborales';
export { aceptarCondicionesLaborales } from './condiciones/aceptarCondicionesLaborales';
