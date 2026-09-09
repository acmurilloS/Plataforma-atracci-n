import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { aZonaBogota, diasHabilesEntre, formatearFecha, TZ_BOGOTA } from './fechas';
import type { PostulacionDoc, VacanteDoc } from '../schemas';

/**
 * Lógica de reportes de vacantes (base detallada + resumen mensual) con tiempos
 * en DÍAS HÁBILES y semáforo de ANS. Funciones puras: reciben las vacantes, las
 * postulaciones, el set de festivos colombianos y "hoy" → devuelven filas listas
 * para exportar a Excel (SheetJS) o mostrar en el dashboard.
 *
 * Reglas de negocio (Karen):
 *  - ANS de terna = 15 días hábiles (meta 10). Semáforo: verde ≤10 / amarillo ≤15 / rojo >15.
 *  - "Apertura" del proceso = `creado_en` (la solicitud del líder; no existe `publicada_en`).
 *  - Días hábiles excluyen fines de semana + festivos (función `festivos`).
 */

export const ANS_TERNA_META = 10;
export const ANS_TERNA_LIMITE = 15;

/** Estados que representan una vacante ya terminada (sale de "activas"). */
export const ESTADOS_CERRADOS = ['cerrada', 'desierta', 'cancelada'] as const;

export function esVacanteCerrada(estado: string): boolean {
  return (ESTADOS_CERRADOS as readonly string[]).includes(estado);
}

