import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { tokenVigente } from './tokenVigente';
import { verificarCedula, MAX_INTENTOS_CEDULA } from './verificarCedula';
import { chequearRateLimitIp } from './rateLimitIp';
import { validarTurnstile } from '../security/validarTurnstile';
import { esContratado, esEstadoFinalizado, faseDeEstado } from './faseProceso';
import { CLAVES_APORTA_CANDIDATO, ITEM_POR_CLAVE } from '../documentos/catalogoCarpeta';

// CAPTCHA (Cloudflare Turnstile). En el emulador no se setea y validarTurnstile
// usa la test secret oficial; en prod hay que sembrarlo en Secret Manager.
const TURNSTILE_SECRET = defineSecret('TURNSTILE_SECRET');

/**
 * resolverPortalToken · resuelve el token público del portal del candidato.
 *
 * Acceso en dos factores (F1): el token da entrada al link, pero NO entrega PII
 * hasta que el candidato confirma su cédula. Sin cédula (o incorrecta) se
 * devuelve un payload MAGRO (a lo sumo la empresa para el branding) + el estado
 * del gate (requiere/incorrecta/bloqueado). Con la cédula correcta se devuelve
 * el payload COMPLETO: estado del proceso, citaciones, slots de documentos,
 * consentimientos, condiciones y —si el proceso finalizó— el mensaje amable.
 *
 * Callable pública (el candidato no tiene cuenta). Token inexistente/malformado/
 * expirado → `encontrado:false`, sin filtrar detalles.
 */
