import { RODAMIENTO_FIJOS, tieneRodamiento } from './rodamiento';
import type { ComisionTipo } from './comisiones';
import type { VacanteDoc } from '../schemas';

/**
 * Estado y validación del formulario de CONDICIONES de una vacante ya creada.
 * Lo comparten "Editar condiciones" (coordinación, escribe directo) y "Corregir y
 * reenviar" (el líder tras una devolución de GH, reu 08-oct, vía la callable
 * `reenviarSolicitudVacante`, que repite estas reglas en
 * functions/src/vacantes/condicionesSolicitud.ts). Mismas reglas que VacanteForm.
 */
export interface CondicionesForm {
  /** Solo dígitos (el input muestra el formato COP). */
  salario_base: string;
  /** '' = vacante vieja sin clasificar (reu 16-sep). */
  comision_tipo: ComisionTipo | '';
  comision_base: string;
  comision_medicion: string;
  comision_aplica_bolsa: boolean;
  comision_bolsa_detalle: string;
  comisiones_texto: string;
  rodamiento_valor: string;
  /** El desplegable está en "Otro valor…" (valor libre). */
  rodamiento_otro: boolean;
  /** Garantizado desglosado (reu 08-oct): total mensual (incluye el básico) + duración. */
  garantizado_aplica: boolean;
  /** Solo dígitos. */
  garantizado_total_mes: string;
  garantizado_duracion: string;
  /** Observaciones del garantizado (o el texto libre de las vacantes viejas). */
  garantizado_texto: string;
  horario_laboral: string;
  /** '' = vacante de antes del 19-ago, cuando el formulario no lo pedía. */
  tipo_contrato: 'indefinido' | 'temporal' | '';
  tiempo_contrato: string;
}

export function condicionesDesdeVacante(v: VacanteDoc): CondicionesForm {
  // Misma precedencia que `textoRodamiento` (el booleano manda): lo que se ve en
  // pantalla es lo que aparece seleccionado.
  const guardado = (v.rodamiento_valor ?? '').trim();
  const rodamiento = v.rodamiento ? (tieneRodamiento(guardado) ? guardado : '') : 'No aplica';
  const tipoContrato = (v.tipo_contrato ?? '') as CondicionesForm['tipo_contrato'];
  return {
    salario_base: v.salario_base ? String(Math.round(v.salario_base)) : '',
    comision_tipo: v.comision_tipo ?? '',
    comision_base: v.comision_base ?? '',
    comision_medicion: v.comision_medicion ?? '',
    comision_aplica_bolsa: Boolean(v.comision_aplica_bolsa),
    comision_bolsa_detalle: v.comision_bolsa_detalle ?? '',
    comisiones_texto: v.comisiones_texto ?? '',
    rodamiento_valor: rodamiento,
    rodamiento_otro: Boolean(v.rodamiento) && !RODAMIENTO_FIJOS.has(rodamiento),
    garantizado_aplica: v.garantizado_total_mes != null,
    garantizado_total_mes: v.garantizado_total_mes != null ? String(Math.round(v.garantizado_total_mes)) : '',
    garantizado_duracion: v.garantizado_duracion ?? '',
    garantizado_texto: v.garantizado_texto ?? '',
    horario_laboral: v.horario_laboral ?? '',
    tipo_contrato: tipoContrato === 'indefinido' || tipoContrato === 'temporal' ? tipoContrato : '',
    tiempo_contrato: v.tiempo_contrato ?? '',
  };
}

export interface OpcionesValidacion {
  /**
   * La vacante tenía rodamiento = sí pero sin valor guardado (docs viejos): se
   * deja guardar lo demás sin obligar a inventar un monto (se conserva el sí).
   */
  rodamientoSinValorPrevio: boolean;
  /** Exigir el tipo de contrato (al corregir sí; al editar una vacante vieja no). */
  exigirContrato: boolean;
}

export type ResultadoCondiciones =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Valida y arma el patch de condiciones. Los campos que no se tocan se OMITEN
 * (no se pisan con vacíos): rodamiento sin valor previo, contrato sin registrar.
 */
