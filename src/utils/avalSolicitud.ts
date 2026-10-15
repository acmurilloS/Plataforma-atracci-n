/**
 * ¿Cuándo la solicitud EXIGE el aval firmado? (reu Karen + Diego 08-oct)
 *
 *  - Aumento de planta: siempre ("debería tenerlo previo a la solicitud").
 *  - Reemplazo en el que cambia el cargo (p. ej. sale un técnico y entra un
 *    ayudante) o las condiciones (salario, comisiones…) respecto a la persona que
 *    sale: "tanto para abajo como para arriba estamos cambiando la planta".
 *
 * Fuente única en el front; el espejo del servidor está en
 * functions/src/vacantes/condicionesSolicitud.ts y la regla de Firestore
 * `exigeAval` (firestore.rules) aplica lo mismo al CREAR la vacante.
 */

export type MotivoAval = 'aumento_planta' | 'cambio_cargo' | 'cambio_condiciones';

export interface DatosAval {
  tipo_solicitud?: string | null;
  cargo_id?: string | null;
  reemplaza_a_cargo_id?: string | null;
  reemplazo_mismas_condiciones?: boolean | null;
}

export const esAumentoPlanta = (tipo: string | null | undefined) =>
  tipo === 'aumento_planta' || tipo === 'aumento';

export const esReemplazo = (tipo: string | null | undefined) =>
  tipo === 'reemplazo_indefinido' || tipo === 'reemplazo';

/** Motivos por los que esta solicitud exige aval (vacío = no lo exige). */
export function motivosAval(v: DatosAval): MotivoAval[] {
  if (esAumentoPlanta(v.tipo_solicitud)) return ['aumento_planta'];
  if (!esReemplazo(v.tipo_solicitud)) return [];
  const out: MotivoAval[] = [];
  const cargoAnterior = (v.reemplaza_a_cargo_id ?? '').trim();
  if (cargoAnterior && cargoAnterior !== (v.cargo_id ?? '').trim()) out.push('cambio_cargo');
  if (v.reemplazo_mismas_condiciones === false) out.push('cambio_condiciones');
  return out;
}

export const exigeAval = (v: DatosAval) => motivosAval(v).length > 0;

/** Frase para el usuario: por qué se exige el aval. */
export function textoMotivoAval(motivos: MotivoAval[]): string {
  if (motivos.includes('aumento_planta')) return 'Es un aumento de planta';
  const partes: string[] = [];
  if (motivos.includes('cambio_cargo')) partes.push('el cargo es distinto al de la persona que sale');
  if (motivos.includes('cambio_condiciones')) partes.push('las condiciones cambian respecto a la persona que sale');
  const t = partes.join(' y ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
