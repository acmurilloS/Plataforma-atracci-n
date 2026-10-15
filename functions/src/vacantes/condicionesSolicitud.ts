/**
 * Lógica PURA (sin Firebase) de la revisión de GH de una solicitud de vacante
 * (reu Karen + Diego 08-oct). Va aparte de las callables para poder probarla sin
 * Firestore:
 *
 *  - `normalizarCambios`: valida y limpia las condiciones que el líder corrige al
 *    reenviar una solicitud devuelta (mismas reglas que VacanteForm).
 *  - `tomarSnapshot`: foto de lo que GH revisa, guardada al devolver.
 *  - `describirCambios`: lista legible de qué cambió entre la foto y lo reenviado,
 *    para que Diego no tenga que comparar a ojo.
 *
 * Espejo de las reglas del front (src/components/vacantes/VacanteForm.tsx y
 * src/utils/condicionesForm.ts): si cambian allá, cambian aquí.
 */
import { textoComisiones } from '../utils/comisiones';

export const COMISION_TIPOS = ['ninguna', 'presupuesto', 'indicadores', 'mixta'] as const;
export const TIPOS_CONTRATO = ['indefinido', 'temporal'] as const;

/** Error de datos del usuario (la callable lo traduce a `invalid-argument`). */
export class ErrorValidacion extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorValidacion';
  }
}

const TIPO_SOLICITUD_LABEL: Record<string, string> = {
  reemplazo_indefinido: 'Reemplazo indefinido',
  aumento_planta: 'Aumento de planta',
  necesidad_temporal: 'Necesidad temporal',
  reemplazo: 'Reemplazo indefinido',
  aumento: 'Aumento de planta',
};

function texto(v: unknown, max: number, campo: string): string {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new ErrorValidacion(`${campo}: máximo ${max} caracteres.`);
  return s;
}

/** True si el valor es un rodamiento real (no vacío ni "No aplica"). */
export function tieneRodamiento(valor: unknown): boolean {
  const v = String(valor ?? '').trim();
  return v !== '' && v.toLowerCase() !== 'no aplica';
}

/** Igual que `textoRodamiento` del front: manda el booleano. */
export function textoRodamiento(v: Record<string, unknown>): string {
  if (v.rodamiento !== true) return 'No aplica';
  return tieneRodamiento(v.rodamiento_valor)
    ? String(v.rodamiento_valor).trim()
    : 'Sí (valor no registrado)';
}

/** "Indefinido", "Temporal · 6 meses" o "Sin registrar" (vacantes de antes del 19-ago). */
export function textoContrato(v: Record<string, unknown>): string {
  const tipo = String(v.tipo_contrato ?? '').trim();
  if (!tipo) return 'Sin registrar';
  const tiempo = String(v.tiempo_contrato ?? '').trim();
  return `${tipo === 'temporal' ? 'Temporal' : 'Indefinido'}${tiempo ? ` · ${tiempo}` : ''}`;
}

export function formatearCOP(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return '—';
  return '$ ' + Math.round(x).toLocaleString('es-CO');
}

/**
 * Valida y normaliza las condiciones que llegan al reenviar. Solo se aceptan los
 * campos de esta lista; lo demás se ignora (la identificación se corrige por
 * `editarDatosVacante`). Devuelve el patch listo para la vacante, con los campos
 * derivados (`rodamiento`, `aval_pendiente`) calculados aquí y no por el cliente.
 */
