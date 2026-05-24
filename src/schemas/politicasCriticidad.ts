import type { Criticidad } from './enums';

/**
 * Matriz central de comportamiento del flujo según criticidad.
 *
 * Pedido por Cristina (2026-04-14): el 60-70% de las vacantes son críticas
 * (técnicos / comerciales / algunos directores) y consumen toda la energía
 * del equipo; el 30-40% son no críticas (admin / operativo) y podrían
 * resolverse con flujo simplificado para liberar foco humano hacia las
 * críticas.
 *
 * Esta política define QUÉ pasos del flujograma son obligatorios, opcionales
 * o auto-completables por nivel de criticidad. Vive aquí (una sola fuente de
 * verdad) y se consume en cada paso del flujo (TernaPage, PostulacionDetalle,
 * PerfilamientoPage, validador anti-unicornio, dashboards).
 *
 * IMPORTANTE: la matriz formal de criticidad por cargo sigue pendiente de GH
 * (ATR-21). Hoy la criticidad la pone el líder al crear la vacante, con
 * `cargo.criticidad_sugerida` como default. Cuando GH cierre la matriz,
 * el flujo bloqueará criticidades incoherentes con el cargo.
 */

export interface PoliticaPasoOpcional {
  /** El paso es obligatorio antes de avanzar. */
  obligatorio: boolean;
  /** Si el paso es opcional, hint para la UI sobre cuándo aplica. */
  cuando?: string;
}

export interface PoliticaCriticidad {
  nivel: Criticidad;
  etiqueta: string;
  descripcion: string;

  // ─── Terna (paso 12-14) ────────────────────────────────────────────
  /** Cantidad mínima de candidatos antes de poder cerrar terna y enviar al líder. */
  min_candidatos_terna: number;
  /** Sugerencia visual a la analista (no bloquea, sólo informa). */
  candidatos_terna_sugeridos: number;

  // ─── Pasos del candidato en la postulación ────────────────────────
  /** Paso 6 · pre-entrevista WhatsApp/telefónica. */
  pre_entrevista: PoliticaPasoOpcional;
  /** Paso 7 · pruebas psicotécnicas. */
  pruebas: PoliticaPasoOpcional;
  /** Paso 8 · entrevista presencial/virtual con analista. */
  entrevista_analista: PoliticaPasoOpcional;
  /** Paso 9 · validación de referencias. */
  referencias: PoliticaPasoOpcional;
  /** Cantidad mínima de referencias validadas. */
  min_referencias: number;
  /** Paso 11-12 · informe formal del analista al líder. */
  informe_formal: PoliticaPasoOpcional;
  /** Paso 9-10 · debida diligencia (SAGRILAFT). */
  debida_diligencia: PoliticaPasoOpcional;

  // ─── Validador anti-unicornio (paso 3) ────────────────────────────
  /**
   * Multiplicador de umbrales del validador anti-unicornio.
   * 1.0 = umbrales por defecto (Alta). >1.0 = más permisivo (Baja).
   * Se usa para escalar montos salariales del validador heurístico.
   */
  validador_unicornio_relajado: number;

  // ─── ANS y urgencia ───────────────────────────────────────────────
  /** Días hábiles meta para el ciclo completo (paso 1 → paso 20). */
  meta_dias_habiles_total: number;

  // ─── Visual ───────────────────────────────────────────────────────
  /** Color visual para el banner ("rojo" para Alta, etc.). */
  color: 'rojo' | 'ambar' | 'verde';
}

const ALTA: PoliticaCriticidad = {
  nivel: 'Alta',
  etiqueta: 'Flujo crítico',
  descripcion:
    'Técnico / comercial / director. Todos los pasos del flujograma son obligatorios; el criterio humano del analista pesa en cada decisión.',
  min_candidatos_terna: 2,
  candidatos_terna_sugeridos: 3,
  pre_entrevista: { obligatorio: true },
  pruebas: { obligatorio: true },
  entrevista_analista: { obligatorio: true },
  referencias: { obligatorio: true },
  min_referencias: 2,
  informe_formal: { obligatorio: true },
  debida_diligencia: { obligatorio: true },
  validador_unicornio_relajado: 1.0,
  meta_dias_habiles_total: 10,
  color: 'rojo',
};

const MEDIA: PoliticaCriticidad = {
  nivel: 'Media',
  etiqueta: 'Flujo intermedio',
  descripcion:
    'Roles intermedios. Pruebas y referencias obligatorias, debida diligencia opcional cuando el origen es confiable (referido / base interna).',
  min_candidatos_terna: 2,
  candidatos_terna_sugeridos: 2,
  pre_entrevista: { obligatorio: true },
  pruebas: { obligatorio: true },
  entrevista_analista: { obligatorio: true },
  referencias: { obligatorio: true },
  min_referencias: 1,
  informe_formal: { obligatorio: true },
  debida_diligencia: { obligatorio: false, cuando: 'Opcional si origen = referido o base_interna.' },
  validador_unicornio_relajado: 1.2,
  meta_dias_habiles_total: 12,
  color: 'ambar',
};

const BAJA: PoliticaCriticidad = {
  nivel: 'Baja',
  etiqueta: 'Flujo simplificado',
  descripcion:
    'Admin / operativo. Pre-entrevista + entrevista bastan; pruebas y referencias opcionales para liberar foco humano hacia vacantes críticas.',
  min_candidatos_terna: 1,
  candidatos_terna_sugeridos: 2,
  pre_entrevista: { obligatorio: true },
  pruebas: { obligatorio: false, cuando: 'Opcional. Se aplica sólo si el líder lo pide explícito.' },
  entrevista_analista: { obligatorio: true },
  referencias: { obligatorio: false, cuando: 'Opcional. Mínimo 1 referencia si el candidato es externo.' },
  min_referencias: 0,
  informe_formal: { obligatorio: false, cuando: 'Opcional. Basta con resumen ejecutivo en notas.' },
  debida_diligencia: { obligatorio: false, cuando: 'Opcional. Sólo si maneja efectivo o info sensible.' },
  validador_unicornio_relajado: 1.5,
  meta_dias_habiles_total: 7,
  color: 'verde',
};

const POLITICAS: Record<Criticidad, PoliticaCriticidad> = {
  Alta: ALTA,
  Media: MEDIA,
  Baja: BAJA,
};

export function politicaParaCriticidad(criticidad: Criticidad): PoliticaCriticidad {
  return POLITICAS[criticidad];
}

/**
 * Lista plana de pasos opcionales para mostrar al analista de un vistazo
 * en la pantalla de postulación. Devuelve sólo los pasos que NO son
 * obligatorios para esta criticidad (para resaltar lo que puede saltarse).
 */
export function pasosOpcionalesParaCriticidad(criticidad: Criticidad): Array<{
  paso: string;
  cuando: string;
}> {
  const p = politicaParaCriticidad(criticidad);
  const lista: Array<{ paso: string; cuando: string }> = [];
  if (!p.pruebas.obligatorio) lista.push({ paso: 'Pruebas', cuando: p.pruebas.cuando ?? '' });
  if (!p.referencias.obligatorio) lista.push({ paso: 'Referencias', cuando: p.referencias.cuando ?? '' });
  if (!p.informe_formal.obligatorio) lista.push({ paso: 'Informe formal', cuando: p.informe_formal.cuando ?? '' });
  if (!p.debida_diligencia.obligatorio) {
    lista.push({ paso: 'Debida diligencia', cuando: p.debida_diligencia.cuando ?? '' });
  }
  return lista;
}
