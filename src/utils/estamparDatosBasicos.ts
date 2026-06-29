import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Estampa los Datos Básicos del Integrante sobre el formato OFICIAL Equitel
 * DGH-F-05 v8 (`public/formatos/datos-basicos.pdf`), sin alterar el layout: solo
 * rellena los blancos con `drawText`/`drawImage`.
 *
 * Coordenadas medidas con PyMuPDF sobre el PDF real (Letter 612x792, 1 página) y
 * verificadas visualmente. Origen arriba-izquierda; `yTop` = línea base desde el
 * borde superior (coincide con el `helv` de PyMuPDF = Helvetica de pdf-lib). Los
 * campos de Gestión Humana (caja, ARL, riesgo) y las firmas de GH/nómina quedan
 * en blanco a propósito (los completa GH después).
 */

export interface DatosBasicosEstampado {
  tipo_contratacion?: string; // 'directo' | 'temporal'
  empresa?: string;
  nombres?: string;
  apellidos?: string;
  documento_numero?: string;
  documento_ciudad_dpto?: string;
  direccion?: string;
  telefono_fijo?: string;
  barrio?: string;
  ciudad_domicilio?: string;
  celular?: string;
  fecha_nac_aa?: string;
  fecha_nac_mm?: string;
  fecha_nac_dd?: string;
  lugar_nacimiento?: string;
  estado_civil?: string;
  profesion?: string;
  genero?: string; // 'masculino' | 'femenino'
  rh?: string;
  alergico_a?: string;
  dependiente_medicamento?: string;
  libreta_numero?: string;
  libreta_clase?: string;
  correo?: string;
  cuenta_banco?: string;
  entidad_bancaria?: string;
  afp?: string;
  eps?: string;
  cesantias?: string;
  caja?: string; // GH
  arl?: string; // GH
  riesgo?: string; // GH
  conyuge_nombre?: string;
  conyuge_doc?: string;
  conyuge_profesion?: string;
  conyuge_fecha?: string;
  hijos?: { nombre?: string; aa?: string; mm?: string; dd?: string }[];
  emerg1_nombre?: string;
  emerg1_tel?: string;
  emerg2_nombre?: string;
  emerg2_tel?: string;
  talla_calzado?: string;
  talla_pantalon?: string;
  talla_chaleco?: string;
  talla_guantes?: string;
  talla_overol?: string;
  talla_camisa?: string;
  talla_otros?: string;
  observaciones?: string;
  tiene_familiares?: string; // 'si' | 'no'
  nombre_familiar?: string;
  fecha_firma?: string;
}

type CampoKey = keyof DatosBasicosEstampado;
/** [key, x, yTop, maxAncho?] */
const CAMPOS: [CampoKey, number, number, number?][] = [
  ['empresa', 360, 95, 240],
  ['nombres', 30, 146, 175],
  ['apellidos', 168, 146, 120],
  ['documento_numero', 320, 138, 90],
  ['documento_ciudad_dpto', 418, 146, 145],
  ['direccion', 30, 168, 255],
  ['telefono_fijo', 345, 161, 130],
  ['barrio', 30, 191, 135],
  ['ciudad_domicilio', 175, 191, 115],
  ['celular', 345, 183, 130],
  ['lugar_nacimiento', 175, 214, 115],
  ['estado_civil', 300, 214, 150],
  ['profesion', 30, 238, 260],
  ['rh', 38, 254, 30],
  ['alergico_a', 124, 254, 165],
  ['dependiente_medicamento', 300, 264, 280],
  ['libreta_numero', 30, 291, 135],
  ['libreta_clase', 175, 291, 115],
  ['correo', 300, 291, 280],
  ['cuenta_banco', 30, 332, 135],
  ['entidad_bancaria', 175, 332, 115],
  ['afp', 300, 332, 200],
  ['eps', 30, 358, 260],
  ['cesantias', 300, 358, 200],
  ['caja', 30, 384, 260],
  ['arl', 300, 384, 160],
  ['riesgo', 470, 384, 35],
  ['conyuge_nombre', 30, 421, 260],
  ['conyuge_doc', 300, 421, 200],
  ['conyuge_profesion', 110, 433, 180],
  ['conyuge_fecha', 300, 442, 200],
  ['emerg1_nombre', 66, 562, 220],
  ['emerg1_tel', 348, 562, 130],
  ['emerg2_nombre', 66, 585, 220],
  ['emerg2_tel', 348, 585, 130],
  ['talla_calzado', 30, 628, 130],
  ['talla_pantalon', 175, 628, 120],
  ['talla_chaleco', 300, 628, 110],
  ['talla_guantes', 420, 628, 90],
  ['talla_overol', 30, 650, 130],
  ['talla_camisa', 175, 650, 120],
  ['talla_otros', 300, 650, 280],
  ['observaciones', 30, 674, 560],
  ['nombre_familiar', 340, 709, 260],
  ['fecha_firma', 52, 761, 120],
];

