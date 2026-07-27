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
