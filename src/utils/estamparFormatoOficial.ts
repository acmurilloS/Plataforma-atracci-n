import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Estampa los datos del integrante + su firma digital sobre el PDF OFICIAL
 * (parametrizado por Calidad) de consentimientos, sin alterar el layout.
 *
 * El PDF base es el archivo oficial servido desde `public/formatos/` (por
 * empresa, md5-idéntico a la fuente de Calidad). Solo se rellenan los espacios
 * en blanco con `drawText`/`drawImage`; NO se re-renderiza ni restiliza.
 *
 * COORDENADAS: medidas con PyMuPDF sobre cada PDF real y VERIFICADAS visualmente
 * (render del resultado), POR EMPRESA — porque cada empresa tiene un layout
 * distinto (la FECHA del tratamiento está en y=215 en EQT, 170 en ING, 185 en
 * SLP; y CUM de datos usa una fuente con codificación rota, así que se midió por
 * posición). El origen es arriba-izquierda; `yTop` = línea base desde el borde
 * superior (coincide con el `helv` de PyMuPDF = Helvetica de pdf-lib).
 */

export type TipoConsentimiento = 'datos' | 'imagen';

export interface DatosEstampado {
  nombre: string;
  cedula: string;
  ciudad?: string;
  celular?: string;
  correo?: string;
  cargo?: string;
  /** Fecha legible dd/MM/yyyy (de ahí se derivan día y mes para el acuerdo de imagen). */
  fechaTexto: string;
}

/** Un campo a estampar. `yTop` = línea base desde el borde SUPERIOR. */
interface CampoEstampado {
  pagina: number;
  x: number;
  yTop: number;
  size?: number;
  valor: keyof DatosEstampado | ((d: DatosEstampado) => string);
}

interface PosicionFirma {
  pagina: number;
  x: number;
  yTop: number;
  ancho: number;
  /** Cota de alto (pt) para que la firma no invada la etiqueta de abajo. */
  altoMax?: number;
}

interface MapaFormato {
  campos: CampoEstampado[];
  firma?: PosicionFirma;
}

const CODIGOS_EMPRESA = ['EQT', 'CUM', 'ING', 'SLP'];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
/** "26/06/2026" → "26". */
function diaDe(d: DatosEstampado): string {
  const n = parseInt((d.fechaTexto ?? '').split('/')[0] ?? '', 10);
  return Number.isFinite(n) ? String(n) : '';
}
/** "26/06/2026" → "junio". */
function mesDe(d: DatosEstampado): string {
  const n = parseInt((d.fechaTexto ?? '').split('/')[1] ?? '', 10);
  return MESES[n - 1] ?? '';
}

// ── TRATAMIENTO DE DATOS ──────────────────────────────────────────────────────
// Letter 612x792, 2 pág. Pág 0: FECHA + "presente yo ___ … número ___ expedida
// en ___". Pág 1: bloque Nombre/Identificación/Celular/Correo. NO tiene línea de
// firma manuscrita (la autorización es el bloque diligenciado + la evidencia
// digital). Cada empresa con su propio offset (CUM con fuente rota, medido a ojo).
const DATOS: Record<string, MapaFormato> = {
  EQT: { campos: [
    { pagina: 0, x: 98, yTop: 225, valor: 'fechaTexto' },
    { pagina: 0, x: 200, yTop: 254, valor: 'nombre' },
    { pagina: 0, x: 165, yTop: 270, valor: 'cedula' },
    { pagina: 0, x: 340, yTop: 270, valor: 'ciudad' },
    { pagina: 1, x: 100, yTop: 539, valor: 'nombre' },
    { pagina: 1, x: 125, yTop: 564, valor: 'cedula' },
    { pagina: 1, x: 96, yTop: 588, valor: 'celular' },
    { pagina: 1, x: 128, yTop: 613, valor: 'correo' },
  ] },
  ING: { campos: [
    { pagina: 0, x: 98, yTop: 180, valor: 'fechaTexto' },
    { pagina: 0, x: 200, yTop: 209, valor: 'nombre' },
    { pagina: 0, x: 165, yTop: 226, valor: 'cedula' },
    { pagina: 0, x: 340, yTop: 226, valor: 'ciudad' },
    { pagina: 1, x: 100, yTop: 511, valor: 'nombre' },
    { pagina: 1, x: 125, yTop: 535, valor: 'cedula' },
    { pagina: 1, x: 96, yTop: 560, valor: 'celular' },
    { pagina: 1, x: 128, yTop: 585, valor: 'correo' },
  ] },
  SLP: { campos: [
    { pagina: 0, x: 132, yTop: 195, valor: 'fechaTexto' },
    { pagina: 0, x: 235, yTop: 224, valor: 'nombre' },
    { pagina: 0, x: 330, yTop: 241, valor: 'cedula' },
    { pagina: 0, x: 515, yTop: 241, valor: 'ciudad' },
    { pagina: 1, x: 135, yTop: 590, valor: 'nombre' },
    { pagina: 1, x: 160, yTop: 615, valor: 'cedula' },
    { pagina: 1, x: 132, yTop: 640, valor: 'celular' },
    { pagina: 1, x: 162, yTop: 664, valor: 'correo' },
  ] },
  CUM: { campos: [
    { pagina: 0, x: 100, yTop: 204, valor: 'fechaTexto' },
    { pagina: 0, x: 205, yTop: 233, valor: 'nombre' },
    { pagina: 0, x: 215, yTop: 251, valor: 'cedula' },
    { pagina: 0, x: 475, yTop: 251, valor: 'ciudad' },
    { pagina: 1, x: 105, yTop: 540, valor: 'nombre' },
    { pagina: 1, x: 140, yTop: 564, valor: 'cedula' },
    { pagina: 1, x: 105, yTop: 589, valor: 'celular' },
    { pagina: 1, x: 140, yTop: 614, valor: 'correo' },
  ] },
};

