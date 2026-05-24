import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sumarDiasHabiles } from './fechas';
import {
  ANS_DIAS_POR_CRITICIDAD,
  AREA_POR_TIPO,
  DIAS_HABILES_ENTREVISTA_A_INGRESO,
  TIPO_LABEL,
  type TicketConexionDoc,
  type TipoTicketConexion,
} from '../schemas/ticketConexionSchema';
import type { VacanteDoc, ProcesoDoc } from '../schemas';

/**
 * Disparo ADELANTADO de tickets desde el perfilamiento (paso 3).
 *
 * Ataca el Dolor #4 ("candidatos con 15 días sin equipo/accesos"). Refleja
 * lo que Karen ya hace operativamente: copiar a IT desde el primer día del
 * proceso, no esperar a tener candidato aprobado.
 *
 * Los tickets se crean **sin candidato** (`candidato_id: null`,
 * `postulacion_id: null`, `candidato_nombre: ''`) y `disparado_por =
 * 'automatico_perfilamiento'`. Al aprobar candidato en paso 14, el helper
 * `crearTicketsConexion` los actualiza con el candidato real en vez de
 * crear duplicados.
 *
 * IDEMPOTENTE: si la analista re-guarda el perfilamiento (cambia herramientas
 * o fecha de entrevista), no se duplican. Para cada tipo requerido:
 *   - Si ya existe pre-aviso → actualiza fecha_requerida_ingreso.
 *   - Si no existe → crea nuevo.
 *   - Si existe pre-aviso para un tipo que ya NO se requiere
 *     (ej. quitaron labroides) → se marca `no_aplica`.
 */

interface OpcionesPreavisos {
  vacante: VacanteDoc;
  procesoActivo: ProcesoDoc | null;
  uid: string;
  festivosIsoSet?: Set<string>;
}

interface PlanPreaviso {
  tipo: TipoTicketConexion;
  descripcion: string;
}

function planPreavisos(procesoActivo: ProcesoDoc | null, cargoNombre: string): PlanPreaviso[] {
  // Mismos tipos que el flujo normal — pre-aviso = misma cobertura,
  // sólo que se crea desde día 1 sin candidato todavía.
  const items: PlanPreaviso[] = [
    {
      tipo: 'accesos_sistemas',
      descripcion: `Pre-aviso: preparar correo + cuentas básicas para el futuro ${cargoNombre}. Aún sin candidato seleccionado.`,
    },
    {
      tipo: 'induccion_talentos',
      descripcion: `Pre-aviso: agendar inducción en universidad corporativa para el nuevo ${cargoNombre}.`,
    },
  ];

  const h = procesoActivo?.perfilamiento?.herramientas_requeridas;
  if (h?.computador) {
    items.push({
      tipo: 'computador',
      descripcion: `Pre-aviso: reservar equipo de cómputo para el cargo ${cargoNombre}.`,
    });
  }
  if (h?.office) {
    items.push({
      tipo: 'office',
      descripcion: `Pre-aviso: reservar licencia Office / M365 para el cargo ${cargoNombre}.`,
    });
  }
  if (h?.labroides) {
    items.push({
      tipo: 'labroides',
      descripcion: `Pre-aviso: alistar creación de usuario Labroides para el nuevo ${cargoNombre}.`,
    });
  }
  if (h?.dotacion) {
    items.push({
      tipo: 'dotacion_compras',
      descripcion: `Pre-aviso: gestionar compra de dotación (uniforme/EPP) para el nuevo ${cargoNombre}.`,
    });
    items.push({
      tipo: 'dotacion_bodega',
      descripcion: `Pre-aviso: preparar entrega física de dotación desde bodega para el nuevo ${cargoNombre}.`,
    });
  }

  return items;
}

