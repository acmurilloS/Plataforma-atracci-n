import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

/**
 * Estampa la Solicitud de Integrantes sobre el formato OFICIAL Equitel
 * VIDA-F-01 v08 (`public/formatos/solicitud-integrantes.pdf`), sin alterar el
 * layout: solo rellena los blancos con `drawText`.
 *
 * Coordenadas medidas con PyMuPDF sobre el PDF real (Letter 612x792, 1 página) y
 * verificadas visualmente. Origen arriba-izquierda; `yTop` = línea base desde el
 * borde superior (coincide con el `helv` de PyMuPDF = Helvetica de pdf-lib).
 *
 * Reemplaza la recreación HTML previa (window.print) por el formato controlado
 * por Calidad, con los datos REALES de la vacante (reu Karen 02-jul).
 */

export interface SolicitudEstampado {
  consecutivo?: string;
  fecha_solicitud?: string;
  solicitante?: string; // líder que solicita
  cargo_solicitante?: string;
  cargo_solicita?: string; // cargo de la vacante
  empresa?: string;
  unidad?: string;
  sede?: string;
  cargo_reporta?: string;
  tipo_vinculacion?: string;
  cargo_reemplazo?: string; // "Cargo:" de la fila de vinculación (= cargo de la vacante)
  reemplaza_a?: string;
  tiempo_reemplazo?: string;
  preferible_poseer?: string;
  disponibilidad_viajar?: string;
  trabajo_en?: string;
  salario_base?: string; // solo el número, el "$" ya viene impreso
  rodamiento?: string; // 'Sí' | 'No'
  rodamiento_valor?: string;
  comisiones?: string;
  bonificaciones?: string;
  garantizado_total?: string;
  valor_prestacional?: string;
  valor_no_prestacional?: string;
  garantizado_tiempo?: string;
  observaciones?: string;
}

type CampoKey = keyof SolicitudEstampado;

/** Campos de una línea: [key, x, yTop, maxAncho?, size?]. */
const CAMPOS: [CampoKey, number, number, number?, number?][] = [
  ['consecutivo', 516, 100, 42, 5.5],
  ['fecha_solicitud', 110, 123.3, 200],
  ['solicitante', 110, 138.3, 195],
  ['cargo_solicitante', 375, 138.3, 180],
  ['cargo_solicita', 110, 166.5, 270],
  ['empresa', 418, 166.5, 140],
  ['unidad', 88, 182.3, 125],
  ['sede', 242, 182.3, 120],
  ['cargo_reporta', 440, 182.3, 118],
  ['tipo_vinculacion', 105, 200.7, 90],
  ['cargo_reemplazo', 245, 200.7, 120],
  ['reemplaza_a', 373, 200.7, 70],
  ['tiempo_reemplazo', 470, 200.5, 88],
  ['preferible_poseer', 105, 218.7, 90],
  ['disponibilidad_viajar', 290, 218.7, 24],
  ['trabajo_en', 350, 218.7, 175],
  ['salario_base', 165, 253.3, 110],
  ['rodamiento', 433, 253.3, 55],
  ['rodamiento_valor', 467, 266.1, 90],
  ['garantizado_total', 110, 499.1, 100],
  ['valor_prestacional', 305, 499.1, 105],
  ['valor_no_prestacional', 495, 499.1, 60],
  ['garantizado_tiempo', 115, 523.4, 140],
];

/** Áreas de texto largo con ajuste de línea: [key, x, yTop, maxAncho, size, lineHeight]. */
const AREAS: [CampoKey, number, number, number, number, number][] = [
  ['comisiones', 60, 330, 500, 6.5, 9],
  ['bonificaciones', 60, 430, 500, 6.5, 9],
  ['observaciones', 125, 573, 430, 6.5, 9],
];

export const RUTA_SOLICITUD_INTEGRANTE = '/formatos/solicitud-integrantes.pdf';

function envolver(texto: string, font: PDFFont, size: number, maxAncho: number): string[] {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const w of palabras) {
    const prueba = actual ? `${actual} ${w}` : w;
    if (actual && font.widthOfTextAtSize(prueba, size) > maxAncho) {
      lineas.push(actual);
      actual = w;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function estamparSolicitudIntegrante(datos: SolicitudEstampado): Promise<Blob> {
  const resp = await fetch(RUTA_SOLICITUD_INTEGRANTE);
  if (!resp.ok) throw new Error('No se pudo cargar el formato oficial VIDA-F-01.');
  const base = await resp.arrayBuffer();

  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPages()[0];
  const { height: H } = page.getSize();
  const tinta = rgb(0.05, 0.05, 0.12);

  const draw = (texto: unknown, x: number, yTop: number, maxAncho?: number, size = 6.5) => {
    const s0 = texto === undefined || texto === null ? '' : String(texto);
    if (!s0) return;
    let size2 = size;
    if (maxAncho) {
      while (size2 > 4.5 && font.widthOfTextAtSize(s0, size2) > maxAncho) size2 -= 0.3;
    }
    page.drawText(s0, { x, y: H - yTop, size: size2, font, color: tinta });
  };

  for (const [k, x, yTop, maxA, size] of CAMPOS) draw(datos[k], x, yTop, maxA, size);

  for (const [k, x, yTop, maxA, size, lh] of AREAS) {
    const s0 = datos[k] ? String(datos[k]) : '';
    if (!s0) continue;
    envolver(s0, font, size, maxA)
      .slice(0, 6)
      .forEach((linea, i) => {
        page.drawText(linea, { x, y: H - (yTop + i * lh), size, font, color: tinta });
      });
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
