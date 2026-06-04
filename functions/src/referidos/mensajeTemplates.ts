/**
 * Templates de mensaje para invitar a un técnico a recomendar.
 *
 * El mensaje siempre incluye el link de la landing pública con `?ref=<slug>`
 * para que la postulación que llegue por ese link quede asociada al técnico
 * referidor (tracking para v2 con bono).
 */

export type TemplateKey = 'v1' | 'v2' | 'v3' | 'custom';

export interface VariablesMensaje {
  nombre: string;
  cargo: string;
  sede: string;
  link: string;
}

const TEMPLATES: Record<Exclude<TemplateKey, 'custom'>, string> = {
  v1: `¡Hola {{nombre}}! 👋
Te escribimos de Atracción Equitel. Abrimos una vacante de {{cargo}} en {{sede}}.
¿Conoces a alguien de confianza buscando? Pásale este link, ya queda con tu nombre como referido:
{{link}}
Gracias 🙌`,

  v2: `{{nombre}}, buscamos {{cargo}} para {{sede}}.
¿Conoces a alguien bueno? Este link queda con tu recomendación:
{{link}}`,

  v3: `Hola {{nombre}} 🔧
Abrimos vacante de {{cargo}} en {{sede}}. ¿Conoces gente que le sirva?
Pásales este link, queda con tu nombre:
{{link}}`,
};

/**
 * Mensaje del modo "difusión" — sin nombre, sin `?ref=`. Pierde el tracking
 * individual pero sirve para pegar en una lista de difusión existente.
 */
const TEMPLATE_DIFUSION = `Estamos buscando {{cargo}} para nuestra sede de {{sede}}.
Si conoces a alguien bueno, pásale este link para que aplique:
{{link}}`;

export function interpolar(template: string, vars: VariablesMensaje): string {
  return template
    .replace(/\{\{nombre\}\}/g, vars.nombre)
    .replace(/\{\{cargo\}\}/g, vars.cargo)
    .replace(/\{\{sede\}\}/g, vars.sede)
    .replace(/\{\{link\}\}/g, vars.link);
}

export function obtenerTemplate(key: TemplateKey, custom: string | null): string {
  if (key === 'custom') {
    if (!custom) throw new Error('mensaje_custom requerido cuando template es "custom"');
    return custom;
  }
  return TEMPLATES[key];
}

export function templateDifusion(): string {
  return TEMPLATE_DIFUSION;
}