export async function crearPreavisosTickets(opts: OpcionesPreavisos): Promise<{
  creados: number;
  actualizados: number;
  desactivados: number;
}> {
  const { vacante, procesoActivo, uid, festivosIsoSet } = opts;
  const fechaEntrevista = procesoActivo?.perfilamiento?.fecha_entrevista_lider_pactada;
  if (!fechaEntrevista) {
    // Sin fecha de entrevista no podemos calcular fecha_requerida_ingreso.
    return { creados: 0, actualizados: 0, desactivados: 0 };
  }

  const plan = planPreavisos(procesoActivo, vacante.cargo_nombre);
  const tiposRequeridos = new Set(plan.map((p) => p.tipo));

  // Calculo de fecha objetivo de ingreso (5 días hábiles tras entrevista líder).
  const fechaIngreso = sumarDiasHabiles(
    fechaEntrevista.toDate(),
    DIAS_HABILES_ENTREVISTA_A_INGRESO,
    festivosIsoSet ?? new Set<string>(),
  );
  const fechaIngresoTs = Timestamp.fromDate(fechaIngreso);
  const ansDias = ANS_DIAS_POR_CRITICIDAD[vacante.criticidad];

  // Busca pre-avisos existentes para esta vacante.
  const existentesSnap = await getDocs(
    query(
      collection(db, 'tickets_conexion'),
      where('vacante_id', '==', vacante.id),
      where('disparado_por', '==', 'automatico_perfilamiento'),
    ),
  );
  const existentesPorTipo = new Map<string, { id: string; data: TicketConexionDoc }>();
  existentesSnap.forEach((d) => {
    const data = d.data() as TicketConexionDoc;
    existentesPorTipo.set(data.tipo, { id: d.id, data });
  });

  let creados = 0;
  let actualizados = 0;
  let desactivados = 0;

  // 1. Crear o actualizar pre-avisos para cada tipo requerido.
  for (const item of plan) {
    const existente = existentesPorTipo.get(item.tipo);
    const area = AREA_POR_TIPO[item.tipo];
    const titulo = `Pre-aviso · ${TIPO_LABEL[item.tipo]} · ${vacante.cargo_nombre} (${vacante.consecutivo})`;

    if (existente) {
      // Si el ticket existente ya está cerrado (resuelto/cancelado), no lo tocamos.
      if (
        existente.data.estado === 'resuelto' ||
        existente.data.estado === 'cancelado' ||
        existente.data.estado === 'no_aplica'
      ) {
        continue;
      }
      // Actualiza fecha objetivo + descripción + título por si cambiaron.
      await updateDoc(doc(db, 'tickets_conexion', existente.id), {
        titulo,
        descripcion: item.descripcion,
        fecha_requerida_ingreso: fechaIngresoTs,
        ans_expira_en: fechaIngresoTs,
        criticidad: vacante.criticidad,
        ans_dias_habiles: ansDias,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
      actualizados += 1;
    } else {
      await addDoc(collection(db, 'tickets_conexion'), {
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        postulacion_id: null,
        candidato_id: null,
        candidato_nombre: '',
        cargo_nombre: vacante.cargo_nombre,
        empresa_codigo: vacante.empresa_codigo,
        empresa_nombre: vacante.empresa_nombre,
        sede_codigo: vacante.sede_codigo,
        sede_nombre: vacante.sede_nombre,

        area,
        tipo: item.tipo,
        titulo,
        descripcion: item.descripcion,

        estado: 'abierto',
        criticidad: vacante.criticidad,
        ans_dias_habiles: ansDias,
        ans_expira_en: fechaIngresoTs,
        fecha_requerida_ingreso: fechaIngresoTs,

        acuse_recibo_en: null,
        acuse_recibo_por_uid: null,
        acuse_recibo_por_nombre: null,

        resuelto_en: null,
        resuelto_por_uid: null,
        resuelto_por_nombre: null,
        evidencia_url: null,
        notas_resolucion: '',
        bloqueo_razon: null,

        disparado_por: 'automatico_perfilamiento',

        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
      creados += 1;
    }
  }

  // 2. Pre-avisos que ya NO son requeridos (la analista quitó la herramienta):
  //    los marcamos como no_aplica para que las áreas no pierdan tiempo.
  for (const [tipo, existente] of existentesPorTipo.entries()) {
    if (tiposRequeridos.has(tipo as TipoTicketConexion)) continue;
    if (
      existente.data.estado === 'resuelto' ||
      existente.data.estado === 'cancelado' ||
      existente.data.estado === 'no_aplica'
    ) {
      continue;
    }
    await updateDoc(doc(db, 'tickets_conexion', existente.id), {
      estado: 'no_aplica',
      notas_resolucion: 'Marcado no_aplica: la analista quitó este requisito del perfilamiento.',
      actualizado_en: serverTimestamp(),
      actualizado_por: uid,
    });
    desactivados += 1;
  }

  return { creados, actualizados, desactivados };
}
