import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../utils/admin';
import { normalizarCedula } from '../portal/verificarCedula';

/**
 * revisarCarpetaCore · revisión automática de la carpeta (reu Karen 16-sep, C).
 *
 * Karen quería que "la IA" revisara la carpeta antes de pasársela a Gestión
 * Humana: cédula que falta, apellido distinto, correo que no está, cargo mal.
 * Esta es la CAPA 0: cruces determinísticos entre lo que ya está en Firestore
 * (candidato, postulación, vacante y el DGH-F-05 que llenó el integrante). No
 * lee PDFs ni manda datos a ningún proveedor externo, así que no toca datos
 * personales fuera de la plataforma. La capa con lectura de documentos (IA)
 * queda para cuando Karen entregue los ítems por documento y haya aval de
 * Cumplimiento para sacar cédulas a un proveedor.
 *
 * Resultado en `carpetas_digitales/{id}.revision_datos` (server-only; las
 * reglas impiden que un cliente lo escriba). Cada chequeo tiene una `clave`
 * estable para poder afinarlo o apagarlo sin tocar la UI.
 */

export type SeveridadAlerta = 'error' | 'aviso';

export interface AlertaRevision {
  clave: string;
  severidad: SeveridadAlerta;
  titulo: string;
  detalle: string;
  esperado?: string;
  encontrado?: string;
}

export interface RevisionDatos {
  version: number;
  ejecutada_en: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  ejecutada_por: string;
  alertas: AlertaRevision[];
  errores: number;
  avisos: number;
  fuentes: { datos_basicos: boolean; candidato: boolean; vacante: boolean; movimiento_interno: boolean };
}

const VERSION = 1;