export function validarCondiciones(f: CondicionesForm, opts: OpcionesValidacion): ResultadoCondiciones {
  const salario = Number(f.salario_base);
  if (!Number.isFinite(salario) || salario <= 0) return { ok: false, error: 'Ingresa un salario base válido.' };
  if (salario > 100_000_000) return { ok: false, error: 'El salario está fuera de rango.' };

  const tipoComision = f.comision_tipo === '' ? null : f.comision_tipo;
  const hayComision = tipoComision !== null && tipoComision !== 'ninguna';
  if (hayComision && (!f.comision_base.trim() || !f.comision_medicion.trim())) {
    return {
      ok: false,
      error: 'Para la comisión indica cuál presupuesto o indicadores aplican y cómo se mide.',
    };
  }

  const rodamientoValor = f.rodamiento_valor.trim();
  const otroVacio = f.rodamiento_otro && !rodamientoValor;
  if (otroVacio && !opts.rodamientoSinValorPrevio) {
    return { ok: false, error: 'Escribe el valor del rodamiento o elige "No aplica".' };
  }
  if (!f.rodamiento_otro && !rodamientoValor && !opts.rodamientoSinValorPrevio) {
    return { ok: false, error: 'Elige el auxilio de rodamiento (o "No aplica").' };
  }

  // Garantizado: el total incluye el básico, así que debe ser mayor (reu 08-oct).
  const garantizadoTotal = Number(f.garantizado_total_mes);
  if (f.garantizado_aplica) {
    if (!Number.isFinite(garantizadoTotal) || garantizadoTotal <= Math.round(salario)) {
      return {
        ok: false,
        error:
          'El garantizado total mensual debe ser MAYOR que el salario básico (es básico + lo que se garantiza). Si no hay diferencia, desmarca «Aplica garantizado».',
      };
    }
    if (!f.garantizado_duracion.trim()) {
      return { ok: false, error: 'Indica por cuánto tiempo aplica el garantizado (ej. 3 meses).' };
    }
  }

  if (opts.exigirContrato && !f.tipo_contrato) {
    return { ok: false, error: 'Elige el tipo de contrato (indefinido o temporal).' };
  }
  if (f.tipo_contrato === 'temporal' && !f.tiempo_contrato.trim()) {
    return { ok: false, error: 'Indica el tiempo del contrato temporal (ej. 6 meses).' };
  }

  const patch: Record<string, unknown> = {
    salario_base: Math.round(salario),
    comision_tipo: tipoComision,
    comision_base: hayComision ? f.comision_base.trim() : '',
    comision_medicion: hayComision ? f.comision_medicion.trim() : '',
    comision_aplica_bolsa: hayComision ? f.comision_aplica_bolsa : false,
    comision_bolsa_detalle: hayComision && f.comision_aplica_bolsa ? f.comision_bolsa_detalle.trim() : '',
    // Sin comisión ("ninguna") el concepto no aplica; sin clasificar (null) se conserva.
    comisiones_texto: tipoComision === 'ninguna' ? '' : f.comisiones_texto.trim(),
    garantizado_total_mes: f.garantizado_aplica ? Math.round(garantizadoTotal) : null,
    garantizado_duracion: f.garantizado_aplica ? f.garantizado_duracion.trim() : '',
    garantizado_texto: f.garantizado_texto.trim(),
    horario_laboral: f.horario_laboral.trim(),
  };
  // "Otro valor…" vacío en un doc que ya venía sin valor: no se toca el rodamiento.
  if (!(otroVacio || (!rodamientoValor && opts.rodamientoSinValorPrevio))) {
    patch.rodamiento_valor = rodamientoValor;
    patch.rodamiento = tieneRodamiento(rodamientoValor);
  }
  // Contrato sin registrar (vacante vieja) que nadie eligió: se deja como está.
  if (f.tipo_contrato) {
    patch.tipo_contrato = f.tipo_contrato;
    patch.tiempo_contrato = f.tipo_contrato === 'temporal' ? f.tiempo_contrato.trim() : '';
  }
  return { ok: true, patch };
}
