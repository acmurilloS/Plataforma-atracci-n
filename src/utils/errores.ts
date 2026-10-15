import { codigoError } from './archivos';

/**
 * Mensaje para mostrar cuando falla una función del servidor (callable).
 *
 * Nuestras funciones responden en español ("Es un aumento de planta: adjunta el
 * aval…") y ese texto se muestra tal cual. Lo que NO se muestra es el genérico
 * del SDK: incidente 15-oct, a Karen le salió solo "internal" al guardar en
 * Editar identificación porque la función había quedado sin permiso de
 * invocación (Cloud Run la rechazaba antes de ejecutarse). Hoy se vigila con
 * `npm run verificar:funciones`.
 */
export function mensajeErrorFuncion(e: unknown, porDefecto = 'No pudimos completar la acción.'): string {
  const code = codigoError(e);
  const msg = e instanceof Error ? e.message.trim() : '';
  if (
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded' ||
    /network|failed to fetch|load failed/i.test(msg)
  ) {
    return 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.';
  }
  if (code === 'functions/unauthenticated') {
    return 'Tu sesión se venció. Recarga la página e inicia sesión de nuevo.';
  }
  if (!msg || /^internal$/i.test(msg)) {
    return `${porDefecto} El servidor no respondió como se esperaba: recarga la página e inténtalo de nuevo. Si sigue pasando, avísale al administrador de la plataforma con un pantallazo.`;
  }
  // Texto técnico en inglés del SDK (p. ej. "Firebase: …"): no se muestra.
  if (/firebase|^[a-z-]+$/i.test(msg)) return porDefecto;
  return msg;
}
