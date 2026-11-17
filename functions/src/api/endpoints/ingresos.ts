import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../../utils/admin';
import { cargarAmbitos } from '../ambitos';
import { LIMITE_PAGINA_DEFAULT, LIMITE_PAGINA_MAX } from '../catalogo';
import { conApiKey, type ContextoApi } from '../guardia';
import {
  ESTADOS_INGRESO_API,
  esEstadoIngresoApi,
  estadoIngresoApi,
  huellaIngreso,
  type EstadoIngresoApi,
} from '../ingresoApi';
import { error, ok, okLista } from '../respuestas';
import { PRENDAS, tallaApi } from '../../dotacion/tallas';

/**
 * GET /api/v1/ingresos · nuevos ingresos (reu DOTATRACK 06-oct-2026; ajustes
 * pedidos por DotaTrack el 17-nov).
 *
 * "Ingreso" = una persona que va a entrar o entró por Atracción. Estados (ver
 * `ingresoApi.ts`): `en_proceso` (en contratación con la dotación ya pedida),
 * `contratado` y `no_ingresa` (se había entregado y salió sin entrar).
 *
 * Dos formas de consultar (compatibles):
 *  - Clásica (la de octubre): `?desde=<ISO>` → solo `contratado`, por fecha de
 *    ingreso. Sigue igual para no romper a quien ya la usa.
 *  - Por cambios (17-nov): `?actualizado_desde=<ISO>` y/o `?estado=` → todos los
 *    estados, ordenados por `actualizado_en`. Es la recomendada: trae a la persona
 *    desde que se pide la dotación y vuelve a traerla cuando algo cambia.
 * `?solo_dotacion=true` filtra los cargos que requieren dotación; `?page`/`?limit`
 * paginan (tope 100). `?empresa=` lo resuelve la guardia (aquí llega `ctx.ambitos`).
 *
 * Las columnas salen ELEGIDAS una por una (nunca el doc completo): lo que alguien
 * agregue mañana a la postulación no sale por aquí sin que se decida.
 */

const COL_INGRESOS = 'api_ingresos';

type Doc = Record<string, unknown>;
interface ConFecha {
  data: Doc;
  /** Hora de la última escritura del doc (para nada más que diagnóstico). */
  upd: number;
}

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

