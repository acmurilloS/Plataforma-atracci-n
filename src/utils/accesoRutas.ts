import type { RolUsuario } from '../schemas';

/**
 * accesoRutas · FUENTE ÚNICA de quién puede abrir cada ruta protegida.
 *
 * Por qué existe: el gating de RUTAS (App.tsx) y el de LINKS (cada página) vivían
 * separados y se sincronizaban a mano. Resultado: 27 "callejones sin salida" —
 * links visibles para un rol que apuntaban a rutas que ese rol no podía abrir
 * (auditoría 14-jul). El caso más grave: GH entraba a Carpetas → "Ir al tab
 * Documentos" y el botón de volver lo mandaba a una pantalla prohibida.
 *
 * Regla: App.tsx usa estas listas para los <ProtectedRoute>, y las páginas usan
 * los helpers `puede*` para decidir si RENDERIZAN un link. Así, un link a una
 * ruta prohibida es imposible por construcción — si cambias el acceso, cambian
 * los dos lados a la vez.
 */

/** Roles que trabajan el proceso de atracción (vacante/postulación). */
export const ROLES_PROCESO: RolUsuario[] = ['lider', 'analista', 'coordinador', 'admin'];

/**
 * Detalle de la VACANTE. Además del proceso entran 'talentos' (José, lectura del
 * perfilamiento — su único camino al perfilamiento es esta página) y 'apoyo'
 * (llega desde el consecutivo de sus tickets).
 *
 * GH NO va en esta lista a propósito: la reu Karen 09-jul pidió que no vean las
 * vacantes ajenas, y varias pantallas usan esta lista para pintar links a
 * vacantes de OTROS líderes. La excepción es acotada: un gh que sea el LÍDER
 * SOLICITANTE de la vacante (lider_uid == uid) sí entra (reu Karen 16-sep,
 * decisión 25-sep). Ese permiso va inline en la <Route> de App.tsx y se valida
 * por dueño dentro de la página — ver `esGhDuenoDeVacante` / `puedeVerVacanteDe`.
 */
export const ROLES_VACANTE_DETALLE: RolUsuario[] = [...ROLES_PROCESO, 'talentos', 'apoyo'];

/** Seguimiento: todos menos GH (reu 09-jul) y los roles acotados. */
export const ROLES_SEGUIMIENTO: RolUsuario[] = [
  'lider',
  'analista',
  'coordinador',
  'apoyo',
  'admin',
  'talentos',
];

/** Perfilamiento: proceso + 'talentos' (solo lectura). */
export const ROLES_PERFILAMIENTO: RolUsuario[] = [...ROLES_PROCESO, 'talentos'];

/**
 * Detalle de la POSTULACIÓN: proceso + 'gh' (Diego/Paola) + 'documentacion'
 * (Carla), porque ahí SUBEN y verifican los documentos de la carpeta. Solo ven
 * los tabs de carpeta (la página filtra); no el pipeline.
 */
export const ROLES_POSTULACION_DETALLE: RolUsuario[] = [...ROLES_PROCESO, 'gh', 'documentacion'];

/** Roles acotados a la carpeta: ven la postulación solo para sus documentos. */
export const ROLES_SOLO_CARPETA: RolUsuario[] = ['gh', 'documentacion'];

// 'gh' incluido para que Diego (C&D) también pueda solicitar personal (reu Karen
// 04-ago). Crear una vacante no expone PII; el resto del acceso de GH no cambia.
export const ROLES_NUEVA_VACANTE: RolUsuario[] = ['lider', 'coordinador', 'admin', 'gh'];
/** "Mis vacantes" es del líder (filtra por lider_uid); admin/gh entran a revisar
 *  lo que ellos mismos solicitaron. */
export const ROLES_MIS_VACANTES: RolUsuario[] = ['lider', 'admin', 'gh'];
/**
 * "Vacantes de mis áreas" (gerente): solo-lectura, filtra por unidad_id ∈
 * unidades_gerente. Admin entra para revisar. La reu Karen jul-2026.
 */
