import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../utils/admin';
import type { ModoPlazo } from './configRelojLider';

/**
 * Plazos del reloj del líder (punto 7) en hora de Bogotá (UTC−5 fijo, sin horario
 * de verano, así que basta un desfase; functions no tiene date-fns).
 *
 *  - 'calendario': inicio + N horas.
 *  - 'dias_habiles': la MISMA hora del reloj tras N/24 días hábiles, contando de
 *    lunes a viernes y saltando festivos (colección `festivos`, id 'yyyy-MM-dd').
 *    Ej.: Concepto el viernes 4 pm con 2 días → vence el martes 4 pm.
 *
 * Los recordatorios y suspensiones solo se ejecutan en horario laboral (lunes a
 * viernes no festivos, 7 am a 7 pm) para no avisar ni pausar de madrugada.
 */

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Fecha "de pared" de Bogotá representada en campos UTC. */
function pared(d: Date): Date {
  return new Date(d.getTime() - OFFSET_MS);
}

export function claveDiaBogota(d: Date): string {
  const b = pared(d);
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(
    b.getUTCDate(),
  ).padStart(2, '0')}`;
}

async function festivosEntre(desde: Date, hasta: Date): Promise<Set<string>> {
  const snap = await db
    .collection('festivos')
    .where('fecha', '>=', Timestamp.fromDate(new Date(desde.getTime() - DIA_MS)))
    .where('fecha', '<=', Timestamp.fromDate(hasta))
    .get();
  return new Set(snap.docs.map((d) => d.id));
}

function esDiaHabil(d: Date, festivos: Set<string>): boolean {
  const dow = pared(d).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !festivos.has(claveDiaBogota(d));
}

function sumarDiasHabiles(inicio: Date, dias: number, festivos: Set<string>): Date {
  let d = new Date(inicio.getTime());
  let n = 0;
  while (n < dias) {
    d = new Date(d.getTime() + DIA_MS);
    if (esDiaHabil(d, festivos)) n += 1;
  }
  return d;
}

export async function calcularPlazos(
  inicio: Date,
  modo: ModoPlazo,
  horasRecordatorio: number,
  horasPausa: number,
): Promise<{ recordatorioEn: Date; venceEn: Date }> {
  if (modo === 'calendario') {
    return {
      recordatorioEn: new Date(inicio.getTime() + horasRecordatorio * 60 * 60 * 1000),
      venceEn: new Date(inicio.getTime() + horasPausa * 60 * 60 * 1000),
    };
  }
  const diasPausa = horasPausa / 24;
  // Holgura amplia para cubrir fines de semana y puentes festivos.
  const festivos = await festivosEntre(inicio, new Date(inicio.getTime() + (diasPausa * 3 + 14) * DIA_MS));
  return {
    recordatorioEn: sumarDiasHabiles(inicio, horasRecordatorio / 24, festivos),
    venceEn: sumarDiasHabiles(inicio, diasPausa, festivos),
  };
}

/** Lunes a viernes no festivo, 7:00–19:00 Bogotá. */
export async function esHorarioLaboral(ahora: Date): Promise<boolean> {
  const b = pared(ahora);
  const dow = b.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const hora = b.getUTCHours();
  if (hora < 7 || hora >= 19) return false;
  const festivo = await db.collection('festivos').doc(claveDiaBogota(ahora)).get();
  return !festivo.exists;
}

/** 'dd/mm/yyyy hh:mm' en hora de Bogotá. */
export function formatearFechaBogota(d: Date): string {
  const b = pared(d);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(b.getUTCDate())}/${dos(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${dos(
    b.getUTCHours(),
  )}:${dos(b.getUTCMinutes())}`;
}
