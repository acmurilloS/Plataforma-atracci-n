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