async function getAllEnTandas(refs: DocumentReference[]): Promise<Map<string, ConFecha>> {
  const out = new Map<string, ConFecha>();
  for (let i = 0; i < refs.length; i += 100) {
    const snaps = await db.getAll(...refs.slice(i, i + 100));
    for (const s of snaps) {
      if (s.exists) out.set(s.id, { data: s.data() as Doc, upd: s.updateTime?.toMillis() ?? 0 });
    }
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
  vacantes: Map<string, ConFecha>;
  procesos: Map<string, ConFecha>;
  candidatos: Map<string, ConFecha>;
  cargos: Map<string, ConFecha>;
  datos: Map<string, Doc>;
  unidades: Map<string, ConFecha>;
  empresas: Map<string, string>;
}

/** ¿El cargo requiere dotación? Perfilamiento O lista de cargos del catálogo. */
function requiereDotacion(post: Doc, f: Fuentes): boolean {
  const proc = f.procesos.get(texto(post.proceso_id))?.data ?? {};
  const herr = ((proc.perfilamiento ?? {}) as Doc).herramientas_requeridas as Doc | undefined;
  if (herr?.dotacion === true) return true;
  const vac = f.vacantes.get(texto(post.vacante_id))?.data ?? {};
  const cargo = f.cargos.get(texto(vac.cargo_id))?.data ?? {};
  return ((cargo.herramientas_sugeridas ?? {}) as Doc).dotacion === true;
}

function armarItem(id: string, post: Doc, estado: EstadoIngresoApi, f: Fuentes): Doc {
  const vac = f.vacantes.get(texto(post.vacante_id))?.data ?? {};
  const cand = f.candidatos.get(texto(post.candidato_id))?.data ?? {};
  const datos = f.datos.get(id) ?? null;
  const unidad = f.unidades.get(texto(vac.unidad_id))?.data ?? {};

  const nombreCompleto = texto(post.candidato_nombre) || `${texto(cand.nombres)} ${texto(cand.apellidos)}`.trim();
  const partes = nombreCompleto.split(/\s+/).filter(Boolean);
  const nombres = texto(datos?.nombres) || texto(cand.nombres) || partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
  const apellidos =
    texto(datos?.apellidos) || texto(cand.apellidos) || partes.slice(Math.ceil(partes.length / 2)).join(' ');

  const empresaCodigo = texto(vac.empresa_codigo);
  const tallas: Record<string, string> | null = datos
    ? {
        ...Object.fromEntries(PRENDAS.map((p) => [p.api, tallaApi(datos[p.key])])),
        otros: tallaApi(datos.talla_otros),
      }
    : null;
  const faltantes = PRENDAS.filter((p) => !tallas || !tallas[p.api]).map((p) => p.api);

  return {
    id,
    estado,
    // Fecha de contratación en la plataforma: solo cuando ya está contratado.
    fecha_ingreso: estado === 'contratado' ? (fechaIngreso(post)?.toISOString() ?? null) : null,
    fecha_vinculacion: iso(post.fecha_vinculacion),
    // Primer día de trabajo previsto (lo registra la analista en contratación).
    fecha_ingreso_prevista: iso(post.fecha_ingreso_prevista),
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
      empresa: { codigo: empresaCodigo || null, nombre: f.empresas.get(empresaCodigo) ?? (texto(vac.empresa_nombre) || null) },
      sede: { codigo: texto(vac.sede_codigo) || null, nombre: texto(vac.sede_nombre) || null },
      unidad: {
        id: texto(vac.unidad_id) || null,
        nombre: texto(vac.unidad_nombre) || texto(unidad.nombre) || null,
        // Lo llena Atracción en Catálogos → Unidades con la tabla de contabilidad.
        centro_costos: texto(unidad.centro_costos) || null,
      },
    },
    dotacion: {
      requerida: requiereDotacion(post, f),
      solicitud_enviada_en: iso(post.solicitud_dotacion_enviada_en),
      // '' = falta; 'no_aplica' = esa prenda no se usa (A3).
      tallas,
      tallas_completas: faltantes.length === 0,
      prendas_faltantes: faltantes,
    },
  };
}

/** Carga TODAS las fuentes de una lista de postulaciones. */
async function cargarFuentes(items: { id: string; post: Doc }[]): Promise<Fuentes> {
  const ids = (campo: string) => [...new Set(items.map((x) => texto(x.post[campo])).filter(Boolean))];
  const vacantes = await getAllEnTandas(ids('vacante_id').map((id) => db.collection('vacantes').doc(id)));
  const deVacantes = (campo: string) =>
    [...new Set([...vacantes.values()].map((v) => texto(v.data[campo])).filter(Boolean))];
  const [procesos, candidatos, datos, ambitos, unidades, cargos] = await Promise.all([
    getAllEnTandas(ids('proceso_id').map((id) => db.collection('procesos').doc(id))),
    getAllEnTandas(ids('candidato_id').map((id) => db.collection('candidatos').doc(id))),
    datosBasicosPor(items.map((x) => x.id)),
    cargarAmbitos(),
    getAllEnTandas(deVacantes('unidad_id').map((id) => db.collection('unidades').doc(id))),
    getAllEnTandas(deVacantes('cargo_id').map((id) => db.collection('cargos_catalogo').doc(id))),
  ]);
  return {
    vacantes,
    procesos,
    candidatos,
    cargos,
    datos,
    unidades,
    empresas: new Map(ambitos.map((a) => [a.id, a.nombre])),
  };
}

interface Ingreso {
  id: string;
  post: Doc;
  estado: EstadoIngresoApi;
  item: Doc;
  actualizado: Date;
}

/**
 * Arma los ingresos de la lista (ya filtrada por ámbito) y sella `actualizado_en`
 * donde la huella cambió. Escribe `api_ingresos` en lote; si falla, la respuesta
 * sale igual (el próximo llamado vuelve a detectar el cambio).
 */
