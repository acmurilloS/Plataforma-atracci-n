import { format, isValid } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const TZ_BOGOTA = 'America/Bogota';

export function aZonaBogota(fecha: Date): Date {
  return toZonedTime(fecha, TZ_BOGOTA);
}

export function desdeZonaBogota(fecha: Date): Date {
  return fromZonedTime(fecha, TZ_BOGOTA);
}

export function formatearFecha(fecha: Date | null | undefined, fmt = 'dd/MM/yyyy'): string {
  if (!fecha || !isValid(fecha)) return '—';
  return format(aZonaBogota(fecha), fmt);
}

export function esFinDeSemana(fecha: Date): boolean {
  // Evaluado en zona Bogotá → el día calendario coincide con formatearFecha en
  // cualquier navegador (no solo en UTC-5). Para un navegador ya en Bogotá es no-op.
  const d = aZonaBogota(fecha).getDay();
  return d === 0 || d === 6;
}

export function esFestivo(fecha: Date, festivosIsoSet: Set<string>): boolean {
  return festivosIsoSet.has(format(aZonaBogota(fecha), 'yyyy-MM-dd'));
}

export function esDiaHabil(fecha: Date, festivosIsoSet: Set<string>): boolean {
  return !esFinDeSemana(fecha) && !esFestivo(fecha, festivosIsoSet);
}

export function sumarDiasHabiles(desde: Date, n: number, festivosIsoSet: Set<string>): Date {
  const r = new Date(desde);
  r.setHours(0, 0, 0, 0);
  let agregados = 0;
  while (agregados < n) {
    r.setDate(r.getDate() + 1);
    if (esDiaHabil(r, festivosIsoSet)) agregados += 1;
  }
  return r;
}

/**
 * Cuenta los días hábiles (lun–vie, excluyendo festivos colombianos) entre dos
 * fechas, en el intervalo (desde, hasta] — empieza a contar el día siguiente a
 * `desde`, simétrico con `sumarDiasHabiles`. Si `hasta <= desde`, devuelve 0.
 * Usado para el ANS de terna y los días transcurridos de una vacante.
 */
export function diasHabilesEntre(desde: Date, hasta: Date, festivosIsoSet: Set<string>): number {
  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(0, 0, 0, 0);
  if (fin <= cursor) return 0;
  let count = 0;
  while (cursor < fin) {
    cursor.setDate(cursor.getDate() + 1);
    if (esDiaHabil(cursor, festivosIsoSet)) count += 1;
  }
  return count;
}

export function fechaInputValue(fecha: Date | null): string {
  if (!fecha || !isValid(fecha)) return '';
  return format(fecha, 'yyyy-MM-dd');
}

export function parsearFechaInput(valor: string): Date | null {
  if (!valor) return null;
  const d = fromZonedTime(`${valor}T09:00:00`, TZ_BOGOTA);
  return isValid(d) ? d : null;
}
