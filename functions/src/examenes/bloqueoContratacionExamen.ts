/**
 * ¿El examen médico de una postulación impide contratarla? (incidente ET-MOS-1017,
 * 15-oct).
 *
 * Con novedad en el examen, la decisión de continuar es de Cultura y Desarrollo
 * (don Diego, reu Karen 09-jul). En ET-MOS-1017 la persona pasó a contratación
 * desde el desplegable de estado mientras su examen esperaba esa decisión, la
 * carpeta se aprobó (contratada + vacante cerrada) y tres días después Diego
 * decidió que no continuaba. Por eso aprobar la carpeta y registrar la fecha de
 * vinculación —los dos caminos que contratan— consultan esto antes de contratar.
 *
 * Recibe los exámenes de la postulación y devuelve el mensaje para el usuario, o
 * null si el examen no bloquea (sin examen, en curso, apto o anulado).
 */
export function bloqueoPorExamen(
  examenes: Array<Record<string, unknown>>,
  candidato: string,
): string | null {
  const estados = examenes.map((e) => String(e.estado ?? ''));
  const quien = candidato.trim() || 'esta persona';
  if (estados.includes('en_revision_cd')) {
    return (
      `El examen médico de ${quien} tiene novedad y Cultura y Desarrollo (don Diego) aún no decide si continúa. ` +
      'Se puede contratar cuando él marque «Continúa» en Exámenes médicos.'
    );
  }
  if (estados.includes('no_apto')) {
    return (
      `Cultura y Desarrollo decidió que ${quien} no continúa por el examen médico; no se puede contratar. ` +
      'Si la decisión cambió, avísale al administrador de la plataforma.'
    );
  }
  return null;
}
