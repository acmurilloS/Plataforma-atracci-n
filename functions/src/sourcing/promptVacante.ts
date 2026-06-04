interface VacanteParaPrompt {
  cargo_nombre: string;
  empresa_nombre: string;
  sede_nombre: string;
  /** Ciudad limpia (de sedes/{codigo}.ciudad). Si falta, cae a sede_nombre. */
  ciudad?: string;
  unidad_nombre?: string;
  criticidad?: string;
  justificacion?: string;
}

interface CargoCatalogo {
  nombre?: string;
  categoria?: string;
  descripcion?: string;
}

interface PerfilamientoData {
  criterios_texto?: string;
  empresas_competencia?: string[];
  notas?: string;
}

export interface ContextoPrompt {
  vacante: VacanteParaPrompt;
  cargo: CargoCatalogo | null;
  perfilamiento: PerfilamientoData | null;
}

/**
 * Estrategia de búsqueda adaptada a la categoría del cargo. Antes el prompt
 * tenía UNA sola estrategia sesgada a LinkedIn, que funciona para roles
 * digitales/comerciales pero es casi inútil para operativos/técnicos de campo
 * (que no tienen huella en LinkedIn). Devuelve el bloque de fuentes a priorizar
 * y una expectativa realista de cantidad.
 */
function estrategiaPorCategoria(
  categoria: string | undefined,
  cargo: string,
  ciudad: string,
): { fuentes: string; expectativa: string } {
  const cat = (categoria ?? '').toLowerCase();

  if (cat === 'operativo') {
    return {
      fuentes: `Este es un cargo OPERATIVO/de campo. Estas personas casi NO tienen perfil en LinkedIn — búscalas donde sí dejan huella:
- Portales de empleo con hoja de vida pública: \`site:computrabajo.com.co\`, \`site:elempleo.com\`, Magneto.
- Bolsas de empleo del SENA, cajas de compensación y gremios del sector.
- Grupos y páginas de Facebook de oficios ("mecánicos ${ciudad}", "técnicos ${ciudad}").
- Directorios de empresas del sector en ${ciudad} y alrededores.
- LinkedIn es secundario aquí: úsalo solo si el rol tiene componente técnico-formal.`,
      expectativa: `Para roles operativos la huella digital es escasa: si tras varias búsquedas honestas solo encuentras 2–4 perfiles públicos verificables, eso es un resultado válido. NUNCA rellenes con nombres inventados.`,
    };
  }

  if (cat === 'tecnico') {
    return {
      fuentes: `Este es un cargo TÉCNICO. Combina fuentes técnicas y de empleo:
- \`site:github.com\`, \`site:stackoverflow.com\`, foros y comunidades técnicas del área.
- Portales de empleo con HV pública: computrabajo, elempleo, Magneto.
- LinkedIn: \`site:linkedin.com/in "${cargo}" "${ciudad}"\`.
- Páginas "equipo"/"nuestra gente" de las empresas competencia.
- Blogs personales, certificaciones públicas, ponencias técnicas.`,
      expectativa: `Apunta a 5–10 perfiles. Si solo encuentras 3 muy buenos, devuelve esos.`,
    };
  }

  if (cat === 'liderazgo') {
    return {
      fuentes: `Este es un cargo de LIDERAZGO/dirección. Prioriza fuentes donde figuran perfiles senior:
- LinkedIn: \`site:linkedin.com/in "${cargo}" "${ciudad}"\` y variantes de seniority.
- Notas de prensa, entrevistas, paneles y conferencias del sector.
- Páginas corporativas (equipo directivo) de las empresas competencia.
- Directorios de asociaciones gremiales y bases de speakers.`,
      expectativa: `Apunta a 5–8 perfiles de calidad. La cantidad importa menos que la precisión.`,
    };
  }

  // comercial / administrativo / default
  return {
    fuentes: `Combina LinkedIn con portales de empleo y directorios:
- LinkedIn: \`site:linkedin.com/in "${cargo}" "${ciudad}"\` y \`"${cargo}" "${ciudad}" linkedin\`.
- Portales con HV pública: computrabajo, elempleo, Magneto.
- Páginas "equipo"/"nuestra gente" de las empresas competencia.
- Directorios profesionales y gremios del sector en ${ciudad}.`,
    expectativa: `Apunta a 5–10 perfiles. Si solo encuentras 3 muy buenos, devuelve esos.`,
  };
}

