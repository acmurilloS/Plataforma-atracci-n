/**
 * Valores estándar del auxilio de rodamiento (Karen, jul-2026). Fuente única
 * usada tanto al crear la vacante (VacanteForm) como en la Solicitud de
 * Integrante. El usuario elige de la lista; "Otro valor…" abre un campo libre.
 */
export const RODAMIENTO_OPCIONES: { valor: string; label: string }[] = [
  { valor: '$460.000', label: '$460.000 · Técnicos postventa / proyectos energía — Mosquera' },
  { valor: '$415.000', label: '$415.000 · Técnicos postventa / proyectos energía — otras sedes' },
  { valor: '$400.000', label: '$400.000 · Comerciales (todas las empresas)' },
  { valor: '$280.000', label: '$280.000 · Mensajeros' },
  { valor: '$365.000', label: '$365.000 · Gestores SST, ingenieros residentes u otros cargos' },
  { valor: 'No aplica', label: 'No aplica' },
];

/** Los valores fijos (para saber si el guardado es uno de la lista o "Otro"). */
export const RODAMIENTO_FIJOS = new Set(RODAMIENTO_OPCIONES.map((o) => o.valor));

/** True si el valor guardado es un rodamiento real (no vacío ni "No aplica"). */
export function tieneRodamiento(valor: string | null | undefined): boolean {
  const v = (valor ?? '').trim();
  return v !== '' && v.toLowerCase() !== 'no aplica';
}

/**
 * Texto del rodamiento para pintar (reu Karen 16-sep: Diego solo veía "Sí/No").
 * Manda el booleano `rodamiento` (es lo que coordinación edita); el valor solo
 * se muestra cuando el booleano dice que sí. Si dice sí pero no hay valor (docs
 * viejos o editados solo con el checkbox), se avisa en vez de inventar un monto.
 */
export function textoRodamiento(v: { rodamiento?: boolean; rodamiento_valor?: string }): string {
  if (!v.rodamiento) return 'No aplica';
  return tieneRodamiento(v.rodamiento_valor) ? v.rodamiento_valor!.trim() : 'Sí (valor no registrado)';
}
