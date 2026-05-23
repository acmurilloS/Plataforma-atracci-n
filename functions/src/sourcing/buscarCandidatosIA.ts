import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { buscarConGemini } from './clienteGemini';
import { llamarClayFunction } from './clienteClay';
import { construirPromptSourcing, type ContextoPrompt } from './promptVacante';
import {
  respuestaSourcingSchema,
  type CandidatoSourceado,
  type RespuestaSourcing,
} from './respuestaSchema';
import { validarUrlPerfil } from './validarUrl';

interface VacanteParaSourcing {
  id: string;
  cargo_nombre: string;
  empresa_nombre: string;
  sede_nombre: string;
  unidad_nombre?: string;
  criticidad?: string;
  salario_base?: number;
  justificacion?: string;
  comisiones_texto?: string;
  garantizado_texto?: string;
  cargo_id?: string;
  consecutivo?: string;
  proceso_activo_id?: string | null;
}

/**
 * Genera respuesta dummy para validar el pipeline sin gastar quota Gemini.
 * Se reemplaza por llamada real a Gemini con grounding en la siguiente iteración.
 */
function generarRespuestaDummy(vacante: VacanteParaSourcing): RespuestaSourcing {
  const candidatos: CandidatoSourceado[] = [
    {
      nombres: 'Laura Patricia',
      apellidos: 'Hernández Mejía',
      headline: `Senior ${vacante.cargo_nombre} con 6+ años en sector telco`,
      empresa_actual: 'Claro Colombia',
      cargo_actual: vacante.cargo_nombre,
      ciudad: vacante.sede_nombre,
      perfil_url: 'https://www.linkedin.com/in/dummy-laura-hernandez',
      justificacion_match: `Experiencia relevante en el cargo objetivo. Trabaja en empresa competencia directa de ${vacante.empresa_nombre}.`,
      score_match: 88,
    },
    {
      nombres: 'Andrés Felipe',
      apellidos: 'Quintero López',
      headline: `${vacante.cargo_nombre} | Open to opportunities`,
      empresa_actual: 'Movistar',
      cargo_actual: vacante.cargo_nombre,
      ciudad: vacante.sede_nombre,
      perfil_url: 'https://www.linkedin.com/in/dummy-andres-quintero',
      justificacion_match: 'Marcó "open to work" hace 2 semanas. Perfil técnico alineado con los criterios del perfilamiento.',
      score_match: 82,
    },
    {
      nombres: 'María Camila',
      apellidos: 'Rodríguez Sáenz',
      headline: `Profesional comercial B2B | Sector tecnología`,
      empresa_actual: 'Tigo',
      cargo_actual: 'Ejecutiva de cuenta senior',
      ciudad: vacante.sede_nombre,
      perfil_url: 'https://www.linkedin.com/in/dummy-maria-rodriguez',
      justificacion_match: 'Trayectoria comercial sólida en empresa competencia. Cumple criterios de seniority.',
      score_match: 75,
    },
  ];

  return {
    candidatos,
    query_usada: `(DUMMY) ${vacante.cargo_nombre} site:linkedin.com/in OR site:github.com`,
    fuentes_consultadas: ['linkedin.com', 'github.com'],
  };
}

