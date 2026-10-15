/**
 * Verifica que TODAS las funciones que llama la app (onCall / onRequest) dejen
 * pasar al navegador hasta nuestro código: preflight CORS + POST sin sesión
 * deben llegar a la función (respuesta JSON nuestra), no al rechazo de Cloud Run.
 *
 * Por qué existe (incidente 15-oct): `editarDatosVacante` se creó el 20-ago SIN
 * el invocador público (roles/run.invoker para allUsers). Cloud Run rechazaba
 * cada llamada antes de ejecutarla y el navegador solo mostraba "internal": a
 * Karen no le guardaba "Editar identificación". Volver a desplegar NO lo arregla
 * (firebase deploy solo pone el invocador al CREAR la función).
 *
 * Uso: `npm run verificar:funciones` después de cada `firebase deploy --only functions`.
 * No necesita credenciales: no ejecuta nada (sin sesión, nuestras funciones
 * responden 401/400 en JSON).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const PROYECTO = 'ptm-atraccion';
const REGION = 'us-central1';
const ORIGEN = 'https://ptm-atraccion.web.app';
const SRC = fileURLToPath(new URL('../functions/src', import.meta.url));

function archivosTs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivosTs(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// Funciones HTTP/callable definidas en el código…
const definidas = new Map();
for (const f of archivosTs(SRC)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/export const (\w+) = (onCall|onRequest)\b/g)) {
    definidas.set(m[1], m[2]);
  }
}
// …y exportadas en index.ts (bloques `export { … }` de una o varias líneas).
const exportadas = new Set();
for (const m of readFileSync(join(SRC, 'index.ts'), 'utf8').matchAll(/export\s*\{([^}]*)\}/gs)) {
  for (const n of m[1].split(',')) if (n.trim()) exportadas.add(n.trim());
}
const lista = [...definidas].filter(([n]) => exportadas.has(n)).sort(([a], [b]) => a.localeCompare(b));

const fallas = [];
await Promise.all(
  lista.map(async ([nombre, tipo]) => {
    const url = `https://${REGION}-${PROYECTO}.cloudfunctions.net/${nombre}`;
    try {
      const pre = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGEN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGEN },
        body: JSON.stringify({ data: {} }),
      });
      const esNuestra = (r.headers.get('content-type') ?? '').includes('application/json');
      const corsOk = tipo === 'onRequest' || !!pre.headers.get('access-control-allow-origin');
      if (!esNuestra || !corsOk) fallas.push({ nombre, detalle: `preflight ${pre.status}, POST ${r.status}` });
    } catch (e) {
      fallas.push({ nombre, detalle: e instanceof Error ? e.message : String(e) });
    }
  }),
);

console.log(`Funciones revisadas: ${lista.length}`);
if (fallas.length === 0) {
  console.log('Todas dejan pasar al navegador (invocador público OK).');
  process.exit(0);
}
console.log(`\nSIN invocador público (el navegador verá "internal"): ${fallas.length}`);
for (const f of fallas) {
  // El servicio de Cloud Run de una función gen2 es su nombre en minúsculas.
  console.log(`  - ${f.nombre} (${f.detalle})`);
  console.log(
    `    arreglo: gcloud run services add-iam-policy-binding ${f.nombre.toLowerCase()} --region=${REGION} --project=${PROYECTO} --member=allUsers --role=roles/run.invoker`,
  );
}
process.exit(1);
