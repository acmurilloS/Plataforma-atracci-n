import { onRequest } from 'firebase-functions/v2/https';
import { listarCargos, listarSedes } from './endpoints/catalogos';
import { listarIngresos, obtenerIngreso } from './endpoints/ingresos';
import { me } from './endpoints/me';
import type { ManejadorProtegido } from './guardia';
import { registrarPeticion } from './registro';
import { error } from './respuestas';

/**
 * API pública v1 · `https://ptm-atraccion.web.app/api/v1/*`
 * (hosting reescribe /api/** a esta función; llamada directa en
 * cloudfunctions.net llega sin el prefijo /api — se aceptan las dos).
 *
 * Solo GET. Rutas:
 *   GET /v1/me
 *   GET /v1/ingresos?desde=|actualizado_desde=&estado=&empresa=&page=&limit=&solo_dotacion=
 *   GET /v1/ingresos/{id}
 *   GET /v1/sedes · GET /v1/cargos  (DotaTrack 17-nov: emparejar por código)
 */

const RUTAS: { patron: RegExp; metodo: string; nombres: string[]; manejador: ManejadorProtegido }[] = [
  { patron: /^\/v1\/me$/, metodo: 'GET', nombres: [], manejador: me },
  { patron: /^\/v1\/ingresos$/, metodo: 'GET', nombres: [], manejador: listarIngresos },
  { patron: /^\/v1\/ingresos\/([^/]+)$/, metodo: 'GET', nombres: ['id'], manejador: obtenerIngreso },
  { patron: /^\/v1\/sedes$/, metodo: 'GET', nombres: [], manejador: listarSedes },
  { patron: /^\/v1\/cargos$/, metodo: 'GET', nombres: [], manejador: listarCargos },
];

export const api = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    let path = (req.path || '/').replace(/\/+$/, '') || '/';
    if (path === '/api' || path.startsWith('/api/')) path = path.slice(4) || '/';

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const candidatas = RUTAS.filter((r) => r.patron.test(path));
    if (candidatas.length === 0) {
      const status = error(res, 'ruta_no_encontrada', `No existe ${path}. Rutas: /v1/me, /v1/ingresos, /v1/ingresos/{id}, /v1/sedes, /v1/cargos.`);
      await registrarPeticion({
        integracion_id: null,
        llave_id: null,
        llave_prefijo: null,
        metodo: req.method,
        ruta: path,
        status,
        duracion_ms: 0,
        ip: req.ip ?? null,
        error: 'ruta_no_encontrada',
        limite_degradado: false,
      });
      return;
    }
    const ruta = candidatas.find((r) => r.metodo === req.method);
    if (!ruta) {
      res.set('Allow', [...new Set(candidatas.map((r) => r.metodo))].join(', '));
      error(res, 'metodo_no_permitido', `Esta ruta solo acepta ${candidatas.map((r) => r.metodo).join(', ')}.`);
      return;
    }
    const m = ruta.patron.exec(path) ?? [];
    const params: Record<string, string> = {};
    ruta.nombres.forEach((n, i) => {
      params[n] = decodeURIComponent(m[i + 1] ?? '');
    });
    await ruta.manejador(req, res, params);
  },
);
