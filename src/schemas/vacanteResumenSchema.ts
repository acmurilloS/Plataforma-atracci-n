import type { Timestamp } from 'firebase/firestore';
import type { EstadoPostulacion } from './postulacionSchema';

/**
 * Resumen de candidatos EN CURSO por vacante · `vacantes_resumen/{vacanteId}`
 * (BUG B, 10-sep: la tarjeta de Seguimiento pintaba la fase solo con el estado
 * de la vacante, que se queda atrás cuando la analista avanza candidatos desde
 * la lista de postulaciones).
 *
 * Lo mantiene el SERVIDOR (Admin SDK; las reglas bloquean toda escritura) en una
 * colección aparte y no en el doc de la vacante: el `get` de `vacantes` es
 * público y hay pantallas que reescriben formularios en cada snapshot de la
 * vacante. Así Seguimiento muestra la fase real también a los roles que NO leen
 * postulaciones (apoyo, talentos, gerente).
 *
 * `por_estado` cuenta solo postulaciones de esa vacante que siguen en curso: ni
 * estados terminales (descartes, desistió, repostulado) ni `sourceado_por_ia`;
 * sí incluye `contratado`. Nunca guarda descartes, así no expone resultados
 * médicos a quien lo lea.
 */
export interface ResumenVacanteDoc {
  /** = id de la vacante. */
  id: string;
  vacante_id: string;
  /** Postulaciones en curso por estado (solo los estados con conteo). */
  por_estado: Partial<Record<EstadoPostulacion, number>>;
  /** Suma de `por_estado`. */
  total_en_curso: number;
  calculado_en: Timestamp | null;
}
