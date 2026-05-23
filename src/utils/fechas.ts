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
  const d = fecha.getDay();
  return d === 0 || d === 6;
}

export function esFestivo(fecha: Date, festivosIsoSet: Set<string>): boolean {
  return festivosIsoSet.has(format(fecha, 'yyyy-MM-dd'));
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

export function fechaInputValue(fecha: Date | null): string {
  if (!fecha || !isValid(fecha)) return '';
  return format(fecha, 'yyyy-MM-dd');
}

export function parsearFechaInput(valor: string): Date | null {
  if (!valor) return null;
  const d = fromZonedTime(`${valor}T09:00:00`, TZ_BOGOTA);
  return isValid(d) ? d : null;
}
