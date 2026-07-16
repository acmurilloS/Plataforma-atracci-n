import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * decidirTerna · la decisión del LÍDER sobre su terna (paso 14).
 *
 * Por qué existe (revisión pre-producción, 16-jul): aprobar/descartar la terna
 * era la ÚNICA acción del líder en la plataforma y estaba ROTA de punta a punta.
 * TernaPage lo hacía con escrituras directas de cliente sobre `postulaciones`,
 * `vacantes`, `tickets_conexion` y `candidatos`, y las reglas de esas colecciones
 * solo permiten escribir a staff/analista — el rol `lider` quedaba fuera justo en
 * su paso. El líder creaba la decisión (eso sí lo permite la regla), y a la línea
 * siguiente el update de la postulación reventaba con permission-denied → recuadro
 * rojo "No pudimos aprobar", candidato atascado y decisión huérfana. Solo un admin
 * lograba completarlo.
 *
 * Ahora la decisión completa vive en esta callable (Admin SDK), que:
 *  - Valida server-side que quien decide es el LÍDER de esa vacante (o coord/admin).
 *  - En una transacción re-valida que la postulación siga en `en_terna` (anti
 *    doble-submit) y aplica atómicamente: decisión + transición de la postulación
 *    + transición de la vacante.
 *  - Aprobar → postulación a `en_examenes_medicos` (el trigger onPostulacionEnExamenes
 *    crea solo el examen y avisa a los gestores; NO se duplica aquí) + vacante a
 *    `seleccionado`. Descartar → `descartado_por_lider` + motivo.
 *  - Fuera de la transacción: denormaliza el resultado en el candidato (pool) y, al
 *    aprobar, crea/asegura los tickets de conexión (paso 20, adelanto del Dolor #4).
 *
 * Espeja el patrón de `aprobarCarpeta` (callable transaccional para lo que un rol
 * no puede escribir directo).
 */

const ROLES_DECIDE = ['lider', 'coordinador', 'admin'];

// ── Tickets de conexión (paso 20): constantes replicadas de
//    src/schemas/ticketConexionSchema.ts (el cliente y el server no comparten
//    módulos). Mantener en sync si cambian allá. ──────────────────────────────
const AREA_POR_TIPO: Record<string, string> = {
  accesos_sistemas: 'it',
  computador: 'it',
  office: 'it',
  celular_plan_datos: 'it',
  dotacion_compras: 'compras',
  dotacion_bodega: 'bodega',
  labroides: 'contabilidad',
  induccion_talentos: 'talentos',
  puesto_fisico: 'administrativo',
  otro: 'it',
};
const TIPO_LABEL: Record<string, string> = {
  accesos_sistemas: 'Accesos y cuentas',
  computador: 'Computador / equipo',
  office: 'Licencia Office / M365',
  celular_plan_datos: 'Celular + plan de datos',
  dotacion_compras: 'Dotación · compras',
  dotacion_bodega: 'Dotación · bodega',
  labroides: 'Usuario Labroides',
  induccion_talentos: 'Inducción · universidad corporativa',
  puesto_fisico: 'Puesto físico',
  otro: 'Otro',
};
const ANS_DIAS_POR_CRITICIDAD: Record<string, number> = { Alta: 3, Media: 5, Baja: 7 };

// Motivos de descarte que dejan al candidato reutilizable en el pool (espejo de
// MOTIVOS_RECICLABLES en src/schemas). Si el motivo NO está aquí, es descarte duro.
const MOTIVOS_RECICLABLES = new Set([
  'no_es_el_momento',
  'perfil_para_otra_vacante',
  'segundo_lugar',
  'sobrecalificado',
]);

interface TicketPlan {
  tipo: string;
  descripcion: string;
}

function planTickets(
  herramientas: Record<string, unknown> | undefined,
  cargoNombre: string,
): TicketPlan[] {
  const tickets: TicketPlan[] = [
    {
      tipo: 'accesos_sistemas',
      descripcion: `Crear correo corporativo + cuentas básicas para el ingreso del candidato al cargo ${cargoNombre}.`,
    },
    {
      tipo: 'induccion_talentos',
      descripcion: `Habilitar inducción en universidad corporativa para el nuevo ${cargoNombre}.`,
    },
  ];
  const h = herramientas ?? {};
  if (h.computador) {
    tickets.push({ tipo: 'computador', descripcion: `Asignar equipo de cómputo (laptop/desktop) según matriz del cargo ${cargoNombre}.` });
  }
  if (h.office) {
    tickets.push({ tipo: 'office', descripcion: `Asignar licencia Office / M365 para el ingreso del cargo ${cargoNombre}.` });
  }
  if (h.celular_plan_datos) {
    tickets.push({ tipo: 'celular_plan_datos', descripcion: `Gestionar línea celular corporativa + plan de datos para el cargo ${cargoNombre}.` });
  }
  if (h.labroides) {
    tickets.push({ tipo: 'labroides', descripcion: `Crear usuario en Labroides para el nuevo ${cargoNombre}.` });
  }
  if (h.dotacion) {
    tickets.push({ tipo: 'dotacion_compras', descripcion: `Gestionar compra de dotación (uniforme/EPP) para el nuevo ${cargoNombre}.` });
    tickets.push({ tipo: 'dotacion_bodega', descripcion: `Preparar entrega física de dotación desde bodega para el nuevo ${cargoNombre}.` });
  }
  return tickets;
}

/** Suma días hábiles (fines de semana fuera). No excluye festivos: la fecha es
 *  informativa (semáforo ANS del ticket), no bloquea el flujo — mismo fallback
 *  que ya usaba el cliente cuando no tenía los festivos a mano. */
function sumarDiasHabiles(desde: Date, n: number): Date {
  const r = new Date(desde);
  r.setHours(0, 0, 0, 0);
  let agregados = 0;
  while (agregados < n) {
    r.setDate(r.getDate() + 1);
    const dia = r.getDay();
    if (dia !== 0 && dia !== 6) agregados += 1;
  }
  return r;
}

interface CtxTickets {
  vacante: Record<string, unknown>;
  postId: string;
  candidatoId: string;
  candidatoNombre: string;
  herramientas: Record<string, unknown> | undefined;
  uid: string;
}

/** Crea/asegura los tickets de conexión reusando los pre-avisos del perfilamiento
 *  (mismo comportamiento que crearTicketsConexion del cliente). Idempotente por
 *  tipo dentro de la vacante. */
async function crearTicketsConexionServer(ctx: CtxTickets): Promise<number> {
  const { vacante, postId, candidatoId, candidatoNombre, herramientas, uid } = ctx;
  const vacanteId = String((vacante as { id?: string }).id ?? '');
  const cargoNombre = String(vacante.cargo_nombre ?? '');
  const criticidad = String(vacante.criticidad ?? 'Media');
  const ansDias = ANS_DIAS_POR_CRITICIDAD[criticidad] ?? 5;
  const expiracion = sumarDiasHabiles(new Date(), ansDias);

  // Pre-avisos abiertos (creados en el perfilamiento) a reutilizar.
  const preSnap = await db
    .collection('tickets_conexion')
    .where('vacante_id', '==', vacanteId)
    .where('disparado_por', '==', 'automatico_perfilamiento')
    .get();
  const preavisoPorTipo = new Map<string, string>();
  preSnap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const est = String(data.estado ?? '');
    if (est === 'resuelto' || est === 'cancelado' || est === 'no_aplica') return;
    preavisoPorTipo.set(String(data.tipo ?? ''), d.id);
  });

  const plan = planTickets(herramientas, cargoNombre);
  let n = 0;
  for (const item of plan) {
    const titulo = `${TIPO_LABEL[item.tipo] ?? item.tipo} · ${candidatoNombre}`;
    const preavisoId = preavisoPorTipo.get(item.tipo);
    if (preavisoId) {
      await db.collection('tickets_conexion').doc(preavisoId).update({
        postulacion_id: postId,
        candidato_id: candidatoId,
        candidato_nombre: candidatoNombre,
        titulo,
        descripcion: item.descripcion,
        ans_expira_en: Timestamp.fromDate(expiracion),
        ans_dias_habiles: ansDias,
        criticidad,
        disparado_por: 'automatico_terna',
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: uid,
      });
    } else {
      await db.collection('tickets_conexion').add({
        vacante_id: vacanteId,
        vacante_consecutivo: vacante.consecutivo ?? '',
        postulacion_id: postId,
        candidato_id: candidatoId,
        candidato_nombre: candidatoNombre,
        cargo_nombre: cargoNombre,
        empresa_codigo: vacante.empresa_codigo ?? '',
        empresa_nombre: vacante.empresa_nombre ?? '',
        sede_codigo: vacante.sede_codigo ?? '',
        sede_nombre: vacante.sede_nombre ?? '',
        area: AREA_POR_TIPO[item.tipo] ?? 'it',
        tipo: item.tipo,
        titulo,
        descripcion: item.descripcion,
        estado: 'abierto',
        criticidad,
        ans_dias_habiles: ansDias,
        ans_expira_en: Timestamp.fromDate(expiracion),
        fecha_requerida_ingreso: null,
        acuse_recibo_en: null,
        acuse_recibo_por_uid: null,
        acuse_recibo_por_nombre: null,
        resuelto_en: null,
        resuelto_por_uid: null,
        resuelto_por_nombre: null,
        evidencia_url: null,
        notas_resolucion: '',
        bloqueo_razon: null,
        disparado_por: 'automatico_terna',
        creado_en: FieldValue.serverTimestamp(),
        creado_por: uid,
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: uid,
      });
    }
    n += 1;
  }
  return n;
}

