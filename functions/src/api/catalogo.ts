/**
 * API pública v1 · catálogo (reu DOTATRACK 06-oct-2026).
 *
 * El catálogo de permisos vive EN CÓDIGO, no en una colección: agregar un permiso
 * es un cambio con despliegue y revisión. Y la regla de oro: NO se publica un
 * permiso sin su endpoint. Hoy el único consumidor es DOTATRACK (Juan Esteban
 * Ardila, dotación), que necesita los nuevos ingresos; el catálogo crece junto
 * con lo que de verdad se puede llamar.
 *
 * El ÁMBITO que acota una llave es la EMPRESA (EQT, CUM, ING, SLP…): la
 * plataforma es multi-empresa y las condiciones/ingresos se reparten por ahí.
 */

export const VERSION_API = '1';
export const PREFIJO_LLAVE = 'pa_live_';

export const PERMISOS = [
  {
    id: 'ingresos:read',
    nombre: 'Leer nuevos ingresos',
    descripcion:
      'Personas contratadas: identificación, cargo, empresa/sede/unidad, fechas, si el cargo requiere dotación y sus tallas.',
  },
] as const;

export type PermisoId = (typeof PERMISOS)[number]['id'];

export function esPermiso(x: unknown): x is PermisoId {
  return typeof x === 'string' && PERMISOS.some((p) => p.id === x);
}

/** Tope por minuto por defecto para una llave nueva. */
export const TOPE_DEFAULT_POR_MIN = 60;
export const TOPE_MAX_POR_MIN = 1000;
/** Tope duro de paginación: sin él un `limit` grande es una descarga completa. */
export const LIMITE_PAGINA_MAX = 100;
export const LIMITE_PAGINA_DEFAULT = 50;

/** Colecciones del módulo (todas server-only por reglas). */
export const COL_INTEGRACIONES = 'api_integraciones';
export const COL_LLAVES = 'api_llaves';
export const COL_REGISTRO = 'api_registro';
export const COL_LIMITE = 'api_limite';