export const buscarCandidatosIA = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const rol = req.auth.token.rol as string | undefined;
    const rolesPermitidos = ['analista', 'coordinador', 'admin'];
    if (!rolesPermitidos.includes(rol ?? '')) {
      throw new HttpsError('permission-denied', 'Solo analista, coordinador o admin pueden buscar.');
    }

    const vacanteId = (req.data?.vacante_id ?? '') as string;
    if (!vacanteId) {
      throw new HttpsError('invalid-argument', 'Falta vacante_id.');
    }

    const snap = await db.collection('vacantes').doc(vacanteId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Vacante no encontrada.');
    }
    const vacante = { id: snap.id, ...snap.data() } as VacanteParaSourcing & Record<string, unknown>;
    if (!vacante.proceso_activo_id) {
      throw new HttpsError(
        'failed-precondition',
        'Esta vacante no tiene perfilamiento (paso 3). Pasa por perfilamiento antes de buscar.',
      );
    }

    const usarClay = !!process.env.CLAY_FUNCTION_URL && !!process.env.CLAY_API_KEY;
    const usarGemini = !!process.env.GEMINI_API_KEY;

    // ─── Modo Clay (async) ───────────────────────────────────────────────
    // Disparamos a Clay y devolvemos el busqueda_id de inmediato.
    // Los candidatos llegan via callback en /recibirCandidatosClay (minutos después).
    if (usarClay) {
      // Cargar perfilamiento para los criterios
      const procesoSnapClay = vacante.proceso_activo_id
        ? await db.collection('procesos').doc(vacante.proceso_activo_id).get()
        : null;
      const perfClay = procesoSnapClay?.data()?.perfilamiento;

      const ahoraClay = Timestamp.now();
      const busquedaIdClay = `bus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const empresasComp =
        perfClay?.empresas_competencia && Array.isArray(perfClay.empresas_competencia)
          ? perfClay.empresas_competencia.join(', ')
          : '';
      const criterios = perfClay?.criterios_texto ?? '';

      // Persistir el tracking ANTES de llamar a Clay (por si el callback llega rápido)
      await db.collection('busquedas_sourcing').doc(busquedaIdClay).set({
        id: busquedaIdClay,
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo ?? '',
        analista_uid: req.auth.uid,
        estado: 'en_proceso',
        modo: 'clay',
        cargo_nombre: vacante.cargo_nombre,
        ciudad: vacante.sede_nombre,
        criterios,
        empresas_competencia: empresasComp,
        iniciada_en: ahoraClay,
        completada_en: null,
        encontrados: null,
        postulaciones_ids: [],
        error_msg: null,
        creado_en: ahoraClay,
        creado_por: req.auth.uid,
        actualizado_en: ahoraClay,
        actualizado_por: req.auth.uid,
      });

      const callbackUrl = process.env.CLAY_CALLBACK_URL ?? '';
      const callbackSecret = process.env.CLAY_CALLBACK_SECRET ?? '';

      try {
        await llamarClayFunction({
          busqueda_id: busquedaIdClay,
          vacante_id: vacante.id,
          callback_url: callbackUrl,
          callback_secret: callbackSecret,
          cargo_nombre: vacante.cargo_nombre,
          ciudad: vacante.sede_nombre,
          criterios,
          empresas_competencia: empresasComp,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error llamando Clay';
        await db.collection('busquedas_sourcing').doc(busquedaIdClay).update({
          estado: 'fallida',
          error_msg: msg,
          completada_en: Timestamp.now(),
        });
        throw new HttpsError('internal', `Clay falló: ${msg}`);
      }

      await db.collection('eventos').add({
        tipo: 'sourcing_disparado',
        vacante_id: vacante.id,
        analista_uid: req.auth.uid,
        busqueda_id: busquedaIdClay,
        modo: 'clay',
        creado_en: FieldValue.serverTimestamp(),
        creado_por: req.auth.uid,
      });

      return {
        ok: true,
        busqueda_id: busquedaIdClay,
        encontrados: null,
        postulaciones_ids: [],
        modo: 'clay' as const,
        estado: 'en_proceso' as const,
      };
    }

    // ─── Modos síncronos (Gemini / dummy) ────────────────────────────────
    let respuesta: RespuestaSourcing;
    let modo: 'gemini' | 'dummy';

    if (usarGemini) {
      // Cargar perfilamiento + cargo para enriquecer el prompt
      const procesoSnap = vacante.proceso_activo_id
        ? await db.collection('procesos').doc(vacante.proceso_activo_id).get()
        : null;
      const procesoData = procesoSnap?.data();
      const cargoSnap = vacante.cargo_id
        ? await db.collection('cargos_catalogo').doc(vacante.cargo_id).get()
        : null;
      const cargoData = cargoSnap?.data() ?? null;

      const ctx: ContextoPrompt = {
        vacante,
        cargo: cargoData
          ? {
              nombre: cargoData.nombre,
              categoria: cargoData.categoria,
              descripcion: cargoData.descripcion,
            }
          : null,
        perfilamiento: procesoData?.perfilamiento
          ? {
              criterios_texto: procesoData.perfilamiento.criterios_texto,
              empresas_competencia: procesoData.perfilamiento.empresas_competencia,
              herramientas_requeridas: procesoData.perfilamiento.herramientas_requeridas,
              notas: procesoData.perfilamiento.notas,
            }
          : null,
      };
      const prompt = construirPromptSourcing(ctx);

      try {
        respuesta = await buscarConGemini(prompt);
        modo = 'gemini';
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error llamando Gemini';
        logger.error('[sourcing] Gemini falló', { msg });
        throw new HttpsError('internal', `Gemini falló: ${msg}`);
      }
    } else {
      const respuestaCruda = generarRespuestaDummy(vacante);
      const valido = respuestaSourcingSchema.safeParse(respuestaCruda);
      if (!valido.success) {
        logger.error('[sourcing] dummy inválido', { errores: valido.error.format() });
        throw new HttpsError('internal', 'La respuesta dummy no validó contra el esquema.');
      }
      respuesta = valido.data;
      modo = 'dummy';
    }

    // Validar URLs en paralelo y filtrar 404. Conservar 'no_verificable' (LinkedIn 999, etc.).
    const candidatosOriginales = respuesta.candidatos.length;
    if (modo === 'gemini' && respuesta.candidatos.length > 0) {
      const validaciones = await Promise.all(
        respuesta.candidatos.map((c) => validarUrlPerfil(c.perfil_url)),
      );
      const candidatosFiltrados = respuesta.candidatos.filter((_, i) => {
        const v = validaciones[i];
        return v.estado !== 'invalida';
      });
      const descartados = candidatosOriginales - candidatosFiltrados.length;
      if (descartados > 0) {
        logger.info('[sourcing] candidatos descartados por URL inválida', {
          descartados,
          total_original: candidatosOriginales,
          urls_invalidas: validaciones
            .filter((v) => v.estado === 'invalida')
            .map((v) => v.url),
        });
      }
      respuesta = { ...respuesta, candidatos: candidatosFiltrados };
    }

    const ahora = Timestamp.now();
    const busquedaId = `bus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const postulacionesIds: string[] = [];

    for (const c of respuesta.candidatos) {
      const candidatoRef = db.collection('candidatos').doc();
      await candidatoRef.set({
        id: candidatoRef.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        email: '',
        telefono: '',
        documento_tipo: null,
        documento_numero: null,
        provisional: true,
        ciudad_residencia: c.ciudad,
        origen: 'hunter',
        magneto_id: null,
        linkedin_url: c.perfil_url,
        fuente_hv_url: c.perfil_url,
        observaciones: c.justificacion_match,
        alertas: [],
        alertas_tipos: [],
        creado_en: ahora,
        creado_por: req.auth.uid,
        actualizado_en: ahora,
        actualizado_por: req.auth.uid,
      });

      const postulacionRef = db.collection('postulaciones').doc();
      await postulacionRef.set({
        id: postulacionRef.id,
        candidato_id: candidatoRef.id,
        candidato_nombre: `${c.nombres} ${c.apellidos}`.trim(),
        proceso_id: vacante.proceso_activo_id,
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo ?? '',
        candidato_email: '',
        candidato_telefono: '',
        candidato_cv_url: c.perfil_url,
        cargo_nombre: vacante.cargo_nombre,
        fuente: 'hunter_linkedin',
        origen_publicacion_id: null,
        analista_uid: req.auth.uid,
        estado: 'sourceado_por_ia',
        cumple_criterios: null,
        razon_descarte: null,
        descarte_etapa: null,
        fecha_postulacion: ahora,
        ultima_transicion_estado: ahora,
        marcas: { sourceado_en: ahora },
        sourcing_busqueda_id: busquedaId,
        sourcing_score: c.score_match,
        sourcing_headline: c.headline,
        sourcing_empresa_actual: c.empresa_actual,
        sourcing_cargo_actual: c.cargo_actual,
        sourcing_justificacion: c.justificacion_match,
        creado_en: ahora,
        creado_por: req.auth.uid,
        actualizado_en: ahora,
        actualizado_por: req.auth.uid,
      });
      postulacionesIds.push(postulacionRef.id);
    }

    await db.collection('eventos').add({
      tipo: 'sourcing_ejecutado',
      vacante_id: vacante.id,
      analista_uid: req.auth.uid,
      busqueda_id: busquedaId,
      query_usada: respuesta.query_usada,
      fuentes_consultadas: respuesta.fuentes_consultadas,
      encontrados: respuesta.candidatos.length,
      modo,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
    });

    logger.info('[sourcing] búsqueda completada', {
      vacante_id: vacante.id,
      encontrados: respuesta.candidatos.length,
      busqueda_id: busquedaId,
      modo,
    });

    return {
      ok: true,
      busqueda_id: busquedaId,
      encontrados: respuesta.candidatos.length,
      postulaciones_ids: postulacionesIds,
      modo,
    };
  },
);