/** Convierte un Timestamp de Firestore (o nulo/pendiente) a Date o null seguro. */
function aDate(ts: unknown): Date | null {
  if (!ts) return null;
  const d = (ts as { toDate?: () => Date }).toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Apertura EFECTIVA del proceso: la `fecha_activacion` que fija Coordinación
 * (procesos viejos migrados de la base anterior, reu Karen 19-ago) si existe; si
 * no, la fecha de creación en el aplicativo. Todos los días del proceso se cuentan
 * desde aquí para que la trazabilidad de los procesos migrados sea correcta.
 */
export function aperturaVacante(v: VacanteDoc): Date | null {
  return aDate(v.fecha_activacion) ?? aDate(v.creado_en);
}

// ─────────────────────────────────────────────────────────────────────────────
// Conteos por vacante (postulados / en terna / contratado) desde postulaciones
// ─────────────────────────────────────────────────────────────────────────────

export interface ConteoVacante {
  postulados: number;
  enTerna: number;
  contratado: boolean;
  /** Fecha real de ingreso del contratado (reu 18-ago), formateada; '' si no hay. */
  fechaVinculacion: string;
}

/** No cuentan como "postulado" real los perfiles aún sin contacto humano. */
const NO_POSTULADO = new Set(['sourceado_por_ia']);

/**
 * Fechas del proceso que NO viven en la vacante sino en otras colecciones
 * (pedido Karen 09-sep para la base del dashboard). Se agrupan por vacante.
 */
export interface FechasProcesoVacante {
  /** Envío del INFORME del candidato al líder (paso 12, colección `informes`). */
  informeLider: Date | null;
  /** Entrevista del LÍDER con el candidato (entrevistas con `tipo: 'lider'`). */
  entrevistaLider: Date | null;
  /** Envío de la orden de exámenes médicos al candidato. */
  examenEnviado: Date | null;
}

/** Informe del candidato, en lo mínimo que necesita el reporte. */
export interface InformeMin {
  vacante_id?: string;
  postulacion_id?: string;
  enviado_al_lider_en?: unknown;
}

/** Entrevista, en lo mínimo que necesita el reporte. */
export interface EntrevistaMin {
  postulacion_id?: string;
  tipo?: string;
  programada_para?: unknown;
}

/** Examen médico, en lo mínimo que necesita el reporte. */
export interface ExamenMin {
  postulacion_id?: string;
  vacante_id?: string;
  enviada_al_candidato_en?: unknown;
}

/**
 * Agrupa por vacante la fecha de entrevista del líder y la de envío de exámenes.
 * Las entrevistas NO traen `vacante_id`, así que se resuelven vía la postulación.
 * Si hay varias (una por candidato de la terna) se toma la MÁS ANTIGUA: es cuando
 * arrancó esa etapa para la vacante.
 */
export function agruparFechasProceso(
  postulaciones: PostulacionDoc[],
  entrevistas: EntrevistaMin[],
  examenes: ExamenMin[],
  informes: InformeMin[] = [],
): Map<string, FechasProcesoVacante> {
  const vacantePorPostulacion = new Map<string, string>();
  for (const p of postulaciones) vacantePorPostulacion.set(p.id, p.vacante_id);

  const mapa = new Map<string, FechasProcesoVacante>();
  const filaDe = (vacanteId: string): FechasProcesoVacante => {
    let f = mapa.get(vacanteId);
    if (!f) {
      f = { informeLider: null, entrevistaLider: null, examenEnviado: null };
      mapa.set(vacanteId, f);
    }
    return f;
  };
  const masAntigua = (actual: Date | null, nueva: Date) =>
    !actual || nueva.getTime() < actual.getTime() ? nueva : actual;

  for (const inf of informes) {
    const vacanteId =
      String(inf.vacante_id ?? '') ||
      vacantePorPostulacion.get(String(inf.postulacion_id ?? '')) ||
      '';
    if (!vacanteId) continue;
    const f = aDate(inf.enviado_al_lider_en);
    if (!f) continue;
    const fila = filaDe(vacanteId);
    fila.informeLider = masAntigua(fila.informeLider, f);
  }

  for (const e of entrevistas) {
    if (e.tipo !== 'lider') continue;
    const vacanteId = vacantePorPostulacion.get(String(e.postulacion_id ?? ''));
    if (!vacanteId) continue;
    const f = aDate(e.programada_para);
    if (!f) continue;
    const fila = filaDe(vacanteId);
    fila.entrevistaLider = masAntigua(fila.entrevistaLider, f);
  }

  for (const x of examenes) {
    const vacanteId =
      String(x.vacante_id ?? '') || vacantePorPostulacion.get(String(x.postulacion_id ?? '')) || '';
    if (!vacanteId) continue;
    const f = aDate(x.enviada_al_candidato_en);
    if (!f) continue;
    const fila = filaDe(vacanteId);
    fila.examenEnviado = masAntigua(fila.examenEnviado, f);
  }

  return mapa;
}

/** Agrupa las postulaciones por vacante y resume sus conteos. */
export function agruparPostulaciones(postulaciones: PostulacionDoc[]): Map<string, ConteoVacante> {
  const mapa = new Map<string, ConteoVacante>();
  for (const p of postulaciones) {
    const vid = p.vacante_id;
    if (!vid) continue;
    const c = mapa.get(vid) ?? { postulados: 0, enTerna: 0, contratado: false, fechaVinculacion: '' };
    if (!NO_POSTULADO.has(p.estado)) c.postulados += 1;
    if (p.estado === 'en_terna') c.enTerna += 1;
    if (p.estado === 'contratado') {
      c.contratado = true;
      const fv = aDate(p.fecha_vinculacion);
      if (fv) c.fechaVinculacion = formatearFecha(fv);
    }
    mapa.set(vid, c);
  }
  return mapa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculos de tiempo / ANS por vacante
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Días hábiles transcurridos de la vacante: de la apertura a HOY si está activa,
 * o a la fecha de cierre si ya cerró. Null si no tiene fecha de apertura.
 */
export function diasTranscurridos(
  v: VacanteDoc,
  festivos: Set<string>,
  hoy: Date,
): number | null {
  const apertura = aperturaVacante(v);
  if (!apertura) return null;
  const cierre = aDate(v.cerrada_en);
  const fin = esVacanteCerrada(v.estado) && cierre ? cierre : hoy;
  return diasHabilesEntre(apertura, fin, festivos);
}

/** Días hábiles de la apertura a la terna enviada (el ANS). Null si no hay terna. */
export function diasHabilesATerna(v: VacanteDoc, festivos: Set<string>): number | null {
  const apertura = aperturaVacante(v);
  const terna = aDate(v.terna_enviada_en);
  if (!apertura || !terna) return null;
  return diasHabilesEntre(apertura, terna, festivos);
}

/**
 * Tiempo PROMEDIO (días hábiles) por etapa/actor del proceso, para ver cuellos de
 * botella (reu 18-ago). Cada tramo promedia solo las vacantes que tienen los DOS
 * timestamps (excluye las que no llegaron a esa etapa). Ordenado de mayor a menor
 * para resaltar dónde se demora más.
 */
export interface TramoTiempo {
  etiqueta: string;
  actor: string;
  promedio: number;
  n: number;
}
export function tiemposPorEtapa(vacantes: VacanteDoc[], festivos: Set<string>): TramoTiempo[] {
  const promedioTramo = (ini: (v: VacanteDoc) => unknown, fin: (v: VacanteDoc) => unknown) => {
    const dias: number[] = [];
    for (const v of vacantes) {
      const a = aDate(ini(v));
      const b = aDate(fin(v));
      if (a && b && b.getTime() >= a.getTime()) dias.push(diasHabilesEntre(a, b, festivos));
    }
    const n = dias.length;
    return { promedio: n ? Math.round((dias.reduce((s, d) => s + d, 0) / n) * 10) / 10 : 0, n };
  };
  const defs: Array<{
    etiqueta: string;
    actor: string;
    ini: (v: VacanteDoc) => unknown;
    fin: (v: VacanteDoc) => unknown;
  }> = [
    { etiqueta: 'Aprobación del aval', actor: 'GH / Cultura', ini: (v) => v.creado_en, fin: (v) => v.aval_aprobado_en },
    { etiqueta: 'Asignación de analista', actor: 'Coordinación', ini: (v) => v.aval_aprobado_en, fin: (v) => v.analista_asignado_en },
    { etiqueta: 'Reclutamiento → terna', actor: 'Analista', ini: (v) => v.analista_asignado_en, fin: (v) => v.terna_enviada_en },
    { etiqueta: 'Decisión de la terna', actor: 'Líder', ini: (v) => v.terna_enviada_en, fin: (v) => v.terna_respondida_en },
    { etiqueta: 'Proceso completo', actor: 'Extremo a extremo', ini: (v) => v.creado_en, fin: (v) => v.cerrada_en },
  ];
  return defs
    .map((d) => ({ etiqueta: d.etiqueta, actor: d.actor, ...promedioTramo(d.ini, d.fin) }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.promedio - a.promedio);
}

/** Texto de cumplimiento del ANS de terna para la base. */
export function cumplimientoANS(
  diasATerna: number | null,
  estado: string,
): string {
  if (diasATerna === null) {
    return esVacanteCerrada(estado) ? '— (sin terna)' : 'En curso';
  }
  if (diasATerna <= ANS_TERNA_META) return 'Meta (≤10) ✓';
  if (diasATerna <= ANS_TERNA_LIMITE) return 'Cumple (≤15)';
  return 'Incumple (>15)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Base de vacantes (una fila por vacante)
// ─────────────────────────────────────────────────────────────────────────────

export type FilaExcel = Record<string, string | number>;

const TIPO_SOLICITUD_TXT: Record<string, string> = {
  reemplazo_indefinido: 'Reemplazo indefinido',
  aumento_planta: 'Aumento de planta',
  necesidad_temporal: 'Necesidad temporal',
  reemplazo: 'Reemplazo',
  aumento: 'Aumento',
};

export function construirBaseVacantes(
  vacantes: VacanteDoc[],
  conteos: Map<string, ConteoVacante>,
  festivos: Set<string>,
  hoy: Date,
  /** Fechas de otras colecciones (entrevista del líder, envío de exámenes). */
  fechasProceso?: Map<string, FechasProcesoVacante>,
): FilaExcel[] {
  return vacantes.map((v) => {
    const c = conteos.get(v.id) ?? { postulados: 0, enTerna: 0, contratado: false, fechaVinculacion: '' };
    const fp = fechasProceso?.get(v.id);
    const transcurridos = diasTranscurridos(v, festivos, hoy);
    const aTerna = diasHabilesATerna(v, festivos);
    return {
      Consecutivo: v.consecutivo ?? '',
      Empresa: v.empresa_nombre ?? v.empresa_codigo ?? '',
      Sede: v.sede_nombre ?? v.sede_codigo ?? '',
      Cargo: v.cargo_nombre ?? '',
      Unidad: v.unidad_nombre ?? '',
      Criticidad: v.criticidad ?? '',
      Estado: (v.estado ?? '').replace(/_/g, ' '),
      'Tipo de solicitud': TIPO_SOLICITUD_TXT[v.tipo_solicitud] ?? v.tipo_solicitud ?? '',
      'Movimiento interno': v.es_movimiento_interno ? (v.tipo_movimiento ?? 'Sí') : '',
      'Fecha de apertura': formatearFecha(aperturaVacante(v)),
      'Terna enviada': formatearFecha(aDate(v.terna_enviada_en)),
      // Pedido Karen 09-sep: trazabilidad de las 3 fechas del tramo de decisión/ingreso.
      // "Informe al líder": el informe del candidato (paso 12); si esa vacante no
      // lo tiene, cae al Concepto de Atracción, que es el otro documento que la
      // analista le manda al líder para revisar a los finalistas.
      'Informe enviado al líder': formatearFecha(
        fp?.informeLider ?? aDate(v.concepto_enviado_lider_en),
      ),
      'Entrevista del líder': formatearFecha(fp?.entrevistaLider ?? null),
      'Exámenes enviados': formatearFecha(fp?.examenEnviado ?? null),
      'Fecha de cierre': formatearFecha(aDate(v.cerrada_en)),
      'Días hábiles transcurridos': transcurridos ?? '',
      'Días hábiles a terna (ANS)': aTerna ?? '',
      'Cumplimiento ANS': cumplimientoANS(aTerna, v.estado),
      Analista: v.analista_nombre ?? '',
      Líder: v.lider_nombre ?? '',
      Postulados: c.postulados,
      'En terna': c.enTerna,
      Contratado: c.contratado ? 'Sí' : 'No',
      'Fecha de vinculación': c.fechaVinculacion,
      'Salario base': typeof v.salario_base === 'number' ? v.salario_base : '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen mensual (una fila por mes)
// ─────────────────────────────────────────────────────────────────────────────

function fechaContratado(p: PostulacionDoc): Date | null {
  return aDate(p.marcas?.contratado_en) ?? aDate(p.ultima_transicion_estado);
}

/** Clave de mes 'yyyy-MM' de un instante, en zona Bogotá. */
function mesKeyBogota(d: Date): string {
  return format(aZonaBogota(d), 'yyyy-MM');
}

export function construirResumenMensual(
  vacantes: VacanteDoc[],
  postulaciones: PostulacionDoc[],
  festivos: Set<string>,
  hoy: Date,
): FilaExcel[] {
  // Rango de meses (en TZ Bogotá): del más antiguo `creado_en` hasta el mes actual.
  const aperturas = vacantes.map((v) => aDate(v.creado_en)).filter((d): d is Date => !!d);
  if (aperturas.length === 0) return [];
  const claveFin = mesKeyBogota(hoy);
  let [anio, mes] = aperturas.map(mesKeyBogota).sort()[0].split('-').map(Number);

  const filas: FilaExcel[] = [];
  // Tope de seguridad (no debería pasar de unas pocas decenas de meses).
  for (let i = 0; i < 240; i += 1) {
    const clave = `${anio}-${String(mes).padStart(2, '0')}`;
    if (clave > claveFin) break; // 'yyyy-MM' compara bien lexicográficamente

    // Límite superior EXCLUSIVO: primer instante del mes siguiente en Bogotá.
    const anioSig = mes === 12 ? anio + 1 : anio;
    const mesSig = mes === 12 ? 1 : mes + 1;
    const finExclusivo = fromZonedTime(
      `${anioSig}-${String(mesSig).padStart(2, '0')}-01T00:00:00`,
      TZ_BOGOTA,
    );
    const enMes = (d: Date | null) => !!d && mesKeyBogota(d) === clave;

    const abiertas = vacantes.filter((v) => enMes(aDate(v.creado_en)));
    const cerradas = vacantes.filter(
      (v) => esVacanteCerrada(v.estado) && enMes(aDate(v.cerrada_en)),
    );
    const activasFinMes = vacantes.filter((v) => {
      const ap = aDate(v.creado_en);
      if (!ap || ap >= finExclusivo) return false;
      const cierre = aDate(v.cerrada_en);
      const cerradaAntes = esVacanteCerrada(v.estado) && cierre && cierre < finExclusivo;
      return !cerradaAntes;
    });
    const criticasActivas = activasFinMes.filter((v) => v.criticidad === 'Alta');

    const postulados = postulaciones.filter(
      (p) => !NO_POSTULADO.has(p.estado) && enMes(aDate(p.fecha_postulacion)),
    ).length;
    const contratados = postulaciones.filter(
      (p) => p.estado === 'contratado' && enMes(fechaContratado(p)),
    ).length;

    // Ternas enviadas en el mes → tiempo promedio + % cumplimiento ANS.
    const ternasMes = vacantes
      .filter((v) => enMes(aDate(v.terna_enviada_en)))
      .map((v) => diasHabilesATerna(v, festivos))
      .filter((d): d is number => d !== null);
    const promedioTerna =
      ternasMes.length > 0
        ? Math.round((ternasMes.reduce((s, d) => s + d, 0) / ternasMes.length) * 10) / 10
        : '';
    const cumplenAns = ternasMes.filter((d) => d <= ANS_TERNA_LIMITE).length;
    const pctAns =
      ternasMes.length > 0 ? `${Math.round((cumplenAns / ternasMes.length) * 100)}%` : '';

    filas.push({
      Mes: clave,
      'Vacantes abiertas': abiertas.length,
      'Vacantes cerradas': cerradas.length,
      'Activas (fin de mes)': activasFinMes.length,
      Postulados: postulados,
      Contratados: contratados,
      'Críticas activas': criticasActivas.length,
      'Días prom. a terna': promedioTerna,
      '% cumplimiento ANS': pctAns,
    });

    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return filas;
}
