import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { cargarAmbitos, type Ambito } from './ambitos';
import { COL_INTEGRACIONES, COL_LLAVES, type PermisoId } from './catalogo';
import { hashCoincide, prefijoDe, tieneFormaDeLlave } from './llaves';
import { limitador, type Veredicto } from './limitador';
import { marcarUsoLlave, registrarPeticion } from './registro';
import { MENSAJE_NO_AUTENTICADO, error, type CodigoError } from './respuestas';

/**
 * La guardia: TODA la autenticación y autorización de la API pública vive aquí.
 * Un endpoint se escribe `conApiKey({ permiso: 'x:read' }, async ({ res, ctx }) => …)`
 * y no sabe nada de llaves, hashes, vencimientos ni topes.
 *
 * La regla que más importa: el endpoint NUNCA ve el `?empresa=` que mandó el
 * cliente. Recibe `ctx.ambitos`: los ámbitos autorizados de la llave ya cruzados
 * con lo que pidió. Si pidió uno que no tiene → 403 y el endpoint ni corre; si
 * no pidió ninguno → recibe TODOS LOS SUYOS, nunca todos los de la plataforma.
 *
 * Los pasos 3, 4, 5 y 7 devuelven EXACTAMENTE el mismo 401 (mismo texto): si
 * fueran distintos, dirían a quien prueba cadenas al azar cuáles existen. El
 * vencimiento sí se distingue (solo lo ve quien ya tuvo una llave real).
 *
 * Falla cerrado: si la base no responde, 500 y no pasa. Lo único que falla
 * abierto es el limitador (decisión escrita en limitador.ts).
 */

export interface ContextoApi {
  integracion: { id: string; nombre: string };
  llave: {
    id: string;
    prefijo: string;
    nombre: string;
    topePorMin: number;
    expiraEn: Date | null;
    permisos: string[];
    /** Todos los ámbitos autorizados a la llave (para /me). */
    ambitosAutorizados: Ambito[];
  };
  /** Ámbitos (códigos de empresa) con los que el endpoint DEBE filtrar. */
  ambitos: string[];
  limite: Veredicto;
}

export interface ArgsManejador {
  req: Request;
  res: Response;
  ctx: ContextoApi;
  params: Record<string, string>;
}

export type Manejador = (args: ArgsManejador) => Promise<void>;

export type ManejadorProtegido = (
  req: Request,
  res: Response,
  params: Record<string, string>,
) => Promise<void>;

interface LlaveDoc {
  integracion_id: string;
  nombre: string;
  key_prefix: string;
  key_hash: string;
  estado: 'activa' | 'revocada';
  expira_en: FirebaseFirestore.Timestamp | null;
  tope_por_min: number;
  permisos: string[];
  ambitos: string[];
}

interface IntegracionDoc {
  nombre: string;
  estado: 'activa' | 'inactiva';
}

