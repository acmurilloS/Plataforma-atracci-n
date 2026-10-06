import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../../utils/admin';
import { cargarAmbitos } from '../ambitos';
import { LIMITE_PAGINA_DEFAULT, LIMITE_PAGINA_MAX } from '../catalogo';
import { conApiKey, type ContextoApi } from '../guardia';
import { error, ok, okLista } from '../respuestas';

/**
 * GET /api/v1/ingresos · nuevos ingresos (reu DOTATRACK 06-oct-2026).
 *
 * "Ingreso" = postulación en estado `contratado` (Gestión Humana aprobó la
 * carpeta). Lo que DOTATRACK necesita para la dotación: identificación, cargo,
 * empresa/sede/unidad (+ centro de costos si el catálogo lo tiene), fechas, si
 * el cargo requiere dotación y las tallas que la persona registró en el DGH-F-05.
 *
 * - `?desde=<ISO>`: solo ingresos con fecha de contratación ≥ desde. Una fecha
 *   ilegible se RECHAZA (400), no se ignora: pedir "desde ayer" y recibir todo
 *   reprocesaría lo mismo una y otra vez en silencio.
 * - Orden ascendente por fecha de ingreso, para procesar en orden y guardar la
 *   última como marca.
 * - `?empresa=` lo resuelve la guardia: aquí solo llega `ctx.ambitos`.
 * - `?page` / `?limit` (tope duro 100). `?solo_dotacion=true` filtra los cargos
 *   que requieren dotación.
 *
 * Las columnas salen ELEGIDAS una por una (nunca el doc completo): lo que alguien
 * agregue mañana a la postulación no sale por aquí sin que se decida.
 */

const TALLAS = ['calzado', 'pantalon', 'chaleco', 'guantes', 'overol', 'camisa_blusa', 'otros'] as const;

type Doc = Record<string, unknown>;

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