// ── Normalizadores ────────────────────────────────────────────────────────────

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Tokens de un nombre: minúsculas, sin tildes, solo letras, sin partículas. */
function tokensNombre(s: string): Set<string> {
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
  return new Set(
    sinTildes(s.toLowerCase())
      .replace(/[^a-zñ\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !PARTICULAS.has(t)),
  );
}

/** Similitud de nombres: proporción de tokens del más corto que aparecen en el otro. */
function similitudNombres(a: string, b: string): number {
  const ta = tokensNombre(a);
  const tb = tokensNombre(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [corto, largo] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let comunes = 0;
  for (const t of corto) if (largo.has(t)) comunes += 1;
  return comunes / corto.size;
}

function normalizarCorreo(s: unknown): string {
  return texto(s).toLowerCase();
}

/** Últimos 10 dígitos (celular colombiano), para comparar sin indicativos ni espacios. */
function normalizarTelefono(s: unknown): string {
  const d = texto(s).replace(/\D+/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

function normalizarCargo(s: unknown): string {
  return sinTildes(texto(s).toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Revisión ──────────────────────────────────────────────────────────────────

export async function revisarCarpetaCore(
  carpetaId: string,
  ejecutadaPor: string,
): Promise<{ ok: true; alertas: AlertaRevision[]; errores: number; avisos: number }> {
  const carpetaRef = db.collection('carpetas_digitales').doc(carpetaId);
  const carpetaSnap = await carpetaRef.get();
  if (!carpetaSnap.exists) throw new Error('La carpeta no existe.');
  const carpeta = carpetaSnap.data() as Record<string, unknown>;
  const postulacionId = texto(carpeta.postulacion_id);
  if (!postulacionId) throw new Error('La carpeta no tiene postulación.');

  const postSnap = await db.collection('postulaciones').doc(postulacionId).get();
  const post = (postSnap.data() ?? {}) as Record<string, unknown>;
  const candidatoId = texto(post.candidato_id ?? carpeta.candidato_id);
  const vacanteId = texto(post.vacante_id ?? carpeta.vacante_id);

  const [candSnap, vacSnap, dbSnap, docDghSnap] = await Promise.all([
    candidatoId ? db.collection('candidatos').doc(candidatoId).get() : Promise.resolve(null),
    vacanteId ? db.collection('vacantes').doc(vacanteId).get() : Promise.resolve(null),
    db
      .collection('datos_basicos_integrante')
      .where('postulacion_id', '==', postulacionId)
      .limit(1)
      .get(),
    // El DGH-F-05 también puede venir como PDF subido a mano (o marcado "no
    // aplica") en la carpeta: en ese caso no hay datos estructurados que cruzar.
    db
      .collection('documentos_candidato')
      .where('postulacion_id', '==', postulacionId)
      .where('clave', '==', 'datos_basicos_integrante')
      .limit(1)
      .get(),
  ]);
  const cand = (candSnap?.data() ?? null) as Record<string, unknown> | null;
  const vac = (vacSnap?.data() ?? null) as Record<string, unknown> | null;
  const datos = (dbSnap.docs[0]?.data() ?? null) as Record<string, unknown> | null;
  const estadoDocDgh = texto((docDghSnap.docs[0]?.data() as Record<string, unknown> | undefined)?.estado);
  // Movimiento interno: la persona ya es empleada, no llena el DGH-F-05 en el
  // portal (carpeta mínima). Solo aplica el cruce de cargo.
  const movimientoInterno = !!post.movimiento_interno;

  const alertas: AlertaRevision[] = [];
  const agregar = (a: AlertaRevision) => alertas.push(a);

  // Nombre "oficial" del candidato (lo que registró Atracción) vs lo que él mismo
  // escribió en el DGH-F-05.
  const nombreCandidato =
    cand ? `${texto(cand.nombres)} ${texto(cand.apellidos)}`.trim() : texto(post.candidato_nombre);
  const nombreDatos = datos ? `${texto(datos.nombres)} ${texto(datos.apellidos)}`.trim() : '';
  const datosDiligenciados = !!datos && (!!texto(datos.nombres) || !!texto(datos.documento_numero));

  // 1. DGH-F-05 (datos básicos) diligenciado.
  if (movimientoInterno) {
    agregar({
      clave: 'movimiento_interno_sin_cruce',
      severidad: 'aviso',
      titulo: 'Movimiento interno: no se cruza el DGH-F-05',
      detalle: 'La persona ya es empleada y no diligencia datos básicos en el portal; solo se revisa el cargo.',
    });
  } else if (!datosDiligenciados) {
    if (estadoDocDgh === 'entregado' || estadoDocDgh === 'verificado') {
      agregar({
        clave: 'datos_basicos_solo_pdf',
        severidad: 'aviso',
        titulo: 'El DGH-F-05 está como PDF, sin datos del portal',
        detalle: 'No hay datos estructurados para cruzar cédula, correo ni nombre; revísalos a mano en el PDF.',
      });
    } else if (estadoDocDgh !== 'no_aplica') {
      agregar({
        clave: 'datos_basicos_faltante',
        severidad: 'error',
        titulo: 'Falta el formato de datos básicos (DGH-F-05)',
        detalle: 'El integrante aún no ha diligenciado sus datos básicos en el portal; sin ellos no se pueden cruzar cédula, correo ni nombre.',
      });
    }
  } else {
    // 2. Cédula.
    const cedDatos = normalizarCedula(datos.documento_numero);
    const cedCand = normalizarCedula(cand?.documento_numero ?? post.candidato_documento ?? '');
    if (!cedDatos) {
      agregar({
        clave: 'cedula_faltante',
        severidad: 'error',
        titulo: 'Sin número de cédula en el DGH-F-05',
        detalle: 'El integrante no registró su número de documento.',
      });
    } else if (cedCand && cedCand !== cedDatos) {
      agregar({
        clave: 'cedula_distinta',
        severidad: 'error',
        titulo: 'La cédula del DGH-F-05 no coincide con la del candidato',
        detalle: 'Revisa cuál es la correcta antes de armar el contrato.',
        esperado: cedCand,
        encontrado: cedDatos,
      });
    }

    // 3. Nombre y apellidos.
    if (!texto(datos.apellidos)) {
      agregar({
        clave: 'apellidos_faltantes',
        severidad: 'error',
        titulo: 'Sin apellidos en el DGH-F-05',
        detalle: 'El integrante dejó los apellidos en blanco.',
      });
    } else if (nombreCandidato && nombreDatos && similitudNombres(nombreCandidato, nombreDatos) < 0.6) {
      agregar({
        clave: 'nombre_distinto',
        severidad: 'aviso',
        titulo: 'El nombre del DGH-F-05 no coincide con el del candidato',
        detalle: 'Puede ser un apellido mal escrito, un segundo nombre distinto o un error de digitación.',
        esperado: nombreCandidato,
        encontrado: nombreDatos,
      });
    }

    // 4. Correo.
    const correoDatos = normalizarCorreo(datos.correo_electronico);
    const correoCand = normalizarCorreo(post.candidato_email || cand?.email);
    if (!correoDatos) {
      agregar({
        clave: 'correo_faltante',
        severidad: 'aviso',
        titulo: 'Sin correo electrónico en el DGH-F-05',
        detalle: 'Se necesita para las afiliaciones y la carta de bienvenida.',
      });
    } else if (correoCand && correoCand !== correoDatos) {
      agregar({
        clave: 'correo_distinto',
        severidad: 'aviso',
        titulo: 'El correo del DGH-F-05 es distinto al de la postulación',
        detalle: 'Confirma cuál usar para las afiliaciones y las comunicaciones.',
        esperado: correoCand,
        encontrado: correoDatos,
      });
    }

    // 5. Celular.
    const telDatos = normalizarTelefono(datos.celular);
    const telCand = normalizarTelefono(post.candidato_telefono || cand?.telefono);
    if (telDatos && telCand && telDatos !== telCand) {
      agregar({
        clave: 'celular_distinto',
        severidad: 'aviso',
        titulo: 'El celular del DGH-F-05 es distinto al de la postulación',
        detalle: 'Confirma cuál es el vigente.',
        esperado: telCand,
        encontrado: telDatos,
      });
    }
  }

  // 6. Cargo: carpeta / postulación vs vacante (Karen: "puso el cargo mal").
  const cargoVac = normalizarCargo(vac?.cargo_nombre);
  const cargoPost = normalizarCargo(post.cargo_nombre || carpeta.cargo_nombre);
  if (cargoVac && cargoPost && cargoVac !== cargoPost) {
    agregar({
      clave: 'cargo_distinto',
      severidad: 'aviso',
      titulo: 'El cargo de la postulación no coincide con el de la vacante',
      detalle: 'La vacante pudo cambiar de cargo después de crear la postulación; revisa el contrato y los formatos.',
      esperado: texto(vac?.cargo_nombre),
      encontrado: texto(post.cargo_nombre || carpeta.cargo_nombre),
    });
  }

  // 7. Datos de contacto en la postulación (los usa GH para afiliaciones).
  if (!movimientoInterno && !normalizarCorreo(post.candidato_email) && !normalizarCorreo(cand?.email)) {
    agregar({
      clave: 'correo_postulacion_faltante',
      severidad: 'aviso',
      titulo: 'La postulación no tiene correo del candidato',
      detalle: 'Regístralo en Datos básicos para que le lleguen las comunicaciones.',
    });
  }

  const errores = alertas.filter((a) => a.severidad === 'error').length;
  const avisos = alertas.length - errores;

  const revision: RevisionDatos = {
    version: VERSION,
    ejecutada_en: FieldValue.serverTimestamp(),
    ejecutada_por: ejecutadaPor,
    alertas,
    errores,
    avisos,
    fuentes: { datos_basicos: !!datos, candidato: !!cand, vacante: !!vac, movimiento_interno: movimientoInterno },
  };
  await carpetaRef.update({
    revision_datos: revision,
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: ejecutadaPor,
  });

  try {
    await db.collection('eventos').add({
      tipo: 'carpeta.revision_datos',
      entidad_tipo: 'carpeta_digital',
      entidad_id: carpetaId,
      postulacion_id: postulacionId,
      vacante_id: vacanteId || null,
      payload: { errores, avisos, claves: alertas.map((a) => a.clave), version: VERSION },
      autor_uid: ejecutadaPor,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: ejecutadaPor,
    });
  } catch (e) {
    logger.warn('[revisarCarpeta] no se pudo registrar el evento', {
      carpetaId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }

  logger.info('[revisarCarpeta] revisión hecha', { carpetaId, errores, avisos });
  return { ok: true, alertas, errores, avisos };
}
