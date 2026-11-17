import { db } from '../../utils/admin';
import { cargarAmbitos } from '../ambitos';
import { conApiKey } from '../guardia';
import { okLista } from '../respuestas';

/**
 * Catálogos para emparejar por CÓDIGO y no por nombre (DotaTrack 17-nov, A5):
 * la sede llegaba como "Cali" o "Mosquera (matriz)" y el cargo como texto, y
 * DotaTrack los cruzaba por nombre con sus listas.
 *
 *  - GET /api/v1/sedes  → las sedes de las empresas de la llave, con el código que
 *    trae cada ingreso en `vacante.sede.codigo` y la sede de ENTREGA de dotación
 *    (una de las sedes oficiales; la dotación va a la sede de entrega, no a la
 *    ciudad de trabajo). `sede_entrega` es null mientras Atracción no la cargue.
 *  - GET /api/v1/cargos → el catálogo de cargos (global), con el `id` que trae cada
 *    ingreso en `cargo.id` y si el cargo lleva dotación según la lista de Cultura y
 *    Desarrollo (`dotacion`).
 *
 * Mismo permiso que los ingresos (`ingresos:read`): sin estas listas los ingresos
 * no se pueden interpretar. Columnas elegidas una por una, como en los ingresos.
 */

type Doc = Record<string, unknown>;

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

export const listarSedes = conApiKey({ permiso: 'ingresos:read' }, async ({ res, ctx }) => {
  const [snap, ambitos] = await Promise.all([db.collection('sedes').get(), cargarAmbitos()]);
  const empresas = new Map(ambitos.map((a) => [a.id, a.nombre]));
  const permitidas = new Set(ctx.ambitos);
  const data = snap.docs
    .map((d) => d.data() as Doc)
    .filter((s) => permitidas.has(texto(s.empresa_codigo)))
    .map((s) => ({
      codigo: texto(s.codigo) || null,
      nombre: texto(s.nombre) || null,
      ciudad: texto(s.ciudad) || null,
      empresa: { codigo: texto(s.empresa_codigo) || null, nombre: empresas.get(texto(s.empresa_codigo)) ?? null },
      activo: s.activo !== false,
      sede_entrega: texto(s.sede_entrega) || null,
    }))
    .sort((a, b) => `${a.empresa.codigo}${a.codigo}`.localeCompare(`${b.empresa.codigo}${b.codigo}`));
  okLista(res, data, { page: 1, limit: data.length, total: data.length });
});

export const listarCargos = conApiKey({ permiso: 'ingresos:read' }, async ({ res }) => {
  const snap = await db.collection('cargos_catalogo').get();
  const data = snap.docs
    .map((d) => {
      const c = d.data() as Doc;
      return {
        id: d.id,
        nombre: texto(c.nombre) || null,
        activo: c.activo !== false,
        dotacion: ((c.herramientas_sugeridas ?? {}) as Doc).dotacion === true,
      };
    })
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  okLista(res, data, { page: 1, limit: data.length, total: data.length });
});