export function normalizarCambios(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if ('salario_base' in c) {
    const salario = Number(c.salario_base);
    if (!Number.isFinite(salario) || salario <= 0) {
      throw new ErrorValidacion('Ingresa un salario base válido.');
    }
    if (salario > 100_000_000) throw new ErrorValidacion('El salario está fuera de rango.');
    out.salario_base = Math.round(salario);
  }

  if ('comision_tipo' in c) {
    const raw = c.comision_tipo;
    const tipo = raw === null || raw === '' ? null : String(raw);
    if (tipo !== null && !(COMISION_TIPOS as readonly string[]).includes(tipo)) {
      throw new ErrorValidacion('Tipo de comisión inválido.');
    }
    const hay = tipo !== null && tipo !== 'ninguna';
    const base = texto(c.comision_base, 600, 'Comisión (presupuesto/indicadores)');
    const medicion = texto(c.comision_medicion, 600, 'Comisión (cómo se mide)');
    if (hay && (!base || !medicion)) {
      throw new ErrorValidacion(
        'Para la comisión indica cuál presupuesto o indicadores aplican y cómo se mide.',
      );
    }
    const bolsa = hay && c.comision_aplica_bolsa === true;
    out.comision_tipo = tipo;
    out.comision_base = hay ? base : '';
    out.comision_medicion = hay ? medicion : '';
    out.comision_aplica_bolsa = bolsa;
    out.comision_bolsa_detalle = bolsa ? texto(c.comision_bolsa_detalle, 300, 'Detalle de la bolsa') : '';
    // Sin comisión el concepto no aplica; sin clasificar (vacante vieja) se conserva.
    out.comisiones_texto = tipo === 'ninguna' ? '' : texto(c.comisiones_texto, 1500, 'Concepto de la comisión');
  }

  if ('rodamiento_valor' in c) {
    const valor = texto(c.rodamiento_valor, 120, 'Rodamiento');
    out.rodamiento_valor = valor;
    out.rodamiento = tieneRodamiento(valor);
  }

  if ('garantizado_texto' in c) out.garantizado_texto = texto(c.garantizado_texto, 500, 'Garantizado');
  if ('horario_laboral' in c) out.horario_laboral = texto(c.horario_laboral, 200, 'Horario');

  if ('tipo_contrato' in c) {
    const tipo = String(c.tipo_contrato ?? '').trim();
    if (!(TIPOS_CONTRATO as readonly string[]).includes(tipo)) {
      throw new ErrorValidacion('Elige el tipo de contrato (indefinido o temporal).');
    }
    const tiempo = texto(c.tiempo_contrato, 60, 'Tiempo del contrato');
    if (tipo === 'temporal' && !tiempo) {
      throw new ErrorValidacion('Indica el tiempo del contrato temporal (ej. 6 meses).');
    }
    out.tipo_contrato = tipo;
    out.tiempo_contrato = tipo === 'temporal' ? tiempo : '';
  }

  if ('justificacion' in c) {
    const j = texto(c.justificacion, 2000, 'Justificación');
    if (j.length < 20) throw new ErrorValidacion('La justificación debe tener al menos 20 caracteres.');
    out.justificacion = j;
  }

  if ('aval_no_requiere' in c || 'aval_url' in c) {
    const noRequiere = c.aval_no_requiere === true;
    const url = noRequiere ? '' : texto(c.aval_url, 1000, 'Aval');
    if (url && !/^https:\/\//i.test(url)) throw new ErrorValidacion('El enlace del aval no es válido.');
    out.aval_no_requiere = noRequiere;
    out.aval_url = url;
    out.aval_drive_file_id = noRequiere || !url ? '' : texto(c.aval_drive_file_id, 200, 'Aval');
    out.aval_pendiente = !url && !noRequiere;
  }

  return out;
}

/** Campos que GH revisa y que se comparan al reenviar. */
const CAMPOS_SNAPSHOT = [
  'cargo_nombre',
  'empresa_nombre',
  'sede_nombre',
  'unidad_nombre',
  'criticidad',
  'tipo_solicitud',
  'reemplaza_a_nombre',
  'temporalidad_meses',
  'salario_base',
  'comision_tipo',
  'comision_base',
  'comision_medicion',
  'comision_aplica_bolsa',
  'comision_bolsa_detalle',
  'comisiones_texto',
  'rodamiento',
  'rodamiento_valor',
  'garantizado_texto',
  'horario_laboral',
  'tipo_contrato',
  'tiempo_contrato',
  'justificacion',
  'aval_url',
  'aval_no_requiere',
] as const;

/** Foto de las condiciones (solo tipos simples: se guarda tal cual en Firestore). */
export function tomarSnapshot(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_SNAPSHOT) {
    const x = v[k];
    out[k] = x === undefined ? null : typeof x === 'string' ? x.trim() : x;
  }
  return out;
}

