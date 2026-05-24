import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UsuarioDoc, VacanteDoc } from '../schemas';

/**
 * Postulación de un empleado interno a una vacante del holding.
 *
 * Cubre lo que Ciesa hacía y era el último gap antes de descontinuar su
 * módulo de gestión de personas: que los empleados puedan postularse a
 * vacantes abiertas (movilidad interna).
 *
 * Comportamiento:
 *  - Idempotente: si el empleado ya tiene candidato (por uid o documento),
 *    lo reusa en vez de crear duplicado.
 *  - Bloquea: un empleado NO puede postularse a una vacante donde él es el
 *    líder (conflicto de interés).
 *  - Bloquea: no se permite doble postulación a la misma vacante.
 *  - Marca: `origen='base_interna'`, `fuente='base_interna'`,
 *    `empleado_uid=uid` para que el analista vea claramente que es interno.
 */

interface OpcionesInterno {
  vacante: VacanteDoc;
  empleado: UsuarioDoc;
  especialidad: string;
  aniosExperiencia: number | null;
  motivacion: string;
}

export async function postularComoInterno(opts: OpcionesInterno): Promise<{
  candidato_id: string;
  postulacion_id: string;
  reutilizado: boolean;
}> {
  const { vacante, empleado, especialidad, aniosExperiencia, motivacion } = opts;

  // Bloqueo 1: no postularse a vacante propia (conflicto de interés).
  if (vacante.lider_uid === empleado.id) {
    throw new Error('No puedes postularte a una vacante que tú abriste como líder.');
  }

  // Bloqueo 2: no doble postulación a la misma vacante.
  const yaPostuladoSnap = await getDocs(
    query(
      collection(db, 'postulaciones'),
      where('vacante_id', '==', vacante.id),
      where('candidato_email', '==', empleado.email),
    ),
  );
  if (!yaPostuladoSnap.empty) {
    throw new Error('Ya te postulaste a esta vacante.');
  }

  // Reusar candidato existente del empleado (por empleado_uid).
  const candExistente = await getDocs(
    query(collection(db, 'candidatos'), where('empleado_uid', '==', empleado.id)),
  );

  let candidatoId: string;
  let reutilizado = false;

  if (!candExistente.empty) {
    candidatoId = candExistente.docs[0].id;
    reutilizado = true;
  } else {
    const candRef = await addDoc(collection(db, 'candidatos'), {
      nombres: empleado.nombre,
      apellidos: empleado.apellido,
      email: empleado.email,
      telefono: '',
      documento_tipo: null,
      documento_numero: null,
      provisional: true,

      ciudad_residencia: null,
      dominio_principal: 'sin_clasificar',
      especialidad_tecnica: especialidad.trim(),
      skills_tags: [],
      anios_experiencia_aproximados: aniosExperiencia,

      origen: 'base_interna',
      magneto_id: null,
      linkedin_url: null,
      fuente_hv_url: null,
      observaciones: motivacion.trim()
        ? `Motivación interna: ${motivacion.trim()}`
        : 'Postulación interna sin motivación.',
      alertas: [],
      alertas_tipos: [],

      empleado_uid: empleado.id,
      empleado_empresa_codigo: empleado.empresa_codigo ?? null,
      empleado_sede_codigo: empleado.sede_codigo ?? null,

      total_postulaciones: 0,
      resultado_ultima_postulacion: 'sin_resultado_aun',
      fecha_ultima_postulacion: null,
      ultima_vacante_id: null,
      ultima_vacante_consecutivo: null,
      pruebas_historial: [],
      apto_para_pool_futuro: true,
      motivo_no_apto_pool: null,
      duplicado_de: null,
      duplicado_detectado_en: null,

      creado_en: serverTimestamp(),
      creado_por: empleado.id,
      actualizado_en: serverTimestamp(),
      actualizado_por: empleado.id,
    });
    candidatoId = candRef.id;
  }

  const ahora = Timestamp.now();
  const postRef = await addDoc(collection(db, 'postulaciones'), {
    candidato_id: candidatoId,
    proceso_id: vacante.proceso_activo_id,
    vacante_id: vacante.id,
    vacante_consecutivo: vacante.consecutivo,
    cargo_nombre: vacante.cargo_nombre,
    candidato_nombre: `${empleado.nombre} ${empleado.apellido}`.trim(),
    candidato_email: empleado.email,
    candidato_telefono: '',
    candidato_cv_url: null,
    estado: 'postulado',
    cumple_criterios: null,
    fuente: 'base_interna',
    marcas: { postulado_en: ahora, postulado_interno_en: ahora },
    fecha_postulacion: ahora,
    ultima_transicion_estado: ahora,
    origen_publicacion_id: null,
    motivo_descarte: null,
    razon_descarte: null,
    descarte_etapa: null,
    analista_uid: vacante.analista_uid ?? null,
    creado_en: serverTimestamp(),
    creado_por: empleado.id,
    actualizado_en: serverTimestamp(),
    actualizado_por: empleado.id,
  });

  return {
    candidato_id: candidatoId,
    postulacion_id: postRef.id,
    reutilizado,
  };
}
