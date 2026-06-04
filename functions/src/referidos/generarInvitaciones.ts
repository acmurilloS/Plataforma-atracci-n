import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { leerHojaSheet } from '../sheets/cliente';
import { escogerCelularTecnico } from './normalizarCelular';
import { generarSlug } from './generarSlug';
import {
  interpolar,
  obtenerTemplate,
  templateDifusion,
  type TemplateKey,
} from './mensajeTemplates';

const GDRIVE_SERVICE_ACCOUNT_JSON = defineSecret('GDRIVE_SERVICE_ACCOUNT_JSON');

const APP_URL = 'https://ptm-atraccion.web.app';

interface VacanteData {
  id: string;
  consecutivo: string;
  cargo_nombre: string;
  sede_nombre: string;
}

interface ConfigReferidos {
  sheet_id: string;
  hoja: string;
  columna_cedula: string;
  columna_nombre: string;
  columna_empresa: string;
  columna_sede: string;
  columna_cargo: string;
  columna_cel_corporativo: string;
  columna_cel_personal: string;
  columna_fecha_ingreso: string | null;
  dias_antiguedad_minima: number;
  version_columnas: number;
}

/** Letra de columna A-Z(...) → índice 0-based. "A"=0, "Z"=25, "AA"=26. */
function letraColumnaAIndice(letra: string): number {
  let idx = 0;
  for (const c of letra.toUpperCase()) {
    if (c < 'A' || c > 'Z') throw new Error(`Letra de columna inválida: ${letra}`);
    idx = idx * 26 + (c.charCodeAt(0) - 64);
  }
  return idx - 1;
}

/** Toma una fila del Sheet y un nombre de columna (letra). Devuelve string vacío si no existe. */
function celda(fila: string[], letra: string): string {
  const idx = letraColumnaAIndice(letra);
  return fila[idx]?.trim() ?? '';
}

async function leerConfig(): Promise<ConfigReferidos> {
  const snap = await db.collection('configuracion_global').doc('referidos').get();
  if (!snap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'El módulo de referidos no está configurado. Pídele al admin que configure el Sheet en /admin/catalogos → Referidos.',
    );
  }
  return snap.data() as ConfigReferidos;
}

