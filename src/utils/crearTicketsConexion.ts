import { Timestamp, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sumarDiasHabiles } from './fechas';
import {
  ANS_DIAS_POR_CRITICIDAD,
  AREA_POR_TIPO,
  TIPO_LABEL,
  type TipoTicketConexion,
} from '../schemas/ticketConexionSchema';
import type { VacanteDoc, PostulacionDoc, ProcesoDoc } from '../schemas';

/**
 * Disparo automático del Módulo 8 (paso 20).
 *
 * Cuando el líder aprueba un candidato (paso 14), esto crea de inmediato los
 * tickets que cada área debe atender para que el ingreso (paso 20) llegue
 * con accesos + equipo + dotación + universidad corporativa listos el día 1.
 *
 * Tickets siempre disparados:
 *  - accesos_sistemas  → IT (correo + cuentas básicas)
 *  - induccion_talentos → talentos (universidad corporativa)
 *
 * Tickets condicionales (según herramientas_requeridas del perfilamiento, paso 3):
 *  - computador  → IT
 *  - office      → IT
 *  - labroides   → contabilidad
 *  - dotacion    → compras + bodega (un ticket en cada cola)
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

  const tipos: TipoTicketConexion[] = [];
  for (const item of plan) {
    const area = AREA_POR_TIPO[item.tipo];
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
      titulo: `${TIPO_LABEL[item.tipo]} · ${postulacion.candidato_nombre}`,
      descripcion: item.descripcion,

      estado: 'abierto',
      criticidad: vacante.criticidad,
      ans_dias_habiles: ansDias,
      ans_expira_en: Timestamp.fromDate(expiracion),

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
    tipos.push(item.tipo);
  }

  return { creados: plan.length, tipos };
}
