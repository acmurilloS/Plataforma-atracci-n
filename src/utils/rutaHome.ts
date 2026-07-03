import type { RolUsuario } from '../schemas';

/**
 * Home ("inicio") de cada perfil (reu 03-jul). Admin/coordinación entran al
 * Dashboard; los demás a su pestaña principal de trabajo. Cada uno recibe el
 * saludo personalizado en SU home (ver SaludoInicio).
 */
export function rutaHome(rol: RolUsuario | null | undefined): string {
  switch (rol) {
    case 'admin':
    case 'coordinador':
      return '/dashboard';
    case 'gh':
      return '/carpetas';
    case 'apoyo':
      return '/tickets';
    case 'lider':
    case 'analista':
    case 'talentos':
      return '/seguimiento';
    default:
      return '/seguimiento';
  }
}
