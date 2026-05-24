import { politicaParaCriticidad } from '../schemas';
import type { CargoDoc, Criticidad } from '../schemas';

/**
 * Validador anti-unicornio para el perfilamiento (paso 3).
 *
 * Detecta incoherencias entre lo que el líder pide (experiencia, skills, idiomas,
 * grados académicos) y lo que ofrece (salario, banda, categoría del cargo).
 *
 * Ataca el dolor que mencionó Maribel: líderes piden "el unicornio" — 8 años de
 * experiencia para un cargo junior, o competencias premium con salario base bajo.
 *
 * Es una **función pura** que corre en cada keystroke del textarea. No llama IA.
 * Para análisis más profundo hay un botón opcional que dispara una Cloud Function
 * con Gemini.
 */

export type SeveridadAlerta = 'info' | 'advertencia' | 'unicornio';

export interface AlertaUnicornio {
  id: string;
  severidad: SeveridadAlerta;
  titulo: string;
  mensaje: string;
  /** Sugerencia accionable: qué bajar, qué subir, qué quitar. */
  sugerencia?: string;
}

interface OpcionesValidador {
  criteriosTexto: string;
  salarioBase: number;
  cargo: CargoDoc | null;
  empresasCompetencia: string[];
  /**
   * Criticidad de la vacante. Se usa para escalar umbrales: Alta = estricto,
   * Baja = más permisivo (la política aplica menos foco humano y por tanto
   * el detector debería sólo gritar lo grave).
   */
  criticidad?: Criticidad;
}

// ─── Diccionarios de keywords ──────────────────────────────────────────

const KEYWORDS_TECNOLOGIAS_PREMIUM = [
  'aws', 'azure', 'gcp', 'google cloud', 'kubernetes', 'docker',
  'terraform', 'devops', 'machine learning', 'data science', 'tensorflow',
  'pytorch', 'sap', 'oracle', 'salesforce', 'powerbi', 'power bi',
  'tableau', 'snowflake', 'databricks', 'react', 'angular', 'vue',
  'node.js', 'python', 'kotlin', 'swift', 'golang', 'rust',
  'microservicios', 'arquitectura de software',
];

const KEYWORDS_CERTIFICACIONES = [
  'pmp', 'scrum master', 'csm', 'itil', 'cobit', 'ccna', 'ccnp',
  'aws certified', 'azure certified', 'google certified', 'cissp',
  'cisa', 'cism', 'six sigma', 'lean', 'cpa', 'cfa',
];

const KEYWORDS_GRADOS = [
  'maestria', 'maestría', 'mba', 'master', 'phd', 'doctorado',
  'especialización', 'especializacion',
];

const KEYWORDS_IDIOMAS_AVANZADOS = [
  'inglés avanzado', 'ingles avanzado', 'inglés fluido', 'ingles fluido',
  'inglés bilingüe', 'ingles bilingue', 'bilingüe', 'bilingue',
  'b2', 'c1', 'c2', 'native', 'nativo', 'portugués avanzado',
  'portugues avanzado', 'francés avanzado', 'frances avanzado',
];

const EMPRESAS_PREMIUM = [
  'google', 'meta', 'facebook', 'amazon', 'microsoft', 'apple',
  'netflix', 'globant', 'mercado libre', 'mercadolibre', 'rappi',
  'bancolombia', 'davivienda', 'ecopetrol', 'isa', 'epm', 'celsia',
  'mckinsey', 'bcg', 'bain', 'deloitte', 'pwc', 'ey',
];

// ─── Helpers ───────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function contiene(textoNorm: string, palabras: string[]): string[] {
  const encontradas: string[] = [];
  for (const p of palabras) {
    const pNorm = normalizar(p);
    if (textoNorm.includes(pNorm)) encontradas.push(p);
  }
  return encontradas;
}

/**
 * Extrae el máximo número de años de experiencia mencionado en el texto.
 * Patrones: "5 años", "5+ años", "5-7 años", "mínimo 5", "5 years".
 */
function extraerAniosExperiencia(textoNorm: string): number | null {
  const patrones = [
    /(\d{1,2})\s*\+?\s*anos?\s+de\s+experiencia/g,
    /experiencia\s+(?:minima\s+)?(?:de\s+)?(\d{1,2})\s*\+?\s*anos?/g,
    /minim[oa]\s+(\d{1,2})\s*\+?\s*anos?/g,
    /(\d{1,2})\s*\+\s*anos?/g,
    /(\d{1,2})\s*-\s*\d{1,2}\s*anos?/g,
    /(\d{1,2})\s+years?\s+of\s+experience/g,
  ];
  let max: number | null = null;
  for (const re of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(textoNorm)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && (max === null || n > max)) max = n;
    }
  }
  return max;
}