export const ROLES_MIS_UNIDADES: RolUsuario[] = ['gerente', 'admin'];
export const ROLES_VACANTES_LISTA: RolUsuario[] = ['analista', 'coordinador', 'admin'];
export const ROLES_APROBACIONES: RolUsuario[] = ['gh', 'coordinador', 'admin'];
export const ROLES_EXAMENES: RolUsuario[] = ['gh', 'gestor', 'analista', 'coordinador', 'admin'];
export const ROLES_CARPETAS: RolUsuario[] = [
  'gh',
  'documentacion',
  'analista',
  'coordinador',
  'admin',
];
export const ROLES_TICKETS: RolUsuario[] = ['apoyo', 'analista', 'coordinador', 'admin'];
export const ROLES_POOL: RolUsuario[] = ['analista', 'coordinador', 'admin'];
export const ROLES_VACANTES_ABIERTAS: RolUsuario[] = [
  'analista',
  'coordinador',
  'apoyo',
  'admin',
  'talentos',
];

function tiene(lista: RolUsuario[], rol: RolUsuario | null | undefined): boolean {
  return !!rol && lista.includes(rol);
}

/** ¿Puede abrir el detalle de una vacante (/vacantes/:id)? */
export const puedeVerVacante = (rol: RolUsuario | null | undefined) =>
  tiene(ROLES_VACANTE_DETALLE, rol);

/**
 * ¿Es un gh (Diego, C&D) que además es el LÍDER SOLICITANTE de esta vacante?
 *
 * Por qué: Diego tiene rol 'gh' pero también crea vacantes para su área
 * (vacantes.lider_uid == su uid). La política de la reu 09-jul (GH no ve el
 * pipeline de vacantes ajenas) se mantiene; para las SUYAS, Karen decidió
 * (reu 16-sep, decisión 25-sep) que puede abrir el detalle, consultar la lista
 * de postulaciones y decidir la terna como cualquier líder. La propiedad se
 * valida con la vacante en mano, por eso recibe `liderUid` y `uid`.
 */
export const esGhDuenoDeVacante = (
  rol: RolUsuario | null | undefined,
  liderUid: string | null | undefined,
  uid: string | null | undefined,
) => rol === 'gh' && !!uid && liderUid === uid;

/**
 * ¿Puede ver ESTA vacante concreta? Es `puedeVerVacante` + la excepción del gh
 * dueño. Úsalo cuando ya tienes la vacante (lista de aprobaciones, tarjetas)
 * para decidir si pintas el link al detalle.
 */
export const puedeVerVacanteDe = (
  rol: RolUsuario | null | undefined,
  liderUid: string | null | undefined,
  uid: string | null | undefined,
) => puedeVerVacante(rol) || esGhDuenoDeVacante(rol, liderUid, uid);

/** ¿Puede abrir el detalle de una postulación (/postulaciones/:id)? */
export const puedeVerPostulacion = (rol: RolUsuario | null | undefined) =>
  tiene(ROLES_POSTULACION_DETALLE, rol);

/** ¿Puede abrir las pantallas del proceso (postulaciones de vacante, terna, etc.)? */
export const puedeVerProceso = (rol: RolUsuario | null | undefined) => tiene(ROLES_PROCESO, rol);

/** Rol acotado a carpeta (GH / Documentación): no ve el pipeline. */
export const esSoloCarpeta = (rol: RolUsuario | null | undefined) => tiene(ROLES_SOLO_CARPETA, rol);

export const puedeCrearVacante = (rol: RolUsuario | null | undefined) =>
  tiene(ROLES_NUEVA_VACANTE, rol);
export const puedeVerExamenes = (rol: RolUsuario | null | undefined) => tiene(ROLES_EXAMENES, rol);
export const puedeVerCarpetas = (rol: RolUsuario | null | undefined) => tiene(ROLES_CARPETAS, rol);
export const puedeVerTickets = (rol: RolUsuario | null | undefined) => tiene(ROLES_TICKETS, rol);
export const puedeVerAprobaciones = (rol: RolUsuario | null | undefined) =>
  tiene(ROLES_APROBACIONES, rol);

