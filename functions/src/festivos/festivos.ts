import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../utils/admin';

// --- Algoritmo anónimo de Gauss: domingo de resurrección gregoriano ---
function domingoResurreccion(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  // Medianoche Bogotá = 5am UTC del mismo día calendario
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
}

function fechaBogota(y: number, mesCero: number, d: number): Date {
  return new Date(Date.UTC(y, mesCero, d, 5, 0, 0, 0));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function siguienteLunes(d: Date): Date {
  const r = new Date(d);
  const dia = r.getUTCDay();
  if (dia === 1) return r;
  r.setUTCDate(r.getUTCDate() + ((8 - dia) % 7));
  return r;
}

function fechaISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calcularFestivos(year: number): Array<{ fecha: Date; descripcion: string }> {
  const pascua = domingoResurreccion(year);
  return [
    { fecha: fechaBogota(year, 0, 1), descripcion: 'Año Nuevo' },
    { fecha: siguienteLunes(fechaBogota(year, 0, 6)), descripcion: 'Día de los Reyes Magos' },
    { fecha: siguienteLunes(fechaBogota(year, 2, 19)), descripcion: 'Día de San José' },
    { fecha: addDays(pascua, -3), descripcion: 'Jueves Santo' },
    { fecha: addDays(pascua, -2), descripcion: 'Viernes Santo' },
    { fecha: fechaBogota(year, 4, 1), descripcion: 'Día del Trabajo' },
    { fecha: siguienteLunes(addDays(pascua, 39)), descripcion: 'Ascensión del Señor' },
    { fecha: siguienteLunes(addDays(pascua, 60)), descripcion: 'Corpus Christi' },
    { fecha: siguienteLunes(addDays(pascua, 68)), descripcion: 'Sagrado Corazón de Jesús' },
    { fecha: siguienteLunes(fechaBogota(year, 5, 29)), descripcion: 'San Pedro y San Pablo' },
    { fecha: fechaBogota(year, 6, 20), descripcion: 'Día de la Independencia' },
    { fecha: fechaBogota(year, 7, 7), descripcion: 'Batalla de Boyacá' },
    { fecha: siguienteLunes(fechaBogota(year, 7, 15)), descripcion: 'Asunción de la Virgen' },
    { fecha: siguienteLunes(fechaBogota(year, 9, 12)), descripcion: 'Día de la Raza' },
    { fecha: siguienteLunes(fechaBogota(year, 10, 1)), descripcion: 'Todos los Santos' },
    { fecha: siguienteLunes(fechaBogota(year, 10, 11)), descripcion: 'Independencia de Cartagena' },
    { fecha: fechaBogota(year, 11, 8), descripcion: 'Día de la Inmaculada Concepción' },
    { fecha: fechaBogota(year, 11, 25), descripcion: 'Navidad' },
  ];
}

export async function sembrarFestivosAnio(anio: number): Promise<number> {
  const festivos = calcularFestivos(anio);
  const batch = db.batch();
  for (const f of festivos) {
    const id = fechaISO(f.fecha);
    batch.set(
      db.collection('festivos').doc(id),
      {
        id,
        fecha: Timestamp.fromDate(f.fecha),
        descripcion: f.descripcion,
        anio,
        origen: 'calculado',
        creado_en: FieldValue.serverTimestamp(),
        actualizado_en: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  return festivos.length;
}

// Scheduled: 1 de diciembre 06:00 Bogotá — siembra año siguiente.
export const scheduledSeedFestivos = onSchedule(
  {
    schedule: '0 6 1 12 *',
    timeZone: 'America/Bogota',
    region: 'us-central1',
  },
  async () => {
    const anio = new Date().getFullYear() + 1;
    const total = await sembrarFestivosAnio(anio);
    logger.info('Festivos sembrados (scheduled)', { anio, total });
  },
);

export const sembrarFestivosCallable = onCall(
  { region: 'us-central1' },
  async (req) => {
    const esEmulador = !!process.env.FUNCTIONS_EMULATOR;
    if (!esEmulador && req.auth?.token.rol !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin.');
    }
    const anio = Number((req.data as { anio?: number } | undefined)?.anio ?? new Date().getFullYear());
    const total = await sembrarFestivosAnio(anio);
    return { anio, total };
  },
);
