import { PERMISOS } from '../catalogo';
import { conApiKey } from '../guardia';
import { ok } from '../respuestas';

/**
 * GET /api/v1/me · autodiagnóstico. NO exige ningún permiso: cualquier llave
 * válida puede preguntar qué es (pedir un permiso aquí sería un acertijo: si
 * la llave no lo tiene, el 403 no diría si el problema es la llave o el permiso).
 *
 * Devuelve los ámbitos con id Y nombre: el id es lo que va en `?empresa=`.
 * No toca ninguna colección de negocio.
 */
export const me = conApiKey({ permiso: null }, async ({ res, ctx }) => {
  ok(res, {
    integracion: ctx.integracion,
    llave: {
      id: ctx.llave.id,
      prefijo: ctx.llave.prefijo,
      nombre: ctx.llave.nombre,
      expira_en: ctx.llave.expiraEn ? ctx.llave.expiraEn.toISOString() : null,
      tope_por_min: ctx.llave.topePorMin,
    },
    permisos: PERMISOS.filter((p) => ctx.llave.permisos.includes(p.id)).map((p) => ({
      id: p.id,
      nombre: p.nombre,
    })),
    ambitos: ctx.llave.ambitosAutorizados,
    limite: {
      tope_por_min: ctx.llave.topePorMin,
      restantes_en_este_minuto: ctx.limite.restantes,
      degradado: ctx.limite.degradado,
    },
  });
});