function fecha(v: unknown): Date | null {
  const d = (v as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

function iso(v: unknown): string | null {
  const d = fecha(v);
  return d ? d.toISOString() : null;
}

/** Fecha de ingreso: la marca de contratación; de respaldo, vinculación o la última transición. */
function fechaIngreso(post: Doc): Date | null {
  const marcas = (post.marcas ?? {}) as Doc;
  return fecha(marcas.contratado_en) ?? fecha(post.fecha_vinculacion) ?? fecha(post.ultima_transicion_estado);
}

async function getAllEnTandas(refs: DocumentReference[]): Promise<Map<string, Doc>> {
  const out = new Map<string, Doc>();
  for (let i = 0; i < refs.length; i += 100) {
    const snaps = await db.getAll(...refs.slice(i, i + 100));
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() as Doc);
  }
  return out;
}

/** datos_basicos_integrante por postulación (where in, tandas de 30). */
async function datosBasicosPor(postIds: string[]): Promise<Map<string, Doc>> {
  const out = new Map<string, Doc>();
  for (let i = 0; i < postIds.length; i += 30) {
    const snap = await db
      .collection('datos_basicos_integrante')
      .where('postulacion_id', 'in', postIds.slice(i, i + 30))
      .get();
    for (const d of snap.docs) {
      const data = d.data() as Doc;
      const pid = texto(data.postulacion_id);
      if (pid && !out.has(pid)) out.set(pid, data);
    }
  }
  return out;
}

interface Fuentes {
  vacantes: Map<string, Doc>;
  procesos: Map<string, Doc>;
  candidatos: Map<string, Doc>;
  datos: Map<string, Doc>;
  unidades: Map<string, Doc>;
  empresas: Map<string, string>;
}

function armarItem(id: string, post: Doc, f: Fuentes): Doc {
  const vac = f.vacantes.get(texto(post.vacante_id)) ?? {};
  const proc = f.procesos.get(texto(post.proceso_id)) ?? {};
  const cand = f.candidatos.get(texto(post.candidato_id)) ?? {};
  const datos = f.datos.get(id) ?? null;
  const unidad = f.unidades.get(texto(vac.unidad_id)) ?? {};
  const perf = (proc.perfilamiento ?? {}) as Doc;
  const herr = (perf.herramientas_requeridas ?? {}) as Doc;

  const nombreCompleto = texto(post.candidato_nombre) || `${texto(cand.nombres)} ${texto(cand.apellidos)}`.trim();
  const partes = nombreCompleto.split(/\s+/).filter(Boolean);
  const nombres = texto(datos?.nombres) || texto(cand.nombres) || partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
  const apellidos =
    texto(datos?.apellidos) || texto(cand.apellidos) || partes.slice(Math.ceil(partes.length / 2)).join(' ');

  const empresaCodigo = texto(vac.empresa_codigo);
  const tallas: Record<string, string> | null = datos
    ? Object.fromEntries(TALLAS.map((t) => [t, texto(datos[`talla_${t}`])]))
    : null;

  return {
    id,
    estado: 'contratado',
    fecha_ingreso: fechaIngreso(post)?.toISOString() ?? null,
    fecha_vinculacion: iso(post.fecha_vinculacion),
    movimiento_interno: !!post.movimiento_interno,
    persona: {
      nombre_completo: nombreCompleto || `${nombres} ${apellidos}`.trim(),
      nombres,
      apellidos,
      documento_tipo: texto(datos?.documento_tipo) || texto(cand.documento_tipo) || null,
      documento_numero: texto(datos?.documento_numero) || texto(cand.documento_numero) || null,
      genero: texto(datos?.genero) || null,
      correo: texto(datos?.correo_electronico) || texto(post.candidato_email) || texto(cand.email) || null,
      celular: texto(datos?.celular) || texto(post.candidato_telefono) || texto(cand.telefono) || null,
    },
    cargo: {
      id: texto(vac.cargo_id) || null,
      nombre: texto(post.cargo_nombre) || texto(vac.cargo_nombre) || null,
    },
    vacante: {
      id: texto(post.vacante_id) || null,
      consecutivo: texto(post.vacante_consecutivo) || texto(vac.consecutivo) || null,
      empresa: { codigo: empresaCodigo || null, nombre: f.empresas.get(empresaCodigo) ?? texto(vac.empresa_nombre) ?? null },
      sede: { codigo: texto(vac.sede_codigo) || null, nombre: texto(vac.sede_nombre) || null },
      unidad: {
        id: texto(vac.unidad_id) || null,
        nombre: texto(vac.unidad_nombre) || texto(unidad.nombre) || null,
        // Lo llena Atracción en Catálogos → Unidades con la tabla de contabilidad;
        // mientras esté vacío DOTATRACK cruza por la unidad.
        centro_costos: texto(unidad.centro_costos) || null,
      },
    },
    dotacion: {
      requerida: herr.dotacion === true,
      solicitud_enviada_en: iso(post.solicitud_dotacion_enviada_en),
      tallas,
    },
  };
}

/** Carga TODAS las fuentes de una lista de postulaciones contratadas. */
async function cargarFuentes(items: { id: string; post: Doc }[]): Promise<Fuentes> {
  const ids = (campo: string) => [...new Set(items.map((x) => texto(x.post[campo])).filter(Boolean))];
  const vacantes = await getAllEnTandas(ids('vacante_id').map((id) => db.collection('vacantes').doc(id)));
  const [procesos, candidatos, datos, ambitos] = await Promise.all([
    getAllEnTandas(ids('proceso_id').map((id) => db.collection('procesos').doc(id))),
    getAllEnTandas(ids('candidato_id').map((id) => db.collection('candidatos').doc(id))),
    datosBasicosPor(items.map((x) => x.id)),
    cargarAmbitos(),
  ]);
  const unidadIds = [...new Set([...vacantes.values()].map((v) => texto(v.unidad_id)).filter(Boolean))];
  const unidades = await getAllEnTandas(unidadIds.map((id) => db.collection('unidades').doc(id)));
  return {
    vacantes,
    procesos,
    candidatos,
    datos,
    unidades,
    empresas: new Map(ambitos.map((a) => [a.id, a.nombre])),
  };
}

function parsearEntero(v: unknown, def: number): number | null {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export const listarIngresos = conApiKey({ permiso: 'ingresos:read' }, async ({ req, res, ctx }) => {
  // Parámetros: se rechazan, no se ignoran.
  const desdeRaw = texto(req.query.desde);
  let desde: Date | null = null;
  if (desdeRaw) {
    const d = new Date(desdeRaw);
    if (!/^\d{4}-\d{2}-\d{2}/.test(desdeRaw) || Number.isNaN(d.getTime())) {
      error(res, 'parametro_invalido', `"desde" debe ser una fecha ISO 8601 (p. ej. 2026-10-01 o 2026-10-01T00:00:00-05:00); llegó "${desdeRaw}".`);
      return;
    }
    desde = d;
  }
  const page = parsearEntero(req.query.page, 1);
  if (page === null || page < 1) {
    error(res, 'parametro_invalido', '"page" debe ser un entero ≥ 1.');
    return;
  }
  const limit = parsearEntero(req.query.limit, LIMITE_PAGINA_DEFAULT);
  if (limit === null || limit < 1 || limit > LIMITE_PAGINA_MAX) {
    error(res, 'parametro_invalido', `"limit" debe ser un entero entre 1 y ${LIMITE_PAGINA_MAX}.`);
    return;
  }
  const soloDotacionRaw = texto(req.query.solo_dotacion).toLowerCase();
  if (soloDotacionRaw && !['true', 'false'].includes(soloDotacionRaw)) {
    error(res, 'parametro_invalido', '"solo_dotacion" debe ser true o false.');
    return;
  }
  const soloDotacion = soloDotacionRaw === 'true';

  // Contratados (sin orderBy: no exige índice; el volumen es de decenas).
  const snap = await db.collection('postulaciones').where('estado', '==', 'contratado').limit(5000).get();
  let items = snap.docs.map((d) => ({ id: d.id, post: d.data() as Doc }));

  // Fuentes para filtrar por ámbito (vacante) y por dotación (proceso).
  const fuentes = await cargarFuentes(items);
  const permitidas = new Set(ctx.ambitos);
  items = items.filter((x) => {
    const vac = fuentes.vacantes.get(texto(x.post.vacante_id));
    // Sin vacante no se puede verificar el ámbito: no sale.
    return !!vac && permitidas.has(texto(vac.empresa_codigo));
  });
  if (desde) {
    const desdeMs = desde.getTime();
    items = items.filter((x) => {
      const f = fechaIngreso(x.post);
      return !!f && f.getTime() >= desdeMs;
    });
  }
  if (soloDotacion) {
    items = items.filter((x) => {
      const proc = fuentes.procesos.get(texto(x.post.proceso_id)) ?? {};
      const herr = ((proc.perfilamiento ?? {}) as Doc).herramientas_requeridas as Doc | undefined;
      return herr?.dotacion === true;
    });
  }
  items.sort((a, b) => {
    const fa = fechaIngreso(a.post)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const fb = fechaIngreso(b.post)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return fa - fb || a.id.localeCompare(b.id);
  });

  const total = items.length;
  const pagina = items.slice((page - 1) * limit, page * limit);
  okLista(
    res,
    pagina.map((x) => armarItem(x.id, x.post, fuentes)),
    { page, limit, total },
  );
});

export const obtenerIngreso = conApiKey({ permiso: 'ingresos:read' }, async ({ res, ctx, params }) => {
  const id = texto(params.id);
  const snap: DocumentSnapshot = await db.collection('postulaciones').doc(id).get();
  const post = snap.exists ? (snap.data() as Doc) : null;
  // No contratado o de otra empresa → 404 (un 403 confirmaría que el id existe).
  if (!post || texto(post.estado) !== 'contratado') {
    error(res, 'no_encontrado', 'No hay un ingreso con ese id.');
    return;
  }
  const fuentes = await cargarFuentes([{ id, post }]);
  const vac = fuentes.vacantes.get(texto(post.vacante_id));
  if (!vac || !ctx.ambitos.includes(texto(vac.empresa_codigo))) {
    error(res, 'no_encontrado', 'No hay un ingreso con ese id.');
    return;
  }
  ok(res, armarItem(id, post, fuentes));
});

export type { ContextoApi };
