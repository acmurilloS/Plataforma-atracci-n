import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Estampa los datos del integrante + su firma digital sobre el PDF OFICIAL
 * (parametrizado por Calidad) de consentimientos, sin alterar el layout.
 *
 * El PDF base es el archivo oficial servido desde `public/formatos/` (por
 * empresa). Solo se rellenan los espacios en blanco con `drawText`/`drawImage`;
 * NO se re-renderiza ni restiliza el documento. Reemplaza al layout inventado de
 * AutorizacionPage y a la "constancia" suelta de `pdfFirma.ts` para estos dos
 * documentos.
 *
 * ⚠️ COORDENADAS ESTIMADAS: el mapa `MAPA` de abajo está medido a ojo desde el
 * render del PDF (puntos, origen arriba-izquierda). HAY QUE AFINARLO viendo el
 * resultado con la app corriendo (paso de verificación del plan). Tunear solo
 * los números de `MAPA`; la lógica no cambia.
 */

export type TipoConsentimiento = 'datos' | 'imagen';

export interface DatosEstampado {
  nombre: string;
  cedula: string;
  ciudad?: string;
  celular?: string;
  correo?: string;
  cargo?: string;
  /** Fecha legible dd/MM/yyyy. */
  fechaTexto: string;
}

/** Un campo a estampar. `yTop` se mide desde el borde SUPERIOR de la página. */
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
}

interface MapaFormato {
  campos: CampoEstampado[];
  firma?: PosicionFirma;
}

const CODIGOS_EMPRESA = ['EQT', 'CUM', 'ING', 'SLP'];

// Coordenadas afinadas con renders de prueba (puntos PDF; yTop desde arriba).
// Tratamiento de datos: EQT/CUM/ING comparten layout (Letter 612x792); LAP (SLP)
// es más angosto. El formato de tratamiento NO tiene línea de firma → sin firma
// (el consentimiento es el bloque Nombre/Identificación/Celular/Correo).
const MAPA_DATOS_DEFAULT: MapaFormato = {
  campos: [
    { pagina: 0, x: 150, yTop: 224, valor: 'fechaTexto' }, // FECHA: ___
    { pagina: 0, x: 240, yTop: 250, valor: 'nombre' }, // …presente yo, ___
    { pagina: 0, x: 180, yTop: 268, valor: 'cedula' }, // número ___
    { pagina: 0, x: 400, yTop: 268, valor: 'ciudad' }, // expedida en ___
    { pagina: 1, x: 130, yTop: 535, valor: 'nombre' }, // Nombre: ___
    { pagina: 1, x: 160, yTop: 560, valor: 'cedula' }, // Identificación: ___
    { pagina: 1, x: 125, yTop: 585, valor: 'celular' }, // Celular: ___
    { pagina: 1, x: 150, yTop: 610, valor: 'correo' }, // Correo: ___
  ],
};

const MAPA_DATOS_SLP: MapaFormato = {
  campos: [
    { pagina: 0, x: 150, yTop: 198, valor: 'fechaTexto' },
    { pagina: 0, x: 240, yTop: 228, valor: 'nombre' },
    { pagina: 0, x: 365, yTop: 246, valor: 'cedula' },
    { pagina: 0, x: 135, yTop: 264, valor: 'ciudad' },
    { pagina: 1, x: 130, yTop: 588, valor: 'nombre' },
    { pagina: 1, x: 160, yTop: 616, valor: 'cedula' },
    { pagina: 1, x: 125, yTop: 644, valor: 'celular' },
    { pagina: 1, x: 150, yTop: 672, valor: 'correo' },
  ],
};

const MAPA_IMAGEN: MapaFormato = {
  campos: [
    { pagina: 0, x: 420, yTop: 146, valor: 'nombre' }, // el integrante ___
    { pagina: 0, x: 235, yTop: 178, valor: 'cargo' }, // cargo de ___
    { pagina: 1, x: 458, yTop: 452, valor: 'ciudad' }, // ciudad de ___
    { pagina: 1, x: 135, yTop: 470, valor: (d) => d.fechaTexto }, // el día ___
  ],
  firma: { pagina: 1, x: 355, yTop: 462, ancho: 150 }, // línea EL INTEGRANTE
};

function mapaPara(tipo: TipoConsentimiento, empresaCodigo: string): MapaFormato {
  if (tipo === 'imagen') return MAPA_IMAGEN;
  return empresaCodigo === 'SLP' ? MAPA_DATOS_SLP : MAPA_DATOS_DEFAULT;
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
        const w = mapa.firma.ancho;
        const h = (png.height / png.width) * w;
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