function contarIdiomasMencionados(textoNorm: string): number {
  const idiomas = [
    'ingles', 'portugues', 'frances', 'aleman', 'italiano', 'mandarin',
    'japones', 'chino', 'arabe',
  ];
  return idiomas.filter((i) => textoNorm.includes(i)).length;
}

// ─── Validador principal ──────────────────────────────────────────────

export function validarPerfilUnicornio(opts: OpcionesValidador): AlertaUnicornio[] {
  const { criteriosTexto, salarioBase, cargo, empresasCompetencia, criticidad } = opts;
  const alertas: AlertaUnicornio[] = [];

  if (criteriosTexto.trim().length < 20) return alertas;

  // Multiplicador desde la política: 1.0 estricto (Alta), 1.5 permisivo (Baja).
  // Sube los umbrales salariales — al validar contra "salario < $5M", con
  // multiplicador 1.5 efectivamente exige salario < $3.3M para alertar.
  const factor = criticidad ? politicaParaCriticidad(criticidad).validador_unicornio_relajado : 1.0;
  const umbral = (n: number) => n / factor;

  const textoNorm = normalizar(criteriosTexto);
  const anios = extraerAniosExperiencia(textoNorm);
  const idiomas = contarIdiomasMencionados(textoNorm);
  const idiomasAvanzados = contiene(textoNorm, KEYWORDS_IDIOMAS_AVANZADOS);
  const tecnologias = contiene(textoNorm, KEYWORDS_TECNOLOGIAS_PREMIUM);
  const certificaciones = contiene(textoNorm, KEYWORDS_CERTIFICACIONES);
  const grados = contiene(textoNorm, KEYWORDS_GRADOS);

  const empresasPremiumPedidas = empresasCompetencia
    .map(normalizar)
    .filter((e) => EMPRESAS_PREMIUM.some((p) => e.includes(p)));

  // ─── 1. Experiencia desproporcionada vs salario ──────────────────
  if (anios !== null) {
    if (anios >= 8 && salarioBase < umbral(5_000_000)) {
      alertas.push({
        id: 'experiencia-vs-salario-fuerte',
        severidad: 'unicornio',
        titulo: `🦄 ${anios}+ años con salario < $5M`,
        mensaje: `Estás pidiendo ${anios} años de experiencia con salario base de $${salarioBase.toLocaleString('es-CO')}. Profesionales con esa trayectoria piden mínimo $6M-8M en el mercado.`,
        sugerencia: `O subes el salario a banda media-alta o bajas la exigencia a ${Math.max(3, anios - 3)} años.`,
      });
    } else if (anios >= 5 && salarioBase < umbral(3_000_000)) {
      alertas.push({
        id: 'experiencia-vs-salario',
        severidad: 'advertencia',
        titulo: `Senior con salario junior`,
        mensaje: `${anios} años de experiencia + salario base de $${salarioBase.toLocaleString('es-CO')}. Vas a recibir HVs de perfil junior maquillado.`,
        sugerencia: `Baja la exigencia a 2-3 años o sube el salario.`,
      });
    } else if (anios >= 10 && salarioBase < umbral(8_000_000)) {
      alertas.push({
        id: 'experiencia-10anios',
        severidad: 'unicornio',
        titulo: `🦄 10+ años con menos de $8M`,
        mensaje: `Estás buscando un perfil con trayectoria de director con salario de analista senior. Difícil que aparezca.`,
        sugerencia: `Revisa si realmente necesitas 10 años o si 5-7 es suficiente.`,
      });
    }
  }

  // ─── 2. Experiencia vs categoría del cargo ───────────────────────
  if (cargo && anios !== null) {
    if ((cargo.categoria === 'operativo' || cargo.categoria === 'administrativo') && anios >= 5) {
      alertas.push({
        id: 'categoria-vs-experiencia',
        severidad: 'advertencia',
        titulo: `Cargo ${cargo.categoria} pidiendo ${anios}+ años`,
        mensaje: `Los cargos ${cargo.categoria}s típicamente no requieren más de 2-3 años. Estás filtrando candidatos sin razón.`,
        sugerencia: `Reduce a 2 años o reclasifica el cargo a uno técnico/liderazgo.`,
      });
    }
    if (cargo.categoria === 'liderazgo' && anios < 3) {
      alertas.push({
        id: 'liderazgo-poca-exp',
        severidad: 'advertencia',
        titulo: `Liderazgo con poca experiencia`,
        mensaje: `Cargo de liderazgo solo pide ${anios} años. Es muy poco para que la persona pueda liderar equipos efectivamente.`,
        sugerencia: `Sube la exigencia a mínimo 4-5 años.`,
      });
    }
  }

  // ─── 3. Grados académicos vs salario ──────────────────────────────
  if (grados.length > 0 && salarioBase < umbral(5_000_000)) {
    alertas.push({
      id: 'maestria-vs-salario',
      severidad: 'unicornio',
      titulo: `🦄 ${grados[0]} con salario < $5M`,
      mensaje: `Profesionales con ${grados.join(', ')} aspiran a salarios desde $6M. Es muy difícil que alguien con esa formación acepte $${salarioBase.toLocaleString('es-CO')}.`,
      sugerencia: `Considera si la maestría es realmente requisito o un "ideal" que puedes quitar.`,
    });
  }

  // ─── 4. Combo idiomas + skills + salario bajo ─────────────────────
  if ((idiomas >= 2 || idiomasAvanzados.length > 0) && salarioBase < umbral(5_000_000)) {
    alertas.push({
      id: 'idiomas-vs-salario',
      severidad: 'advertencia',
      titulo: `Idiomas avanzados con salario bajo`,
      mensaje: `Estás pidiendo ${idiomasAvanzados.length > 0 ? `idiomas en nivel ${idiomasAvanzados.join(', ')}` : `${idiomas} idiomas`} con salario de $${salarioBase.toLocaleString('es-CO')}. Bilingües B2+ piden mínimo $4.5M-6M.`,
      sugerencia: `Si el inglés no es uso diario, márcalo como "deseable" no "requisito".`,
    });
  }

  // ─── 5. Skills premium + salario bajo ─────────────────────────────
  const totalPremium = tecnologias.length + certificaciones.length;
  if (totalPremium >= 3 && salarioBase < umbral(4_500_000)) {
    alertas.push({
      id: 'skills-premium',
      severidad: 'unicornio',
      titulo: `🦄 ${totalPremium} skills premium con salario < $4.5M`,
      mensaje: `Pides ${[...tecnologias, ...certificaciones].slice(0, 4).join(', ')}${totalPremium > 4 ? '…' : ''}. Cada uno de esos por separado ya empuja el salario a $5M+. Combinados, los candidatos piden $7M+.`,
      sugerencia: `Prioriza 1-2 skills core y marca el resto como deseable.`,
    });
  } else if (totalPremium >= 5 && salarioBase < umbral(7_000_000)) {
    alertas.push({
      id: 'skills-acumuladas',
      severidad: 'advertencia',
      titulo: `Muchos skills técnicos para el salario`,
      mensaje: `${totalPremium} herramientas/certificaciones diferentes. Probablemente estás describiendo a 2-3 personas distintas.`,
      sugerencia: `Quédate con el stack realmente crítico para el día a día.`,
    });
  }

  // ─── 6. Empresas competencia premium + salario bajo ───────────────
  if (empresasPremiumPedidas.length > 0 && salarioBase < umbral(6_000_000)) {
    alertas.push({
      id: 'empresas-premium',
      severidad: 'advertencia',
      titulo: `Competencia premium pero salario en banda baja`,
      mensaje: `Mencionas ${empresasPremiumPedidas.join(', ')} como competencia. Los profesionales de esas empresas ganan ≥$7M-12M.`,
      sugerencia: `Si quieres atraerlos, sube la banda. Si no, revisa qué empresas reflejan tu rango real.`,
    });
  }

  // ─── 7. Validación contra banda del cargo ────────────────────────
  if (cargo?.banda_min != null && cargo?.banda_max != null) {
    const bandaMedia = (cargo.banda_min + cargo.banda_max) / 2;
    if (anios !== null && anios >= 5 && salarioBase < bandaMedia) {
      alertas.push({
        id: 'senior-banda-baja',
        severidad: 'advertencia',
        titulo: `Senior pero salario por debajo de banda media`,
        mensaje: `Pides ${anios} años de experiencia pero el salario ($${salarioBase.toLocaleString('es-CO')}) está bajo la media del cargo ($${bandaMedia.toLocaleString('es-CO')}).`,
        sugerencia: `Para perfil senior, ajusta el salario al menos al promedio de la banda.`,
      });
    }
  }

  // ─── 8. Sin años pero muchos requisitos premium ──────────────────
  if (anios === null && totalPremium >= 4) {
    alertas.push({
      id: 'sin-anios-pero-skills',
      severidad: 'info',
      titulo: `No mencionas años de experiencia`,
      mensaje: `Pides muchas habilidades técnicas (${totalPremium}) pero no aclaras cuántos años necesita. Sé explícito para evitar HVs mal calibradas.`,
      sugerencia: `Agrega "experiencia mínima de X años" al texto.`,
    });
  }

  return alertas;
}

/**
 * Cuenta total de alertas por severidad. Útil para resumir en el banner.
 */
export function resumirAlertas(alertas: AlertaUnicornio[]): {
  total: number;
  unicornio: number;
  advertencia: number;
  info: number;
} {
  return {
    total: alertas.length,
    unicornio: alertas.filter((a) => a.severidad === 'unicornio').length,
    advertencia: alertas.filter((a) => a.severidad === 'advertencia').length,
    info: alertas.filter((a) => a.severidad === 'info').length,
  };
}
