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

// ─────────────────────────────────────────────────────────────────────────────
// Conteos por vacante (postulados / en terna / contratado) desde postulaciones
// ─────────────────────────────────────────────────────────────────────────────

export interface ConteoVacante {
  postulados: number;
  enTerna: number;
  contratado: boolean;
}

/** No cuentan como "postulado" real los perfiles aún sin contacto humano. */
const NO_POSTULADO = new Set(['sourceado_por_ia']);

/** Agrupa las postulaciones por vacante y resume sus conteos. */
export function agruparPostulaciones(postulaciones: PostulacionDoc[]): Map<string, ConteoVacante> {
  const mapa = new Map<string, ConteoVacante>();
  for (const p of postulaciones) {
    const vid = p.vacante_id;
    if (!vid) continue;
    const c = mapa.get(vid) ?? { postulados: 0, enTerna: 0, contratado: false };
    if (!NO_POSTULADO.has(p.estado)) c.postulados += 1;
    if (p.estado === 'en_terna') c.enTerna += 1;
    if (p.estado === 'contratado') c.contratado = true;
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
  const apertura = aDate(v.creado_en);
  if (!apertura) return null;
  const cierre = aDate(v.cerrada_en);
  const fin = esVacanteCerrada(v.estado) && cierre ? cierre : hoy;
  return diasHabilesEntre(apertura, fin, festivos);
}

/** Días hábiles de la apertura a la terna enviada (el ANS). Null si no hay terna. */
export function diasHabilesATerna(v: VacanteDoc, festivos: Set<string>): number | null {
  const apertura = aDate(v.creado_en);
  const terna = aDate(v.terna_enviada_en);
  if (!apertura || !terna) return null;
  return diasHabilesEntre(apertura, terna, festivos);
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
): FilaExcel[] {
  return vacantes.map((v) => {
    const c = conteos.get(v.id) ?? { postulados: 0, enTerna: 0, contratado: false };
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
      'Fecha de apertura': formatearFecha(aDate(v.creado_en)),
      'Terna enviada': formatearFecha(aDate(v.terna_enviada_en)),
      'Fecha de cierre': formatearFecha(aDate(v.cerrada_en)),
      'Días hábiles transcurridos': transcurridos ?? '',
      'Días hábiles a terna (ANS)': aTerna ?? '',
      'Cumplimiento ANS': cumplimientoANS(aTerna, v.estado),
      Analista: v.analista_nombre ?? '',
      Líder: v.lider_nombre ?? '',
      Postulados: c.postulados,
      'En terna': c.enTerna,
      Contratado: c.contratado ? 'Sí' : 'No',
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
