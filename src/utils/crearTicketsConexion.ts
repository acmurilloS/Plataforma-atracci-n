import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sumarDiasHabiles } from './fechas';
import {
  ANS_DIAS_POR_CRITICIDAD,
  AREA_POR_TIPO,
  TIPO_LABEL,
  type TicketConexionDoc,
  type TipoTicketConexion,
} from '../schemas/ticketConexionSchema';
import type { VacanteDoc, PostulacionDoc, ProcesoDoc } from '../schemas';

/**
 * Disparo automático del Módulo 8 (paso 20).
 *
 * Cuando el líder aprueba un candidato (paso 14), esto:
 *  1. Busca pre-avisos existentes (creados desde el perfilamiento, paso 3) y
 *     los actualiza con el candidato real — sin duplicar.
 *  2. Crea los tipos faltantes (si las herramientas cambiaron entre paso 3 y 14).
 *
 * Tickets siempre disparados:
 *  - accesos_sistemas  → IT (correo + cuentas básicas)
 *  - induccion_talentos → talentos (universidad corporativa)
 *
 * Tickets condicionales (según herramientas_requeridas del perfilamiento):
 *  - computador  → IT
 *  - office      → IT
 *  - labroides   → contabilidad
 *  - dotacion    → compras + bodega
 *
 * Ataca Dolor #4 "candidatos con 15 días sin accesos/equipo".
 */

interface OpcionesTickets {
  vacante: VacanteDoc;
  postulacion: PostulacionDoc;
  procesoActivo: ProcesoDoc | null;
  uid: string;
  festivosIsoSet?: Set<string>;
  disparadoPor?: 'automatico_terna' | 'manual' | 'automatico_perfilamiento';
}

interface TicketPlan {
  tipo: TipoTicketConexion;
  descripcion: string;
}

function planTickets(procesoActivo: ProcesoDoc | null, cargoNombre: string): TicketPlan[] {
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

  const h = procesoActivo?.perfilamiento?.herramientas_requeridas;
  if (h?.computador) {
    tickets.push({
      tipo: 'computador',
      descripcion: `Asignar equipo de cómputo (laptop/desktop) según matriz del cargo ${cargoNombre}.`,
    });
  }
  if (h?.office) {
    tickets.push({
      tipo: 'office',
      descripcion: `Asignar licencia Office / M365 para el ingreso del cargo ${cargoNombre}.`,
    });
  }
  if (h?.labroides) {
    tickets.push({
      tipo: 'labroides',
      descripcion: `Crear usuario en Labroides para el nuevo ${cargoNombre}.`,
    });
  }
  if (h?.dotacion) {
    tickets.push({
      tipo: 'dotacion_compras',
      descripcion: `Gestionar compra de dotación (uniforme/EPP) para el nuevo ${cargoNombre}.`,
    });
    tickets.push({
      tipo: 'dotacion_bodega',
      descripcion: `Preparar entrega física de dotación desde bodega para el nuevo ${cargoNombre}.`,
    });
  }

  return tickets;
}

export async function crearTicketsConexion(opciones: OpcionesTickets): Promise<{
  creados: number;
  actualizados_desde_preaviso: number;
  tipos: TipoTicketConexion[];
}> {
  const {
    vacante,
    postulacion,
    procesoActivo,
    uid,
    festivosIsoSet,
    disparadoPor = 'automatico_terna',
  } = opciones;

  const plan = planTickets(procesoActivo, vacante.cargo_nombre);
  const ansDias = ANS_DIAS_POR_CRITICIDAD[vacante.criticidad];
  const ahora = new Date();
  const expiracion = festivosIsoSet
    ? sumarDiasHabiles(ahora, ansDias, festivosIsoSet)
    : sumarDiasHabiles(ahora, ansDias, new Set<string>());

  // Busca pre-avisos abiertos para esta vacante — los reusaremos.
  const preavisosSnap = await getDocs(
    query(
      collection(db, 'tickets_conexion'),
      where('vacante_id', '==', vacante.id),
      where('disparado_por', '==', 'automatico_perfilamiento'),
    ),
  );
  const preavisosPorTipo = new Map<string, { id: string; data: TicketConexionDoc }>();
  preavisosSnap.forEach((d) => {
    const data = d.data() as TicketConexionDoc;
    if (
      data.estado === 'resuelto' ||
      data.estado === 'cancelado' ||
      data.estado === 'no_aplica'
    ) {
      return;
    }
    preavisosPorTipo.set(data.tipo, { id: d.id, data });
  });

  let creados = 0;
  let actualizadosDesdePreaviso = 0;
  const tipos: TipoTicketConexion[] = [];

  for (const item of plan) {
    const area = AREA_POR_TIPO[item.tipo];
    const titulo = `${TIPO_LABEL[item.tipo]} · ${postulacion.candidato_nombre}`;
    const preaviso = preavisosPorTipo.get(item.tipo);

    if (preaviso) {
      // Reusar el pre-aviso: lo actualizamos con candidato + reseteo de ANS.
      await updateDoc(doc(db, 'tickets_conexion', preaviso.id), {
        postulacion_id: postulacion.id,
        candidato_id: postulacion.candidato_id,
        candidato_nombre: postulacion.candidato_nombre,
        titulo,
        descripcion: item.descripcion,
        ans_expira_en: Timestamp.fromDate(expiracion),
        ans_dias_habiles: ansDias,
        criticidad: vacante.criticidad,
        disparado_por: disparadoPor,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
      actualizadosDesdePreaviso += 1;
    } else {
      await addDoc(collection(db, 'tickets_conexion'), {
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        postulacion_id: postulacion.id,
        candidato_id: postulacion.candidato_id,
        candidato_nombre: postulacion.candidato_nombre,
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

        disparado_por: disparadoPor,

        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
      creados += 1;
    }
    tipos.push(item.tipo);
  }

  return {
    creados,
    actualizados_desde_preaviso: actualizadosDesdePreaviso,
    tipos,
  };
}
