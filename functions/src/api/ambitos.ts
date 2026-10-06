import { db } from '../utils/admin';

/**
 * Ámbitos de la API = EMPRESAS del catálogo (`empresas`: codigo, nombre, activo).
 * Caché de 60 s por instancia: el catálogo cambia poquísimo y cada petición
 * necesita saber qué códigos existen (desconocido → 404, ajeno → 403).
 */
export interface Ambito {
  id: string;
  nombre: string;
}

let cache: { en: number; ambitos: Ambito[] } | null = null;
const TTL_MS = 60_000;

export async function cargarAmbitos(): Promise<Ambito[]> {
  if (cache && Date.now() - cache.en < TTL_MS) return cache.ambitos;
  const snap = await db.collection('empresas').get();
  const ambitos = snap.docs
    .map((d) => ({ id: String(d.data().codigo ?? '').trim(), nombre: String(d.data().nombre ?? '').trim() }))
    .filter((a) => a.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  cache = { en: Date.now(), ambitos };
  return ambitos;
}
