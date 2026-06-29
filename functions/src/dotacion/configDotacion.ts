import { db } from '../utils/admin';

export interface ConfigDotacion {
  /** Gestores + compras a quienes va la solicitud. Vacío → fallback a apoyo compras/bodega. */
  destinatarios: string[];
  /** Modo prueba (demo): redirige el correo a correo_prueba en vez de los reales. */
  modo_prueba: boolean;
  correo_prueba: string[];
  /** Asunto editable ({{nombre}}, {{cargo}}). Vacío → asunto por defecto. */
  plantilla_asunto: string;
  /**
   * Cuerpo editable por Karen (NO hardcodeado). Placeholders disponibles:
   * {{datos}} (bloque integrante/cargo/empresa), {{tabla_tallas}}, {{observaciones}},
   * {{nombre}}, {{cargo}}, {{empresa}}, {{sede}}, {{consecutivo}}. Vacío → cuerpo por defecto.
   */
  plantilla_cuerpo: string;
}

/**
 * Lee `configuracion_global/dotacion`. Provider-agnostic: decide A QUIÉN y con qué
 * texto se envía la solicitud de dotación, sin tocar el cómo. Fallback seguro:
 * sin doc → destinatarios vacíos (el caller cae a apoyo compras/bodega) y textos
 * por defecto. Mismo patrón que `leerConfigExamenes()`.
 */
export async function leerConfigDotacion(): Promise<ConfigDotacion> {
  const arr = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.map((c) => String(c).trim()).filter(Boolean)
      : typeof raw === 'string' && raw.trim()
        ? [raw.trim()]
        : [];
  try {
    const snap = await db.collection('configuracion_global').doc('dotacion').get();
    const d = (snap.exists ? snap.data() : {}) ?? {};
    const correos = arr(d.correo_prueba);
    return {
      destinatarios: arr(d.destinatarios),
      modo_prueba: d.modo_prueba === true && correos.length > 0,
      correo_prueba: correos,
      plantilla_asunto: typeof d.plantilla_asunto === 'string' ? d.plantilla_asunto : '',
      plantilla_cuerpo: typeof d.plantilla_cuerpo === 'string' ? d.plantilla_cuerpo : '',
    };
  } catch {
    return { destinatarios: [], modo_prueba: false, correo_prueba: [], plantilla_asunto: '', plantilla_cuerpo: '' };
  }
}
