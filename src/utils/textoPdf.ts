/**
 * Texto apto para las fuentes estándar de pdf-lib (Helvetica = WinAnsi/CP1252).
 *
 * Incidente 06-nov (Karen, "Descargar formato oficial" de CU-BOG-1254): la
 * solicitud traía una viñeta pegada desde Word (U+F0B7, fuente Symbol) y pdf-lib
 * revienta con `WinAnsi cannot encode "" (0xf0b7)`: no se podía descargar el
 * formato. Cualquier carácter fuera de WinAnsi (viñetas de Word, ≥, →, emojis,
 * espacios raros) rompía igual la solicitud, los Datos Básicos, la Debida
 * Diligencia, los consentimientos y la carta de bienvenida.
 *
 * Todo texto que se estampa pasa por aquí: lo que WinAnsi sí tiene queda igual
 * (tildes, ñ, “comillas”, –, •, €…); lo demás se reemplaza por su equivalente
 * más cercano o, si no hay ninguno (emojis), se omite. Los saltos de línea se
 * conservan (quien envuelve el texto los usa).
 */

/** Los 27 caracteres que CP1252 agrega en 0x80–0x9F. */
const EXTRA_CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

function codificable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    ch === '\n' ||
    (c >= 0x20 && c <= 0x7e) ||
    (c >= 0xa0 && c <= 0xff) ||
    EXTRA_CP1252.includes(ch)
  );
}

const REEMPLAZOS: Record<string, string> = {
  '\t': ' ',
  '\u2010': '-', // guiones tipográficos
  '\u2011': '-',
  '\u2012': '-',
  '\u2015': '—',
  '\u2212': '-', // signo menos
  '\u2032': "'",
  '\u2033': '"',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2260': '!=',
  '\u2192': '->',
  '\u2190': '<-',
  '\u2794': '->',
  '\u27a2': '->',
  '\u2713': 'v', // ✓
  '\u2714': 'v', // ✔
  '\u2717': 'x',
  '\u2718': 'x',
  '\u25cf': '•', // ●
  '\u25cb': '•', // ○
  '\u25aa': '•', // ▪
  '\u25a0': '•', // ■
  '\u25ba': '•', // ►
  '\u2043': '-', // ⁃
  '\u2219': '•', // ∙
  '\u00b7': '·',
  // Letras que NFKD no descompone.
  '\u0142': 'l', // ł
  '\u0141': 'L', // Ł
  '\u0111': 'd', // đ
  '\u0110': 'D', // Đ
  '\u0131': 'i', // ı
};

/** Invisibles que no aportan nada al formato. */
const INVISIBLES = /[\u200b-\u200f\u2028\u2029\u2060\ufeff\ufe0f]/;

export function textoWinAnsi(s: string): string {
  let out = '';
  for (const ch of String(s ?? '').replace(/\r\n?/g, '\n')) {
    if (codificable(ch)) {
      out += ch;
      continue;
    }
    const r = REEMPLAZOS[ch];
    if (r !== undefined) {
      out += r;
      continue;
    }
    if (INVISIBLES.test(ch)) continue;
    const cp = ch.codePointAt(0) ?? 0;
    // Viñetas y símbolos de Word pegados con fuente Symbol/Wingdings (área privada).
    if (cp >= 0xf000 && cp <= 0xf0ff) {
      out += '•';
      continue;
    }
    if (/\s/.test(ch)) {
      out += ' ';
      continue;
    }
    // Letra con un acento que WinAnsi no tiene (ő, ł…) → su letra base.
    const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (base && [...base].every(codificable)) out += base;
    // Lo demás (emojis, símbolos sin equivalente) se omite.
  }
  return out;
}