/** Marcas de X en casillas: [key, valorEsperado, x, yTop]. */
const XBOX: [CampoKey, string, number, number][] = [
  ['tipo_contratacion', 'directo', 160, 95],
  ['tipo_contratacion', 'temporal', 242, 95],
  ['genero', 'masculino', 382, 237],
  ['genero', 'femenino', 462, 237],
  ['tiene_familiares', 'si', 212, 709],
  ['tiene_familiares', 'no', 262, 709],
];

const FECHA_NAC: [CampoKey, number, number][] = [
  ['fecha_nac_aa', 52, 219],
  ['fecha_nac_mm', 84, 219],
  ['fecha_nac_dd', 115, 219],
];
const HIJO_Y = [481.6, 495.7, 509.6, 523.6, 537.6];
const HIJO_X = { nombre: 30, aa: 312, mm: 388, dd: 456 };
const FIRMA = { x: 40, yTop: 728, ancho: 140, altoMax: 24 };

export const RUTA_DATOS_BASICOS = '/formatos/datos-basicos.pdf';

export async function estamparDatosBasicos(
  datos: DatosBasicosEstampado,
  firmaPngDataUrl?: string,
): Promise<Blob> {
  const resp = await fetch(RUTA_DATOS_BASICOS);
  if (!resp.ok) throw new Error('No se pudo cargar el formato oficial de Datos Básicos.');
  const base = await resp.arrayBuffer();

  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPages()[0];
  const { height: H } = page.getSize();
  const tinta = rgb(0.05, 0.05, 0.12);

  const draw = (
    texto: unknown,
    x: number,
    yTop: number,
    maxAncho?: number,
    size = 9,
    f = font,
  ) => {
    const s0 = texto === undefined || texto === null ? '' : String(texto);
    if (!s0) return;
    let size2 = size;
    if (maxAncho) {
      while (size2 > 5 && f.widthOfTextAtSize(s0, size2) > maxAncho) size2 -= 0.5;
    }
    page.drawText(s0, { x, y: H - yTop, size: size2, font: f, color: tinta });
  };

  for (const [k, x, yTop, maxA] of CAMPOS) draw(datos[k], x, yTop, maxA);
  for (const [k, x, yTop] of FECHA_NAC) draw(datos[k], x, yTop, undefined, 9);
  for (const [k, val, x, yTop] of XBOX) {
    if (String(datos[k] ?? '').toLowerCase() === val) draw('X', x, yTop, undefined, 10, fontB);
  }

  (datos.hijos ?? []).slice(0, 5).forEach((h, i) => {
    const y = HIJO_Y[i];
    draw(h.nombre, HIJO_X.nombre, y, 255, 8.5);
    draw(h.aa, HIJO_X.aa, y, undefined, 8.5);
    draw(h.mm, HIJO_X.mm, y, undefined, 8.5);
    draw(h.dd, HIJO_X.dd, y, undefined, 8.5);
  });

  if (firmaPngDataUrl) {
    try {
      // El portal pasa un data-URI del canvas; la regeneración (F6) pasa la URL
      // de descarga del PNG en Storage. pdf-lib NO descarga http(s), así que si
      // viene una URL la traemos como binario antes de incrustarla.
      const fuente = /^https?:\/\//i.test(firmaPngDataUrl)
        ? await (await fetch(firmaPngDataUrl)).arrayBuffer()
        : firmaPngDataUrl;
      const png = await pdf.embedPng(fuente);
      let w = FIRMA.ancho;
      let h = (png.height / png.width) * w;
      if (h > FIRMA.altoMax) {
        h = FIRMA.altoMax;
        w = (png.width / png.height) * h;
      }
      page.drawImage(png, { x: FIRMA.x, y: H - FIRMA.yTop - h, width: w, height: h });
    } catch {
      /* la firma es opcional para el estampado */
    }
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