/**
 * ¿El rol puede ABRIR esta ruta concreta? Para gatear links genéricos (p.ej. los
 * CTAs del flujograma, que arman la ruta dinámicamente) sin duplicar listas.
 * Acepta rutas ya resueltas: '/vacantes/abc123/terna', '/tickets', etc.
 * El orden importa: las rutas fijas se evalúan antes que los patrones con :id.
 */
export function puedeAbrirRuta(rol: RolUsuario | null | undefined, ruta: string): boolean {
  if (!rol) return false;
  const r = (ruta.split('?')[0] || '').replace(/\/+$/, '') || '/';

  // Rutas fijas
  if (r === '/dashboard') return rol === 'coordinador' || rol === 'admin';
  if (r === '/seguimiento') return tiene(ROLES_SEGUIMIENTO, rol);
  if (r === '/mis-vacantes') return tiene(ROLES_MIS_VACANTES, rol);
  if (r === '/mis-unidades') return tiene(ROLES_MIS_UNIDADES, rol);
  if (r === '/vacantes/nueva') return tiene(ROLES_NUEVA_VACANTE, rol);
  if (r === '/vacantes') return tiene(ROLES_VACANTES_LISTA, rol);
  if (r === '/vacantes-abiertas') return tiene(ROLES_VACANTES_ABIERTAS, rol);
  if (r === '/pool') return tiene(ROLES_POOL, rol);
  if (r === '/carpetas') return tiene(ROLES_CARPETAS, rol);
  if (r === '/aprobaciones-aval') return tiene(ROLES_APROBACIONES, rol);
  if (r === '/examenes-medicos') return tiene(ROLES_EXAMENES, rol);
  if (r === '/tickets') return tiene(ROLES_TICKETS, rol);
  if (r.startsWith('/admin')) return rol === 'admin';

  // Vacante
  if (/^\/vacantes\/[^/]+\/perfilamiento$/.test(r)) return tiene(ROLES_PERFILAMIENTO, rol);
  if (/^\/vacantes\/[^/]+\/sourcing$/.test(r)) return tiene(ROLES_POOL, rol);
  // gh como líder solicitante (reu Karen 16-sep, decisión 25-sep): a nivel de
  // RUTA puede abrir el detalle, las postulaciones (consulta), la terna (decide)
  // y el concepto. Aquí no tenemos la vacante, así que la PROPIEDAD (lider_uid ==
  // uid) la valida cada página con su guard "Sin acceso"; quien pinte estos links
  // para gh debe hacerlo con la vacante en mano (`puedeVerVacanteDe`). El concepto
  // ya lo permitía App.tsx pero aquí se negaba: inconsistencia corregida. Van
  // ANTES del patrón genérico para NO abrirle publicación, perfilamiento ni sourcing.
  // La Solicitud de Integrantes (VIDA-F-01) la consulta de CUALQUIER vacante: es
  // la solicitud formal que Cultura y Desarrollo valida (decisión Karen 25-sep);
  // la página lo deja en solo lectura y las reglas le niegan el write.
  if (/^\/vacantes\/[^/]+\/(postulaciones|terna|concepto-atraccion|solicitud-integrante)$/.test(r))
    return tiene(ROLES_PROCESO, rol) || rol === 'gh';
  if (/^\/vacantes\/[^/]+\/.+$/.test(r)) return tiene(ROLES_PROCESO, rol);
  if (/^\/vacantes\/[^/]+$/.test(r)) return tiene(ROLES_VACANTE_DETALLE, rol) || rol === 'gh';

  // Postulación
  if (/^\/postulaciones\/[^/]+\/autorizacion-/.test(r)) return tiene(ROLES_POSTULACION_DETALLE, rol);
  if (/^\/postulaciones\/[^/]+\/.+$/.test(r)) return tiene(ROLES_PROCESO, rol);
  if (/^\/postulaciones\/[^/]+$/.test(r)) return tiene(ROLES_POSTULACION_DETALLE, rol);

  return true; // rutas públicas / no protegidas
}