/** Denormaliza el resultado de la postulación en el candidato (pool). Espejo de
 *  actualizarResultadoCandidato del cliente. */
async function denormalizarResultado(opts: {
  candidatoId: string;
  resultado: string;
  vacanteId: string;
  vacanteConsecutivo: string;
  motivoDescarte?: string | null;
  uid: string;
}): Promise<void> {
  const { candidatoId, resultado, vacanteId, vacanteConsecutivo, motivoDescarte, uid } = opts;
  const candRef = db.collection('candidatos').doc(candidatoId);
  const snap = await candRef.get();
  if (!snap.exists) return;
  const data = snap.data() as Record<string, unknown>;

  let aptoParaPool = (data.apto_para_pool_futuro as boolean) ?? true;
  let motivoNoApto = (data.motivo_no_apto_pool as string | null) ?? null;
  if (motivoDescarte && !MOTIVOS_RECICLABLES.has(motivoDescarte)) {
    aptoParaPool = false;
    motivoNoApto = `Descarte duro: ${motivoDescarte}`;
  }

  await candRef.update({
    resultado_ultima_postulacion: resultado,
    fecha_ultima_postulacion: Timestamp.now(),
    ultima_vacante_id: vacanteId,
    ultima_vacante_consecutivo: vacanteConsecutivo,
    apto_para_pool_futuro: aptoParaPool,
    motivo_no_apto_pool: motivoNoApto,
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: uid,
  });
}