export const resolverPortalToken = onCall(
  { region: 'us-central1', secrets: [TURNSTILE_SECRET] },
  async (req) => {
  const token = String(req.data?.token ?? '').trim();
  const cedulaInput = String(req.data?.cedula ?? '').trim();
  const captchaToken = String(req.data?.captcha_token ?? '').trim();
  if (!token) {
    throw new HttpsError('invalid-argument', 'Falta token.');
  }
  if (!/^[A-Za-z0-9]{8,12}$/.test(token)) {
    return { encontrado: false as const };
  }

  const ref = db.collection('portal_candidato_tokens').doc(token);
  const snap = await ref.get();
  if (!snap.exists) {
    logger.info('[portal] token no encontrado', { token });
    return { encontrado: false as const };
  }
  const t = snap.data() as Record<string, unknown>;
  if (!tokenVigente(t)) {
    logger.info('[portal] token expirado o revocado', { token });
    return { encontrado: false as const };
  }

  const empresaCodigo = String(t.empresa_codigo ?? 'EQT');

  // Payload MAGRO: nada de PII, solo lo necesario para pintar el gate.
  const magro = (extra: Record<string, unknown> = {}) => ({
    encontrado: true as const,
    requiere_cedula: true as const,
    sin_cedula_registrada: false,
    captcha_fallido: false,
    cedula_incorrecta: false,
    bloqueado: false,
    bloqueado_segundos: 0,
    intentos_restantes: MAX_INTENTOS_CEDULA,
    empresa_codigo: empresaCodigo,
    ...extra,
  });

  // ── Anti-bot: cuando el candidato envía la cédula (intento real de acceso),
  // exige CAPTCHA válido + freno por IP ANTES de tocar la cédula. ─────────────
  if (cedulaInput) {
    const raw = req.rawRequest as unknown as {
      ip?: string;
      headers?: Record<string, string | undefined>;
    };
    const ip = String(
      raw?.ip ?? raw?.headers?.['x-forwarded-for'] ?? '',
    )
      .split(',')[0]
      .trim()
      .slice(0, 64);

    if (!(await validarTurnstile(captchaToken, ip))) {
      logger.info('[portal] captcha inválido', { token });
      return magro({ captcha_fallido: true });
    }

    const rl = await chequearRateLimitIp(ip);
    if (!rl.ok) {
      logger.warn('[portal] IP bloqueada por rate limit', { token });
      return magro({ bloqueado: true, bloqueado_segundos: rl.bloqueado_segundos });
    }
  }

  // ── 2º factor: cédula (verificación transaccional anti fuerza-bruta) ────────
  const cedula = await verificarCedula(ref, cedulaInput);
  if (!cedula.ok) {
    return magro({
      sin_cedula_registrada: cedula.sin_cedula_registrada,
      cedula_incorrecta: !!cedulaInput && !cedula.bloqueado && !cedula.sin_cedula_registrada,
      bloqueado: cedula.bloqueado,
      bloqueado_segundos: cedula.bloqueado_segundos,
      intentos_restantes: cedula.intentos_restantes,
    });
  }

  const postulacionId = String(t.postulacion_id ?? '');

  // ── Datos del proceso (postulación) ────────────────────────────────────────
  let datosAceptado = false;
  let imagenAceptado = false;
  let estado = '';
  let condiciones: Record<string, string> | null = null;
  let condicionesAceptadas = false;
  let firmaDatosBasicos = false;
  let firmaDebidaDiligencia = false;
  let mensajeDescarte = '';
  let vacanteId = String(t.vacante_id ?? '');
  try {
    if (postulacionId) {
      const p = await db.collection('postulaciones').doc(postulacionId).get();
      if (p.exists) {
        const pd = p.data() ?? {};
        datosAceptado = !!pd.consentimiento_datos_aceptado_en;
        imagenAceptado = !!pd.consentimiento_imagen_aceptado_en;
        estado = String(pd.estado ?? '');
        if (pd.condiciones_enviadas_en && pd.condiciones_laborales) {
          condiciones = pd.condiciones_laborales as Record<string, string>;
          condicionesAceptadas = !!pd.condiciones_aceptadas_en;
        }
        firmaDatosBasicos = !!pd.firma_datos_basicos_en;
        firmaDebidaDiligencia = !!pd.firma_debida_diligencia_en;
        mensajeDescarte = String(pd.mensaje_portal_descarte ?? '').trim();
        if (!vacanteId) vacanteId = String(pd.vacante_id ?? '');
      }
    }
  } catch (e) {
    logger.warn('[portal] no se pudo leer la postulación', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Documentos sueltos subidos por el portal antiguo (documentos_portal) ────
  let documentos: { nombre: string; url: string }[] = [];
  try {
    if (postulacionId) {
      const ds = await db
        .collection('documentos_portal')
        .where('postulacion_id', '==', postulacionId)
        .get();
      documentos = ds.docs
        .map((d) => d.data() as Record<string, unknown>)
        .map((d) => ({ nombre: String(d.nombre_archivo ?? ''), url: String(d.url ?? '') }))
        .filter((d) => d.url);
    }
  } catch (e) {
    logger.warn('[portal] no se pudieron leer documentos_portal', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Slots de la carpeta real (documentos_candidato) — F4 ────────────────────
  const estadosPorClave: Record<string, Record<string, unknown>> = {};
  try {
    if (postulacionId) {
      const dc = await db
        .collection('documentos_candidato')
        .where('postulacion_id', '==', postulacionId)
        .get();
      dc.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const clave = String(data.clave ?? '');
        if (clave) estadosPorClave[clave] = data;
      });
    }
  } catch (e) {
    logger.warn('[portal] no se pudieron leer documentos_candidato', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
  const slots = CLAVES_APORTA_CANDIDATO.map((clave) => {
    const item = ITEM_POR_CLAVE[clave];
    const actual = estadosPorClave[clave];
    return {
      clave,
      nombre: item?.nombre ?? clave,
      seccion: item?.seccion ?? 'hoja_vida',
      opcional: !!item?.opcional,
      estado: actual ? String(actual.estado ?? 'pendiente') : 'pendiente',
      nombre_archivo: actual ? String(actual.nombre_archivo ?? '') : '',
      observaciones: actual ? String(actual.observaciones ?? '') : '',
    };
  });

  // ── Citaciones (F3): próxima entrevista + orden de exámenes ─────────────────
  let entrevista: {
    programada_para_ms: number | null;
    modalidad: string;
    sala_o_link: string;
    tipo: string;
  } | null = null;
  let examen: {
    centro_medico: string;
    orden_direccion: string;
    orden_url: string;
    orden_instrucciones: string;
    cita_para_ms: number | null;
  } | null = null;
  try {
    if (postulacionId) {
      const es = await db
        .collection('entrevistas')
        .where('postulacion_id', '==', postulacionId)
        .get();
      const ahora = Date.now();
      const lista = es.docs
        .map((d) => d.data() as Record<string, unknown>)
        .map((d) => {
          const ts = d.programada_para as { toMillis?: () => number } | undefined;
          return {
            ms: ts?.toMillis ? ts.toMillis() : null,
            modalidad: String(d.modalidad ?? 'virtual'),
            sala_o_link: String(d.sala_o_link ?? ''),
            tipo: String(d.tipo ?? 'analista'),
          };
        })
        .filter((d) => d.ms !== null) as {
        ms: number;
        modalidad: string;
        sala_o_link: string;
        tipo: string;
      }[];
      // Próxima futura; si no hay futuras, la más reciente.
      const futuras = lista.filter((d) => d.ms >= ahora).sort((a, b) => a.ms - b.ms);
      const elegida = futuras[0] ?? lista.sort((a, b) => b.ms - a.ms)[0];
      if (elegida) {
        entrevista = {
          programada_para_ms: elegida.ms,
          modalidad: elegida.modalidad,
          sala_o_link: elegida.sala_o_link,
          tipo: elegida.tipo,
        };
      }
    }
  } catch (e) {
    logger.warn('[portal] no se pudieron leer entrevistas', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
  try {
    if (postulacionId) {
      const xs = await db
        .collection('examenes_medicos')
        .where('postulacion_id', '==', postulacionId)
        .get();
      const docs = xs.docs.map((d) => d.data() as Record<string, unknown>);
      // El más reciente con datos de orden.
      const conOrden = docs.find((d) => d.centro_medico || d.orden_url || d.orden_direccion);
      const elegido = conOrden ?? docs[0];
      if (elegido) {
        examen = {
          centro_medico: String(elegido.centro_medico ?? ''),
          orden_direccion: String(elegido.orden_direccion ?? ''),
          orden_url: String(elegido.orden_url ?? ''),
          orden_instrucciones: String(elegido.orden_instrucciones ?? ''),
          cita_para_ms:
            (elegido.cita_para as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
        };
      }
    }
  } catch (e) {
    logger.warn('[portal] no se pudieron leer examenes_medicos', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Canal de ayuda (F7): correo del analista del proceso ────────────────────
  let analistaEmail = '';
  try {
    if (vacanteId) {
      const v = await db.collection('vacantes').doc(vacanteId).get();
      const analistaUid = String(v.data()?.analista_uid ?? '').trim();
      if (analistaUid) {
        const u = await db.collection('usuarios').doc(analistaUid).get();
        if (u.exists) analistaEmail = String(u.data()?.email ?? '').trim();
      }
    }
  } catch (e) {
    logger.warn('[portal] no se pudo leer analista', {
      token,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  // El candidato NUNCA recibe el estado técnico (revelaría la etapa/causa de un
  // descarte). Solo una `fase` neutra + banderas amables.
  return {
    encontrado: true as const,
    requiere_cedula: false as const,
    candidato_nombre: String(t.candidato_nombre ?? ''),
    documento_numero: String(t.documento_numero ?? ''),
    cargo_nombre: String(t.cargo_nombre ?? ''),
    empresa_codigo: empresaCodigo,
    fase: faseDeEstado(estado),
    finalizado: esEstadoFinalizado(estado),
    contratado: esContratado(estado),
    consentimiento_datos_aceptado: datosAceptado,
    consentimiento_imagen_aceptado: imagenAceptado,
    condiciones,
    condiciones_aceptadas: condicionesAceptadas,
    firma_datos_basicos: firmaDatosBasicos,
    firma_debida_diligencia: firmaDebidaDiligencia,
    documentos,
    slots,
    citaciones: { entrevista, examen },
    mensaje_descarte: mensajeDescarte,
    analista_email: analistaEmail,
  };
});
