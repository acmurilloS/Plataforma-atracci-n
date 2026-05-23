interface VacanteParaPrompt {
  cargo_nombre: string;
  empresa_nombre: string;
  sede_nombre: string;
  unidad_nombre?: string;
  criticidad?: string;
  salario_base?: number;
  justificacion?: string;
  comisiones_texto?: string;
  garantizado_texto?: string;
}

interface CargoCatalogo {
  nombre?: string;
  categoria?: string;
  descripcion?: string;
}

interface PerfilamientoData {
  criterios_texto?: string;
  empresas_competencia?: string[];
  herramientas_requeridas?: Record<string, boolean>;
  notas?: string;
}

export interface ContextoPrompt {
  vacante: VacanteParaPrompt;
  cargo: CargoCatalogo | null;
  perfilamiento: PerfilamientoData | null;
}

/**
 * Construye el prompt que se enviará a Gemini con grounding.
 * Retorna instrucciones + datos estructurados + esquema esperado de respuesta.
 */
export function construirPromptSourcing(ctx: ContextoPrompt): string {
  const { vacante, cargo, perfilamiento } = ctx;

  const empresasCompetencia =
    perfilamiento?.empresas_competencia && perfilamiento.empresas_competencia.length > 0
      ? perfilamiento.empresas_competencia.join(', ')
      : '(no especificadas, infiérelas del sector)';

  const herramientas = perfilamiento?.herramientas_requeridas
    ? Object.entries(perfilamiento.herramientas_requeridas)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ') || '(básicas según el cargo)'
    : '(básicas según el cargo)';

  const salario = vacante.salario_base
    ? `${vacante.salario_base.toLocaleString('es-CO')} COP`
    : '(no especificado)';

  return `Eres un experto en sourcing de talento. Tu tarea: encontrar perfiles públicos en internet (LinkedIn, GitHub, blogs profesionales, sitios de empresas) de personas que coincidan con la vacante descrita.

# Vacante
- Cargo: ${vacante.cargo_nombre}
- Empresa contratante: ${vacante.empresa_nombre}
- Sede / ciudad: ${vacante.sede_nombre}
- Unidad: ${vacante.unidad_nombre ?? 'n/a'}
- Criticidad: ${vacante.criticidad ?? 'Media'}
- Salario base ofrecido: ${salario}
- Comisiones: ${vacante.comisiones_texto || 'n/a'}
- Justificación de la apertura: ${vacante.justificacion || 'n/a'}

# Cargo (catálogo)
- Categoría: ${cargo?.categoria ?? 'n/a'}
- Descripción: ${cargo?.descripcion ?? 'n/a'}

# Perfilamiento (criterios del líder)
${perfilamiento?.criterios_texto || '(sin criterios específicos — usa el nombre del cargo y la descripción)'}

- Empresas competencia (donde típicamente trabajan estos perfiles): ${empresasCompetencia}
- Herramientas que el cargo va a usar: ${herramientas}
- Notas: ${perfilamiento?.notas || 'n/a'}

# Instrucciones de búsqueda

**Tu trabajo principal es BUSCAR.** Ejecuta múltiples búsquedas en Google Search con queries diferentes hasta encontrar perfiles reales. No te quedes con una sola búsqueda — itera variando keywords, ciudad, empresa, seniority. La meta es encontrar entre 5 y 15 perfiles.

1. **USA Google Search agresivamente.** Para esta tarea esperas hacer entre 3 y 8 búsquedas distintas. Cada candidato debe venir de un resultado real que tú leíste, no de tu memoria.
2. **Las URLs deben ser exactas.** Cópialas tal cual aparecen en el resultado de Google. No las modifiques, no las simplifiques, no las construyas a mano.
3. **Nombres reales solamente.** Solo personas que efectivamente aparecen en los perfiles públicos que encontraste.
4. **Prioriza ${vacante.sede_nombre}** y ciudades cercanas. Pero si encuentras un perfil excelente en otra ciudad, inclúyelo.
5. Considera tanto personas "open to work" como personas trabajando en empresas competencia. No es requisito que busquen empleo activamente.
6. Devuelve hasta 15 candidatos. Idealmente 5–10. Si después de varias búsquedas honestas solo encuentras 2–3 perfiles muy buenos, devuelve eso.
7. Para cada uno, justificación específica del match (mínimo 30 caracteres). Menciona qué criterio concreto del perfilamiento cumple.

# Estrategia de búsqueda sugerida

Combina queries como estas (adapta a la vacante):
- \`site:linkedin.com/in "${vacante.cargo_nombre}" "${vacante.sede_nombre}"\`
- \`site:linkedin.com/in "${vacante.cargo_nombre}" Colombia\`
- Variantes con sinónimos del cargo, empresas competencia, seniority

# Reglas anti-alucinación

- Si una búsqueda no devuelve resultados, prueba otra query antes de descartar.
- **Copia las URLs tal cual aparecen** en los resultados de Google Search. NO uses solo el slug del nombre. Si Google te muestra \`linkedin.com/in/john-doe-12a3b\`, esa es la URL exacta.
- Confía en lo que ves en los snippets de Google Search. Si el snippet muestra un perfil de LinkedIn, ese perfil existe.
- Devuelve entre 5 y 10 candidatos. Si solo encuentras 3 perfiles muy buenos, devuelve esos. Si encuentras 10 razonables, devuelve esos.
- El analista validará cada perfil manualmente al hacer click — tu trabajo es traer matches plausibles, no perfectos.
6. NO incluyas emails ni teléfonos (solo datos públicos visibles en el perfil: nombre, headline, empresa actual, ciudad, link).

# Formato de respuesta (OBLIGATORIO: JSON válido, sin texto adicional)

\`\`\`json
{
  "candidatos": [
    {
      "nombres": "string",
      "apellidos": "string",
      "headline": "string (la línea de presentación del perfil)",
      "empresa_actual": "string | null",
      "cargo_actual": "string | null",
      "ciudad": "string | null",
      "perfil_url": "string (URL completa del perfil público)",
      "justificacion_match": "string (mínimo 30 caracteres, específica)",
      "score_match": "number 0-100"
    }
  ],
  "query_usada": "string (la query que más utilizaste)",
  "fuentes_consultadas": ["string"]
}
\`\`\`

Devuelve SOLO el JSON, sin envoltura markdown ni texto explicativo.`;
}