async function materializar(
  candidatos: { id: string; post: Doc }[],
  previos: Map<string, Doc>,
  f: Fuentes,
  /** Solo se recuerda/entrega lo que esta consulta podía devolver. */
  visible: (estado: EstadoIngresoApi, item: Doc) => boolean = () => true,
): Promise<Ingreso[]> {
  const ahora = Date.now();
  const out: Ingreso[] = [];
  const escrituras: { id: string; data: Doc }[] = [];
  for (const { id, post } of [...candidatos].sort((a, b) => a.id.localeCompare(b.id))) {
    const previo = previos.get(id);
    const previoEstado = esEstadoIngresoApi(previo?.estado) ? previo.estado : null;
    const estado = estadoIngresoApi(post, previoEstado);
    if (!estado) continue;
    const item = armarItem(id, post, estado, f);
    if (!visible(estado, item)) continue;
    const huella = huellaIngreso(item);
    let actualizado = fecha(previo?.actualizado_en);
    if (!previo || previo.huella !== huella || !actualizado) {
      // Milisegundos distintos por ingreso: el orden por actualizado_en es estable.
      actualizado = new Date(ahora + escrituras.length);
      escrituras.push({
        id,
        data: {
          postulacion_id: id,
          estado,
          huella,
          actualizado_en: Timestamp.fromDate(actualizado),
          expuesto_en: previo?.expuesto_en ?? Timestamp.fromMillis(ahora),
        },
      });
    }
    out.push({ id, post, estado, item: { ...item, actualizado_en: actualizado.toISOString() }, actualizado });
  }
  if (escrituras.length) {
    try {
      for (let i = 0; i < escrituras.length; i += 400) {
        const batch = db.batch();
        for (const w of escrituras.slice(i, i + 400)) {
          batch.set(db.collection(COL_INGRESOS).doc(w.id), w.data, { merge: true });
        }
        await batch.commit();
      }
    } catch (e) {
      logger.error('[api] no se pudo guardar la huella de los ingresos', {
        n: escrituras.length,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

function parsearEntero(v: unknown, def: number): number | null {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function parsearFecha(nombre: string, raw: string): Date | string {
  const d = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(d.getTime())) {
    return `"${nombre}" debe ser una fecha ISO 8601 (p. ej. 2026-10-01 o 2026-10-01T00:00:00-05:00); llegó "${raw}".`;
  }
  return d;
}

export const listarIngresos = conApiKey({ permiso: 'ingresos:read' }, async ({ req, res, ctx }) => {
  // Parámetros: se rechazan, no se ignoran.
  const desdeRaw = texto(req.query.desde);
  const actDesdeRaw = texto(req.query.actualizado_desde);
  const estadoRaw = texto(req.query.estado);
  if (desdeRaw && actDesdeRaw) {
    error(res, 'parametro_invalido', 'Usa "desde" (por fecha de ingreso) o "actualizado_desde" (por cambios), no los dos.');
    return;
  }
  let desde: Date | null = null;
  if (desdeRaw) {
    const d = parsearFecha('desde', desdeRaw);
    if (typeof d === 'string') {
      error(res, 'parametro_invalido', d);
      return;
    }
    desde = d;
  }
  let actDesde: Date | null = null;
  if (actDesdeRaw) {
    const d = parsearFecha('actualizado_desde', actDesdeRaw);
    if (typeof d === 'string') {
      error(res, 'parametro_invalido', d);
      return;
    }
    actDesde = d;
  }
  let estados: EstadoIngresoApi[] | null = null;
  if (estadoRaw) {
    const lista = estadoRaw.split(',').map((x) => x.trim()).filter(Boolean);
    const malos = lista.filter((x) => !esEstadoIngresoApi(x));
    if (!lista.length || malos.length) {
      error(res, 'parametro_invalido', `"estado" acepta ${ESTADOS_INGRESO_API.join(', ')} (separados por coma); llegó "${estadoRaw}".`);
      return;
    }
    estados = lista as EstadoIngresoApi[];
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
  // Modo por cambios: lo pidieron con actualizado_desde o con estado.
  const porCambios = !!actDesde || !!estados;
  const estadosPedidos: EstadoIngresoApi[] = estados ?? (porCambios ? [...ESTADOS_INGRESO_API] : ['contratado']);

  // Universo: contratados + en contratación + lo que ya se entregó alguna vez
  // (sin orderBy: no exige índice; el volumen es de decenas).
  const [contr, enCont, previosSnap] = await Promise.all([
    db.collection('postulaciones').where('estado', '==', 'contratado').limit(5000).get(),
    db.collection('postulaciones').where('estado', '==', 'en_contratacion').limit(5000).get(),
    db.collection(COL_INGRESOS).limit(5000).get(),
  ]);
  const posts = new Map<string, Doc>();
  for (const d of [...contr.docs, ...enCont.docs]) posts.set(d.id, d.data() as Doc);
  const previos = new Map(previosSnap.docs.map((d) => [d.id, d.data() as Doc]));
  const faltan = [...previos.keys()].filter((id) => !posts.has(id));
  const extra = await getAllEnTandas(faltan.map((id) => db.collection('postulaciones').doc(id)));
  for (const [id, v] of extra) posts.set(id, v.data);

  let items = [...posts.entries()].map(([id, post]) => ({ id, post }));
  const fuentes = await cargarFuentes(items);
  const permitidas = new Set(ctx.ambitos);
  items = items.filter((x) => {
    const vac = fuentes.vacantes.get(texto(x.post.vacante_id))?.data;
    // Sin vacante no se puede verificar el ámbito: no sale.
    return !!vac && permitidas.has(texto(vac.empresa_codigo));
  });

  let ingresos = await materializar(
    items,
    previos,
    fuentes,
    (estado, item) =>
      estadosPedidos.includes(estado) && (!soloDotacion || (item.dotacion as Doc).requerida === true),
  );
  if (desde) {
    const desdeMs = desde.getTime();
    ingresos = ingresos.filter((x) => {
      const fi = fechaIngreso(x.post);
      return !!fi && fi.getTime() >= desdeMs;
    });
  }
  if (actDesde) {
    const ms = actDesde.getTime();
    ingresos = ingresos.filter((x) => x.actualizado.getTime() >= ms);
  }

  ingresos.sort((a, b) => {
    if (porCambios) return a.actualizado.getTime() - b.actualizado.getTime() || a.id.localeCompare(b.id);
    const fa = fechaIngreso(a.post)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const fb = fechaIngreso(b.post)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return fa - fb || a.id.localeCompare(b.id);
  });

  const total = ingresos.length;
  const pagina = ingresos.slice((page - 1) * limit, page * limit);
  okLista(
    res,
    pagina.map((x) => x.item),
    { page, limit, total },
  );
});

export const obtenerIngreso = conApiKey({ permiso: 'ingresos:read' }, async ({ res, ctx, params }) => {
  const id = texto(params.id);
  const noEncontrado = () => error(res, 'no_encontrado', 'No hay un ingreso con ese id.');
  if (!id || id.includes('/')) {
    noEncontrado();
    return;
  }
  const [snap, previoSnap] = await Promise.all([
    db.collection('postulaciones').doc(id).get(),
    db.collection(COL_INGRESOS).doc(id).get(),
  ]);
  const post = snap.exists ? (snap.data() as Doc) : null;
  if (!post) {
    noEncontrado();
    return;
  }
  const fuentes = await cargarFuentes([{ id, post }]);
  const vac = fuentes.vacantes.get(texto(post.vacante_id))?.data;
  // De otra empresa → 404 (un 403 confirmaría que el id existe).
  if (!vac || !ctx.ambitos.includes(texto(vac.empresa_codigo))) {
    noEncontrado();
    return;
  }
  const previos = new Map<string, Doc>();
  if (previoSnap.exists) previos.set(id, previoSnap.data() as Doc);
  const [ingreso] = await materializar([{ id, post }], previos, fuentes);
  if (!ingreso) {
    noEncontrado();
    return;
  }
  ok(res, ingreso.item);
});

export type { ContextoApi };