/**
 * Construye el prompt que se enviará a Gemini con grounding.
 * Retorna instrucciones + datos estructurados + esquema esperado de respuesta.
 */
export function construirPromptSourcing(ctx: ContextoPrompt): string {
  const { vacante, cargo, perfilamiento } = ctx;

  // Geografía: usamos la ciudad limpia. sede_nombre suele ser texto tipo
  // "Sede Principal" o un nombre interno que envenena las queries de Google.
  const ciudad = (vacante.ciudad && vacante.ciudad.trim()) || vacante.sede_nombre;

  const empresasCompetencia =
    perfilamiento?.empresas_competencia && perfilamiento.empresas_competencia.length > 0
      ? perfilamiento.empresas_competencia.join(', ')
      : '(no especificadas, infiérelas del sector)';

  const { fuentes, expectativa } = estrategiaPorCategoria(
    cargo?.categoria,
    vacante.cargo_nombre,
    ciudad,
  );

  return `Eres un experto en sourcing de talento. Tu tarea: encontrar perfiles públicos REALES en internet de personas que coincidan con la vacante descrita. Cada candidato debe salir de un resultado de búsqueda que tú efectivamente leíste, nunca de tu memoria.

# Vacante
- Cargo: ${vacante.cargo_nombre}
- Empresa contratante: ${vacante.empresa_nombre}
- Ciudad objetivo: ${ciudad}
- Unidad: ${vacante.unidad_nombre ?? 'n/a'}
- Categoría del cargo: ${cargo?.categoria ?? 'n/a'}
- Descripción del cargo: ${cargo?.descripcion ?? 'n/a'}

# Perfilamiento (criterios del líder)
${perfilamiento?.criterios_texto || '(sin criterios específicos — usa el nombre del cargo y la descripción)'}
- Empresas competencia (donde típicamente trabajan estos perfiles): ${empresasCompetencia}
- Notas: ${perfilamiento?.notas || 'n/a'}

# Instrucciones de búsqueda

**Tu trabajo principal es BUSCAR con Google Search.** Ejecuta entre 3 y 8 búsquedas distintas variando keywords, ciudad, empresa y seniority. NO te quedes con una sola búsqueda. Cada candidato debe venir de un resultado real que leíste.

# Estrategia de fuentes (según la categoría del cargo)

${fuentes}

Itera: si una fuente no da, prueba otra. La diversidad de fuentes es clave — no todos los buenos candidatos están en LinkedIn.

# Reglas de calidad (críticas)

1. **Solo personas reales** que efectivamente aparecen en perfiles públicos que encontraste. Si no estás seguro de que la persona existe, NO la incluyas.
2. **Copia las URLs tal cual** aparecen en el resultado de Google Search. NO las construyas a mano a partir del nombre, NO las simplifiques, NO inventes el slug. Si no tienes la URL exacta del resultado, no inventes una.
3. **Prioriza ${ciudad}** y ciudades cercanas. Si encuentras un perfil excelente en otra ciudad, inclúyelo pero indícalo.
4. Considera tanto personas "open to work" como personas ya trabajando en empresas competencia.
5. **Cantidad:** sin mínimo forzado, máximo 15. ${expectativa} Calidad sobre cantidad — es mejor devolver 3 reales que 10 con relleno inventado.
6. Para cada candidato, una justificación específica (mínimo 30 caracteres) que mencione qué criterio concreto del perfilamiento cumple.
7. NO incluyas emails ni teléfonos. Solo datos públicos visibles: nombre, headline, empresa actual, ciudad, link.

# Formato de respuesta (OBLIGATORIO: JSON válido, sin texto adicional)

**CRÍTICO:** Tu respuesta debe ser SIEMPRE un objeto JSON, pase lo que pase.
Si después de buscar no encuentras NINGÚN perfil real, devuelve igualmente el
JSON con la lista vacía: \`{"candidatos": [], "query_usada": "...", "fuentes_consultadas": [...]}\`.
NUNCA respondas con un párrafo de disculpa, explicación o texto en prosa. Si no
hay resultados, el JSON con \`candidatos: []\` ES la respuesta correcta.

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
      "perfil_url": "string (URL completa del perfil público, copiada del resultado)",
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