async function leerVacante(vacanteId: string): Promise<VacanteData> {
  const snap = await db.collection('vacantes').doc(vacanteId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Vacante ${vacanteId} no existe.`);
  }
  const d = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    consecutivo: String(d.consecutivo ?? ''),
    cargo_nombre: String(d.cargo_nombre ?? ''),
    sede_nombre: String(d.sede_nombre ?? ''),
  };
}

async function leerOptOuts(): Promise<Set<string>> {
  const snap = await db.collection('referidos_optouts').get();
  const out = new Set<string>();
  snap.forEach((d) => out.add(d.id));
  return out;
}

/**
 * Parsea fecha "DD/MM/YYYY" o "YYYY-MM-DD" o "DD-MM-YYYY" del Sheet a Date.
 * Devuelve null si no puede.
 */
function parsearFechaIngreso(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // DD/MM/YYYY o DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

export const generarInvitacionesReferidos = onCall(
  {
    region: 'us-central1',
    secrets: [GDRIVE_SERVICE_ACCOUNT_JSON],
    timeoutSeconds: 60,
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    if (!['analista', 'coordinador', 'admin'].includes(rol ?? '')) {
      throw new HttpsError(
        'permission-denied',
        'Solo analista, coordinador o admin pueden activar referidos.',
      );
    }

    const vacanteId = String(req.data?.vacante_id ?? '');
    const modo = (req.data?.modo ?? 'personal') as 'personal' | 'difusion';
    const template = (req.data?.mensaje_template ?? 'v1') as TemplateKey;
    const mensajeCustom = (req.data?.mensaje_custom ?? null) as string | null;
    const excluidasManual = new Set(
      (req.data?.cedulas_excluidas_manualmente ?? []) as string[],
    );

    if (!vacanteId) throw new HttpsError('invalid-argument', 'Falta vacante_id.');

    const [vacante, config, optOuts] = await Promise.all([
      leerVacante(vacanteId),
      leerConfig(),
      leerOptOuts(),
    ]);

    let filas: string[][];
    try {
      filas = await leerHojaSheet({
        spreadsheetId: config.sheet_id,
        hoja: config.hoja,
      });
    } catch (e) {
      logger.error('[referidos] error leyendo Sheet', {
        sheet_id: config.sheet_id,
        msg: e instanceof Error ? e.message : String(e),
      });
      throw new HttpsError(
        'failed-precondition',
        'No se pudo leer el Sheet de técnicos. Verifica que esté compartido con la cuenta de servicio en modo Editor.',
      );
    }

    // Asumimos que la primera fila es el header — la saltamos.
    const datos = filas.slice(1);
    const totalEnSheet = datos.length;

    const ahora = Timestamp.now();
    const ahoraDate = ahora.toDate();
    const diasMin = config.columna_fecha_ingreso ? config.dias_antiguedad_minima : 0;

    const incluidos: Array<{
      cedula: string;
      nombre: string;
      empresa: string;
      sede: string;
      cargo: string;
      cel_e164: string;
    }> = [];
    const excluidos = { opt_out: 0, sin_celular: 0, antiguedad: 0, manual: 0 };

    for (const fila of datos) {
      const cedula = celda(fila, config.columna_cedula);
      if (!cedula) continue; // fila vacía

      if (optOuts.has(cedula)) {
        excluidos.opt_out += 1;
        continue;
      }
      if (excluidasManual.has(cedula)) {
        excluidos.manual += 1;
        continue;
      }

      const celCorp = celda(fila, config.columna_cel_corporativo);
      const celPers = celda(fila, config.columna_cel_personal);
      const cel = escogerCelularTecnico(celCorp, celPers);
      if (!cel) {
        excluidos.sin_celular += 1;
        continue;
      }

      if (diasMin > 0 && config.columna_fecha_ingreso) {
        const fechaIng = parsearFechaIngreso(celda(fila, config.columna_fecha_ingreso));
        if (fechaIng) {
          const dias = Math.floor((ahoraDate.getTime() - fechaIng.getTime()) / 86_400_000);
          if (dias < diasMin) {
            excluidos.antiguedad += 1;
            continue;
          }
        }
      }

      incluidos.push({
        cedula,
        nombre: celda(fila, config.columna_nombre),
        empresa: celda(fila, config.columna_empresa),
        sede: celda(fila, config.columna_sede),
        cargo: celda(fila, config.columna_cargo),
        cel_e164: cel.e164,
      });
    }

    // Sede de la vacante arriba: priorizar visualmente a los locales.
    incluidos.sort((a, b) => {
      const aEsLocal = a.sede.toLowerCase() === vacante.sede_nombre.toLowerCase();
      const bEsLocal = b.sede.toLowerCase() === vacante.sede_nombre.toLowerCase();
      if (aEsLocal && !bEsLocal) return -1;
      if (!aEsLocal && bEsLocal) return 1;
      return a.nombre.localeCompare(b.nombre);
    });

    const generacionRef = db.collection('referidos_generaciones').doc();
    const generacionId = generacionRef.id;

    // Crear los slugs y resolver el link de la landing por técnico.
    const tecnicos = await Promise.all(
      incluidos.map(async (t) => {
        const slug = generarSlug(10);
        const linkLanding = `${APP_URL}/carreras/${vacante.id}?ref=${slug}`;

        // Persistir el mapeo slug → cédula. Es la fuente de verdad que usa
        // `resolverRefSlug` cuando el candidato postula.
        await db.collection('referidos_links').doc(slug).set({
          slug,
          cedula_tecnico: t.cedula,
          nombre_tecnico: t.nombre,
          vacante_id: vacante.id,
          generacion_id: generacionId,
          creado_en: ahora,
        });

        const tpl = obtenerTemplate(template, mensajeCustom);
        const mensaje = interpolar(tpl, {
          nombre: t.nombre.split(' ')[0] ?? t.nombre, // primer nombre, más cercano
          cargo: vacante.cargo_nombre,
          sede: vacante.sede_nombre,
          link: linkLanding,
        });

        const waMeUrl = `https://wa.me/${t.cel_e164.replace('+', '')}?text=${encodeURIComponent(
          mensaje,
        )}`;

        return {
          cedula: t.cedula,
          nombre: t.nombre,
          empresa: t.empresa,
          sede: t.sede,
          cargo: t.cargo,
          celular_e164: t.cel_e164,
          mensaje_personalizado: mensaje,
          wa_me_url: waMeUrl,
          link_landing: linkLanding,
        };
      }),
    );

    const mensajeDifusion =
      modo === 'difusion'
        ? interpolar(templateDifusion(), {
            nombre: '',
            cargo: vacante.cargo_nombre,
            sede: vacante.sede_nombre,
            link: `${APP_URL}/carreras/${vacante.id}`,
          })
        : null;

    const linkLandingDifusion =
      modo === 'difusion' ? `${APP_URL}/carreras/${vacante.id}` : null;

    // Documento de auditoría: snapshot de lo generado.
    const mensajeMuestra =
      tecnicos[0]?.mensaje_personalizado ?? mensajeDifusion ?? '(sin técnicos)';

    await generacionRef.set({
      id: generacionId,
      vacante_id: vacante.id,
      vacante_consecutivo: vacante.consecutivo,
      cargo_nombre: vacante.cargo_nombre,
      sede_nombre: vacante.sede_nombre,
      generado_por_uid: req.auth.uid,
      generado_en: ahora,
      modo,
      mensaje_template: template,
      mensaje_usado: mensajeMuestra,
      tecnicos_incluidos: tecnicos.length,
      tecnicos_excluidos: excluidos,
      marcada_como_enviada: false,
      marcada_enviada_en: null,
      marcada_enviada_por_uid: null,
      creado_en: ahora,
      creado_por: req.auth.uid,
      actualizado_en: ahora,
      actualizado_por: req.auth.uid,
    });

    await db.collection('eventos').add({
      tipo: 'referidos_generados',
      vacante_id: vacante.id,
      generacion_id: generacionId,
      generado_por_uid: req.auth.uid,
      modo,
      mensaje_template: template,
      total_en_sheet: totalEnSheet,
      tecnicos_incluidos: tecnicos.length,
      tecnicos_excluidos: excluidos,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[referidos] invitaciones generadas', {
      vacante_id: vacante.id,
      generacion_id: generacionId,
      incluidos: tecnicos.length,
      excluidos,
      modo,
    });

    return {
      ok: true as const,
      generacion_id: generacionId,
      total_en_sheet: totalEnSheet,
      tecnicos,
      excluidos,
      mensaje_difusion: mensajeDifusion,
      link_landing_difusion: linkLandingDifusion,
    };
  },
);