// ── ACUERDO DE IMAGEN Y VOZ ───────────────────────────────────────────────────
// A4 595x842, 2 pág. Pág 0: "el integrante ___ … cargo de ___". Pág 1: "en la
// ciudad de ___, el día ___ de ___ del 2026." + firma del integrante (sobre la
// línea "EL INTEGRANTE C.C."). Layout compartido; CUM/ING con offset en y.
const IMAGEN: Record<string, MapaFormato> = {
  EQT: { campos: [
    { pagina: 0, x: 425, yTop: 145, valor: 'nombre' },
    { pagina: 0, x: 235, yTop: 173, valor: 'cargo' },
    { pagina: 1, x: 445, yTop: 448, valor: 'ciudad' },
    { pagina: 1, x: 75, yTop: 462, valor: diaDe },
    { pagina: 1, x: 136, yTop: 462, valor: mesDe },
  ], firma: { pagina: 1, x: 355, yTop: 465, ancho: 135, altoMax: 42 } },
  CUM: { campos: [
    { pagina: 0, x: 367, yTop: 145, valor: 'nombre' },
    { pagina: 0, x: 200, yTop: 173, valor: 'cargo' },
    { pagina: 1, x: 448, yTop: 404, valor: 'ciudad' },
    { pagina: 1, x: 75, yTop: 418, valor: diaDe },
    { pagina: 1, x: 136, yTop: 418, valor: mesDe },
  ], firma: { pagina: 1, x: 355, yTop: 421, ancho: 135, altoMax: 42 } },
  ING: { campos: [
    { pagina: 0, x: 425, yTop: 145, valor: 'nombre' },
    { pagina: 0, x: 235, yTop: 173, valor: 'cargo' },
    { pagina: 1, x: 448, yTop: 419, valor: 'ciudad' },
    { pagina: 1, x: 75, yTop: 433, valor: diaDe },
    { pagina: 1, x: 136, yTop: 433, valor: mesDe },
  ], firma: { pagina: 1, x: 355, yTop: 436, ancho: 135, altoMax: 42 } },
  SLP: { campos: [
    { pagina: 0, x: 423, yTop: 145, valor: 'nombre' },
    { pagina: 0, x: 235, yTop: 173, valor: 'cargo' },
    { pagina: 1, x: 445, yTop: 448, valor: 'ciudad' },
    { pagina: 1, x: 75, yTop: 462, valor: diaDe },
    { pagina: 1, x: 136, yTop: 462, valor: mesDe },
  ], firma: { pagina: 1, x: 355, yTop: 465, ancho: 135, altoMax: 42 } },
};

function mapaPara(tipo: TipoConsentimiento, empresaCodigo: string): MapaFormato {
  const tabla = tipo === 'imagen' ? IMAGEN : DATOS;
  return tabla[empresaCodigo] ?? tabla.EQT;
}

/** Ruta del PDF oficial por tipo + empresa. */
export function rutaFormatoOficial(tipo: TipoConsentimiento, empresaCodigo?: string | null): string {
  const carpeta = tipo === 'datos' ? 'tratamiento-datos' : 'imagen-voz';
  const cod = CODIGOS_EMPRESA.includes(empresaCodigo ?? '') ? empresaCodigo : 'EQT';
  return `/formatos/${carpeta}/${cod}.pdf`;
}

/**
 * Carga el PDF oficial (por empresa), estampa los datos + la firma y devuelve el
 * PDF resultante. El layout es el oficial intacto; solo se rellenan los blancos.
 */
export async function estamparFormatoOficial(
  tipo: TipoConsentimiento,
  empresaCodigo: string | null | undefined,
  datos: DatosEstampado,
  firmaPngDataUrl?: string,
): Promise<Blob> {
  const cod = CODIGOS_EMPRESA.includes(empresaCodigo ?? '') ? (empresaCodigo as string) : 'EQT';
  const url = rutaFormatoOficial(tipo, cod);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo cargar el formato oficial (${url}).`);
  const base = await resp.arrayBuffer();

  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const paginas = pdf.getPages();
  const mapa = mapaPara(tipo, cod);

  for (const c of mapa.campos) {
    const page = paginas[c.pagina];
    if (!page) continue;
    const valor = typeof c.valor === 'function' ? c.valor(datos) : datos[c.valor];
    if (!valor) continue;
    const { height } = page.getSize();
    page.drawText(String(valor), {
      x: c.x,
      y: height - c.yTop,
      size: c.size ?? 10,
      font,
      color: rgb(0.05, 0.05, 0.1),
    });
  }

  if (mapa.firma && firmaPngDataUrl) {
    try {
      const png = await pdf.embedPng(firmaPngDataUrl);
      const page = paginas[mapa.firma.pagina];
      if (page) {
        const { height } = page.getSize();
        let w = mapa.firma.ancho;
        let h = (png.height / png.width) * w;
        if (mapa.firma.altoMax && h > mapa.firma.altoMax) {
          h = mapa.firma.altoMax;
          w = (png.width / png.height) * h;
        }
        page.drawImage(png, {
          x: mapa.firma.x,
          y: height - mapa.firma.yTop - h,
          width: w,
          height: h,
        });
      }
    } catch {
      /* la firma es opcional para el estampado */
    }
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
