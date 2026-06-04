import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../utils/admin';

/**
 * Endpoint público que recibe el callback de Clay con los candidatos encontrados.
 *
 * Clay POSTea aquí cuando termina la búsqueda. Validamos:
 * - El secret en el header (que coincida con el que mandamos en el payload original).
 * - El busqueda_id corresponde a una búsqueda en Firestore con estado='en_proceso'.
 *
 * Por cada candidato:
 * - Crea candidatos/{id} con origen='hunter'.
 * - Crea postulaciones/{id} con estado='sourceado_por_ia', fuente='hunter_linkedin'.
 *
 * Marca la búsqueda como 'completada' al final.
 */

const candidatoClaySchema = z.object({
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  headline: z.string().default(''),
  empresa_actual: z.string().nullable().optional(),
  cargo_actual: z.string().nullable().optional(),
  ciudad: z.string().nullable().optional(),
  perfil_url: z.string().url(),
  email: z.string().optional(),
  score_match: z.number().min(0).max(100).optional(),
  justificacion_match: z.string().optional(),
});

// Acepta dos formatos:
// - { busqueda_id, vacante_id, candidato: {...} }   ← Clay manda 1 callback por fila
// - { busqueda_id, vacante_id, candidatos: [{...}] } ← batch (legacy / Apollo direct)
const payloadCallbackSchema = z.object({
  busqueda_id: z.string().min(1),
  vacante_id: z.string().min(1),
  candidato: candidatoClaySchema.optional(),
  candidatos: z.array(candidatoClaySchema).optional(),
});

export const recibirCandidatosClay = onRequest(
  { region: 'us-central1', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const secretEsperado = process.env.CLAY_CALLBACK_SECRET;
    if (!secretEsperado) {
      logger.error('[recibirCandidatosClay] CLAY_CALLBACK_SECRET no configurado');
      res.status(500).json({ error: 'Server misconfigured' });
      return;
    }
    const secretRecibido = req.header('x-clay-secret');
    if (secretRecibido !== secretEsperado) {
      logger.warn('[recibirCandidatosClay] secret inválido', {
        ip: req.ip,
      });
      res.status(401).json({ error: 'Invalid secret' });
      return;
    }

    const validacion = payloadCallbackSchema.safeParse(req.body);
    if (!validacion.success) {
      logger.error('[recibirCandidatosClay] payload inválido', {
        errores: validacion.error.format(),
      });
      res.status(400).json({ error: 'Invalid payload', details: validacion.error.format() });
      return;
    }
    const { busqueda_id, vacante_id } = validacion.data;
    const candidatos = validacion.data.candidato
      ? [validacion.data.candidato]
      : (validacion.data.candidatos ?? []);
    if (candidatos.length === 0) {
      logger.warn('[recibirCandidatosClay] payload sin candidato ni candidatos', { busqueda_id });
      res.status(400).json({ error: 'Empty candidate payload' });
      return;
    }

    const busquedaRef = db.collection('busquedas_sourcing').doc(busqueda_id);
    const busquedaSnap = await busquedaRef.get();
    if (!busquedaSnap.exists) {
      logger.warn('[recibirCandidatosClay] búsqueda no encontrada', { busqueda_id });
      res.status(404).json({ error: 'Search not found' });
      return;
    }
    const busqueda = busquedaSnap.data() as Record<string, unknown>;
    // Clay puede mandar múltiples callbacks (uno por candidato). NO bloqueamos duplicados —
    // simplemente acumulamos. El estado se mantiene 'en_proceso' hasta que el timeout
    // (o el usuario manualmente) lo marque como 'completada'.

    const ahora = Timestamp.now();
    const analistaUid = (busqueda.analista_uid as string) ?? '';
    const consecutivo = (busqueda.vacante_consecutivo as string) ?? '';

    const vacanteSnap = await db.collection('vacantes').doc(vacante_id).get();
    const vacante = vacanteSnap.data() as Record<string, unknown> | undefined;
    const procesoActivoId = vacante?.proceso_activo_id as string | null | undefined;
    const cargoNombre = vacante?.cargo_nombre as string | undefined;

    const postulacionesIds: string[] = [];

    for (const c of candidatos) {
      const candidatoRef = db.collection('candidatos').doc();
      await candidatoRef.set({
        id: candidatoRef.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        email: c.email ?? '',
        telefono: '',
        documento_tipo: null,
        documento_numero: null,
        provisional: true,
        ciudad_residencia: c.ciudad ?? null,
        // 'sourcing_ia' es el valor válido del enum origenCandidato ('hunter' no existe).
        origen: 'sourcing_ia',
        magneto_id: null,
        linkedin_url: c.perfil_url,
        fuente_hv_url: c.perfil_url,
        observaciones: c.justificacion_match ?? '',
        alertas: [],
        alertas_tipos: [],
        creado_en: ahora,
        creado_por: analistaUid,
        actualizado_en: ahora,
        actualizado_por: analistaUid,
      });

      const postulacionRef = db.collection('postulaciones').doc();
      await postulacionRef.set({
        id: postulacionRef.id,
        candidato_id: candidatoRef.id,
        candidato_nombre: `${c.nombres} ${c.apellidos}`.trim(),
        proceso_id: procesoActivoId ?? null,
        vacante_id,
        vacante_consecutivo: consecutivo,
        candidato_email: c.email ?? '',
        candidato_telefono: '',
        candidato_cv_url: c.perfil_url,
        cargo_nombre: cargoNombre ?? '',
        fuente: 'hunter_linkedin',
        origen_publicacion_id: null,
        analista_uid: analistaUid,
        estado: 'sourceado_por_ia',
        cumple_criterios: null,
        razon_descarte: null,
        descarte_etapa: null,
        fecha_postulacion: ahora,
        ultima_transicion_estado: ahora,
        marcas: { sourceado_en: ahora },
        sourcing_busqueda_id: busqueda_id,
        sourcing_score: c.score_match ?? null,
        sourcing_headline: c.headline ?? '',
        sourcing_empresa_actual: c.empresa_actual ?? null,
        sourcing_cargo_actual: c.cargo_actual ?? null,
        sourcing_justificacion: c.justificacion_match ?? '',
        creado_en: ahora,
        creado_por: analistaUid,
        actualizado_en: ahora,
        actualizado_por: analistaUid,
      });
      postulacionesIds.push(postulacionRef.id);
    }

    // Acumular el conteo y los ids (Clay puede llamar múltiples veces).
    await busquedaRef.update({
      encontrados: FieldValue.increment(candidatos.length),
      postulaciones_ids: FieldValue.arrayUnion(...postulacionesIds),
      actualizado_en: ahora,
      actualizado_por: 'clay-callback',
    });

    await db.collection('eventos').add({
      tipo: 'sourcing_completado',
      busqueda_id,
      vacante_id,
      analista_uid: analistaUid,
      modo: 'clay',
      encontrados: candidatos.length,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: 'clay-callback',
    });

    logger.info('[recibirCandidatosClay] búsqueda completada', {
      busqueda_id,
      encontrados: candidatos.length,
    });

    res.status(200).json({ ok: true, encontrados: candidatos.length });
  },
);
