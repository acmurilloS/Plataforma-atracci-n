/**
 * Helpers de autorización para las funciones de gestión de usuarios.
 *
 * `secciones_admin` es un override POR-USUARIO (custom claim) que concede acceso
 * a ciertas secciones de administración sin ser admin pleno. Caso concreto:
 * Karen (coordinadora) tiene ['usuarios','catalogos'] para gestionar usuarios y
 * catálogos, pero NO es admin (sin Panel admin / seed / integraciones). Ver
 * `SeccionAdmin` en el front (src/schemas/enums.ts).
 *
 * Nota: NO abre el permiso a todo un rol — es persona por persona, vía el claim.
 */

type Token = Record<string, unknown> | undefined | null;

export function tieneSeccion(token: Token, seccion: string): boolean {
  const s = token?.secciones_admin;
  return Array.isArray(s) && s.includes(seccion);
}

/** admin pleno, o usuario con la sección 'usuarios' concedida. */
export function puedeGestionarUsuarios(token: Token): boolean {
  return token?.rol === 'admin' || tieneSeccion(token, 'usuarios');
}