function corto(s: string, max = 140): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function valorTexto(x: unknown): string {
  const s = String(x ?? '').trim();
  return s || '—';
}

/**
 * Qué cambió entre la foto tomada al devolver y lo que se reenvía, en frases
 * cortas para el correo de Diego, la bitácora y la tarjeta de Aprobaciones.
 */
export function describirCambios(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const cambio = (etiqueta: string, a: string, b: string) => {
    if (a !== b) out.push(`${etiqueta}: ${corto(a)} → ${corto(b)}`);
  };

  cambio('Cargo', valorTexto(antes.cargo_nombre), valorTexto(despues.cargo_nombre));
  cambio('Empresa', valorTexto(antes.empresa_nombre), valorTexto(despues.empresa_nombre));
  cambio('Sede', valorTexto(antes.sede_nombre), valorTexto(despues.sede_nombre));
  cambio('Unidad', valorTexto(antes.unidad_nombre), valorTexto(despues.unidad_nombre));
  cambio('Criticidad', valorTexto(antes.criticidad), valorTexto(despues.criticidad));
  const tipo = (x: unknown) => TIPO_SOLICITUD_LABEL[String(x ?? '')] ?? valorTexto(x);
  cambio('Tipo de solicitud', tipo(antes.tipo_solicitud), tipo(despues.tipo_solicitud));
  cambio('Reemplaza a', valorTexto(antes.reemplaza_a_nombre), valorTexto(despues.reemplaza_a_nombre));
  const meses = (x: unknown) => {
    const n = Number(x);
    return x !== null && x !== undefined && Number.isFinite(n) && n > 0
      ? `${n} mes${n === 1 ? '' : 'es'}`
      : '—';
  };
  cambio('Duración estimada', meses(antes.temporalidad_meses), meses(despues.temporalidad_meses));
  cambio('Salario base', formatearCOP(antes.salario_base), formatearCOP(despues.salario_base));
  cambio('Comisiones', textoComisiones(antes), textoComisiones(despues));
  cambio('Rodamiento', textoRodamiento(antes), textoRodamiento(despues));
  cambio(
    'Garantizado',
    String(antes.garantizado_texto ?? '').trim() || 'No aplica',
    String(despues.garantizado_texto ?? '').trim() || 'No aplica',
  );
  cambio('Horario', valorTexto(antes.horario_laboral), valorTexto(despues.horario_laboral));
  cambio('Contrato', textoContrato(antes), textoContrato(despues));
  if (String(antes.justificacion ?? '').trim() !== String(despues.justificacion ?? '').trim()) {
    out.push('Justificación actualizada');
  }

  const urlAntes = String(antes.aval_url ?? '').trim();
  const urlDespues = String(despues.aval_url ?? '').trim();
  const noReqAntes = antes.aval_no_requiere === true;
  const noReqDespues = despues.aval_no_requiere === true;
  if (!urlAntes && urlDespues) out.push('Aval firmado adjuntado');
  else if (urlAntes && urlDespues && urlAntes !== urlDespues) out.push('Aval firmado reemplazado');
  else if (urlAntes && !urlDespues && !noReqDespues) out.push('Aval firmado retirado');
  if (!noReqAntes && noReqDespues) out.push('Marcado como «no requiere aval»');
  else if (noReqAntes && !noReqDespues) out.push('Ya no está marcado como «no requiere aval»');

  return out;
}