export const decidirTerna = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const rol = req.auth.token.rol as string | undefined;
  if (!ROLES_DECIDE.includes(rol ?? '')) {
    throw new HttpsError('permission-denied', 'Solo el líder de la vacante puede decidir la terna.');
  }
  const uid = req.auth.uid;
  const postId = String(req.data?.postulacion_id ?? '').trim();
  const aprobado = req.data?.aprobado === true;
  const motivo = req.data?.motivo_descarte ? String(req.data.motivo_descarte) : null;
  const feedback = req.data?.feedback ? String(req.data.feedback).slice(0, 4000) : '';
  if (!postId) throw new HttpsError('invalid-argument', 'Falta postulacion_id.');
  if (!aprobado && !motivo) {
    throw new HttpsError('invalid-argument', 'Un descarte requiere motivo.');
  }

  const nombreDecisor = `${req.auth.token.name ?? ''}`.trim() || 'Líder';

  const resultado = await db.runTransaction(async (tx) => {
    const postRef = db.collection('postulaciones').doc(postId);
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw new HttpsError('not-found', 'La postulación no existe.');
    const post = postSnap.data() as Record<string, unknown>;

    const vacanteId = String(post.vacante_id ?? '');
    if (!vacanteId) throw new HttpsError('failed-precondition', 'La postulación no tiene vacante.');
    const vacRef = db.collection('vacantes').doc(vacanteId);
    const vacSnap = await tx.get(vacRef);
    if (!vacSnap.exists) throw new HttpsError('not-found', 'La vacante no existe.');
    const vac = vacSnap.data() as Record<string, unknown>;

    // El líder solo decide SU vacante. Coordinación y admin pueden en nombre de él.
    if (rol === 'lider' && String(vac.lider_uid ?? '') !== uid) {
      throw new HttpsError('permission-denied', 'Esta terna es de otro líder.');
    }

    // Anti doble-submit / idempotencia: solo se decide desde `en_terna`.
    if (String(post.estado ?? '') !== 'en_terna') {
      throw new HttpsError(
        'failed-precondition',
        'Este candidato ya no está en terna (quizá ya se decidió). Recarga la página.',
      );
    }

    const ahora = FieldValue.serverTimestamp();

    // Decisión (append-only) dentro de la transacción, para atomicidad.
    const decRef = db.collection('decisiones').doc();
    tx.set(decRef, {
      postulacion_id: postId,
      proceso_id: vac.proceso_activo_id ?? null,
      terna_id: null,
      lider_uid: uid,
      lider_nombre: nombreDecisor,
      aprobado,
      feedback_lider: feedback,
      motivo_descarte: aprobado ? null : motivo,
      condiciones_adicionales: null,
      decidido_en: ahora,
    });

    if (aprobado) {
      tx.update(postRef, {
        estado: 'en_examenes_medicos',
        ultima_transicion_estado: ahora,
        'marcas.decidido_en': ahora,
        'marcas.en_examenes_medicos_en': ahora,
        actualizado_en: ahora,
        actualizado_por: uid,
      });
      tx.update(vacRef, {
        estado: 'seleccionado',
        terna_respondida_en: ahora,
        actualizado_en: ahora,
        actualizado_por: uid,
      });
    } else {
      tx.update(postRef, {
        estado: 'descartado_por_lider',
        ultima_transicion_estado: ahora,
        motivo_descarte: motivo,
        razon_descarte: feedback || null,
        descarte_etapa: 'entrevista_lider',
        'marcas.descartado_en': ahora,
        actualizado_en: ahora,
        actualizado_por: uid,
      });
      // El reloj de terna se cierra al primer descarte/aprobación.
      if (vac.terna_enviada_en && !vac.terna_respondida_en) {
        tx.update(vacRef, { terna_respondida_en: ahora, actualizado_en: ahora, actualizado_por: uid });
      }
    }

    return {
      vacante: { ...vac, id: vacanteId },
      candidatoId: String(post.candidato_id ?? ''),
      candidatoNombre: String(post.candidato_nombre ?? ''),
      vacanteId,
      consecutivo: String(vac.consecutivo ?? ''),
    };
  });

  // ── Post-transacción: pool + tickets (aprobar). El examen lo crea solo el
  //    trigger onPostulacionEnExamenes al ver `en_examenes_medicos`. ──────────
  try {
    if (aprobado) {
      await denormalizarResultado({
        candidatoId: resultado.candidatoId,
        resultado: 'contratado',
        vacanteId: resultado.vacanteId,
        vacanteConsecutivo: resultado.consecutivo,
        uid,
      });
      let herramientas: Record<string, unknown> | undefined;
      const procesoId = (resultado.vacante as { proceso_activo_id?: string }).proceso_activo_id;
      if (procesoId) {
        const procSnap = await db.collection('procesos').doc(procesoId).get();
        herramientas = (procSnap.data() as { perfilamiento?: { herramientas_requeridas?: Record<string, unknown> } } | undefined)
          ?.perfilamiento?.herramientas_requeridas;
      }
      await crearTicketsConexionServer({
        vacante: resultado.vacante,
        postId,
        candidatoId: resultado.candidatoId,
        candidatoNombre: resultado.candidatoNombre,
        herramientas,
        uid,
      });
    } else {
      await denormalizarResultado({
        candidatoId: resultado.candidatoId,
        resultado: motivo && MOTIVOS_RECICLABLES.has(motivo) ? 'apto_no_contratado' : 'descartado_lider',
        vacanteId: resultado.vacanteId,
        vacanteConsecutivo: resultado.consecutivo,
        motivoDescarte: motivo,
        uid,
      });
    }
  } catch (e) {
    // La transición ya quedó firme (lo importante). Un fallo en pool/tickets NO
    // debe reventar la decisión del líder; se registra para reconciliar.
    logger.error('[decidirTerna] post-transacción falló', { postId, aprobado, err: e instanceof Error ? e.message : String(e) });
  }

  await db.collection('eventos').add({
    tipo: aprobado ? 'terna_aprobada_lider' : 'terna_descartada_lider',
    postulacion_id: postId,
    vacante_id: resultado.vacanteId,
    aprobado,
    motivo_descarte: aprobado ? null : motivo,
    creado_en: FieldValue.serverTimestamp(),
    creado_por: uid,
  });

  logger.info('[decidirTerna] decidido', { postId, aprobado, rol });
  return { ok: true as const, aprobado };
});