function ipDe(req: Request): string | null {
  const xf = req.header('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.ip ?? null;
}

export function conApiKey(opts: { permiso: PermisoId | null }, manejador: Manejador): ManejadorProtegido {
  return async (req, res, params) => {
    const inicio = Date.now();
    const ruta = req.path;
    const metodo = req.method;
    let integracionId: string | null = null;
    let llaveId: string | null = null;
    let llavePrefijo: string | null = null;
    let degradado = false;

    // Termina con error, registra y sale. Devuelve siempre `undefined` para
    // poder escribir `return rechazar(...)`.
    const rechazar = async (
      codigo: CodigoError,
      message: string,
      headers?: Record<string, string>,
    ): Promise<void> => {
      const status = error(res, codigo, message, headers);
      await registrarPeticion({
        integracion_id: integracionId,
        llave_id: llaveId,
        llave_prefijo: llavePrefijo,
        metodo,
        ruta,
        status,
        duracion_ms: Date.now() - inicio,
        ip: ipDe(req),
        error: codigo,
        limite_degradado: degradado,
      });
    };

    try {
      // 1. La cabecera.
      const auth = req.header('authorization') ?? '';
      const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
      if (!m) return rechazar('no_autenticado', 'Falta la cabecera Authorization: Bearer <llave>.');
      const secreto = m[1].trim();

      // 2. La forma: una cadena cualquiera no debe costar una consulta.
      if (!tieneFormaDeLlave(secreto)) return rechazar('no_autenticado', MENSAJE_NO_AUTENTICADO);
      llavePrefijo = prefijoDe(secreto);

      // 3. La fila, por prefijo.
      const q = await db.collection(COL_LLAVES).where('key_prefix', '==', llavePrefijo).limit(1).get();
      if (q.empty) return rechazar('no_autenticado', MENSAJE_NO_AUTENTICADO);
      const llaveSnap = q.docs[0];
      const llave = llaveSnap.data() as LlaveDoc;
      llaveId = llaveSnap.id;
      integracionId = llave.integracion_id ?? null;

      // 4. El hash, en tiempo constante.
      if (!hashCoincide(String(llave.key_hash ?? ''), secreto)) {
        return rechazar('no_autenticado', MENSAJE_NO_AUTENTICADO);
      }
      // 5. Revocada.
      if (llave.estado !== 'activa') return rechazar('no_autenticado', MENSAJE_NO_AUTENTICADO);
      // 6. Vencida: sí se distingue.
      const expiraEn = llave.expira_en ? llave.expira_en.toDate() : null;
      if (expiraEn && expiraEn.getTime() <= Date.now()) {
        return rechazar(
          'llave_vencida',
          `La llave venció el ${expiraEn.toISOString()}. Pide una nueva al administrador de la plataforma.`,
        );
      }
      // 7. La integración.
      const intSnap = integracionId
        ? await db.collection(COL_INTEGRACIONES).doc(integracionId).get()
        : null;
      if (!intSnap || !intSnap.exists) return rechazar('no_autenticado', MENSAJE_NO_AUTENTICADO);
      const integracion = intSnap.data() as IntegracionDoc;
      if (integracion.estado !== 'activa') {
        return rechazar('integracion_inactiva', 'La integración está desactivada.');
      }

      // 8. Permisos y ámbitos configurados.
      const permisos = Array.isArray(llave.permisos) ? llave.permisos.map(String) : [];
      if (opts.permiso && !permisos.includes(opts.permiso)) {
        return rechazar('permiso_faltante', `A esta llave le falta el permiso "${opts.permiso}".`);
      }
      const autorizados = Array.isArray(llave.ambitos) ? llave.ambitos.map(String).filter(Boolean) : [];
      if (autorizados.length === 0) {
        // Error de configuración, no un caso válido: "sin filtro" nunca puede
        // interpretarse como "sin restricción".
        return rechazar('sin_ambitos', 'La llave no tiene empresas autorizadas; revísala en la plataforma.');
      }

      // 9. El ámbito pedido contra los autorizados.
      const conocidos = await cargarAmbitos();
      const pedido = String(req.query.empresa ?? '').trim().toUpperCase();
      let ambitos = autorizados;
      if (pedido) {
        if (!conocidos.some((a) => a.id === pedido)) {
          return rechazar('ambito_desconocido', `No existe la empresa "${pedido}".`);
        }
        if (!autorizados.includes(pedido)) {
          return rechazar('ambito_no_autorizado', `Esta llave no está autorizada para la empresa "${pedido}".`);
        }
        ambitos = [pedido];
      }

      // 10. El tope de peticiones.
      const tope = Number(llave.tope_por_min) > 0 ? Number(llave.tope_por_min) : 60;
      const limite = await limitador.consumir(llaveId, tope);
      degradado = limite.degradado;
      if (!limite.permitido) {
        return rechazar(
          'demasiadas_peticiones',
          `Superaste el tope de ${tope} peticiones por minuto.`,
          { 'Retry-After': String(limite.reintentarEnSeg) },
        );
      }

      // 11. Adelante.
      const ctx: ContextoApi = {
        integracion: { id: intSnap.id, nombre: String(integracion.nombre ?? '') },
        llave: {
          id: llaveId,
          prefijo: llave.key_prefix,
          nombre: String(llave.nombre ?? ''),
          topePorMin: tope,
          expiraEn,
          permisos,
          ambitosAutorizados: conocidos.filter((a) => autorizados.includes(a.id)),
        },
        ambitos,
        limite,
      };
      await manejador({ req, res, ctx, params });

      await Promise.all([
        registrarPeticion({
          integracion_id: integracionId,
          llave_id: llaveId,
          llave_prefijo: llavePrefijo,
          metodo,
          ruta,
          status: res.statusCode,
          duracion_ms: Date.now() - inicio,
          ip: ipDe(req),
          error: res.statusCode >= 400 ? `http_${res.statusCode}` : null,
          limite_degradado: degradado,
        }),
        marcarUsoLlave(llaveId),
      ]);
    } catch (e) {
      logger.error('[api] error interno', {
        ruta,
        msg: e instanceof Error ? e.message : String(e),
      });
      if (!res.headersSent) {
        await rechazar('error_interno', 'Error interno. Si persiste, avisa al administrador de la plataforma.');
      }
    }
  };
}
