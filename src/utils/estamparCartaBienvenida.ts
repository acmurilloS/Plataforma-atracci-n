import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

/**
 * Estampa la CARTA DE BIENVENIDA oficial de Equitel (firmada por el CEO) sobre el
 * formato real `public/formatos/carta-bienvenida.pdf` (convertido del .docx que
 * envió Karen, reu 18-ago). No recrea la carta: conserva membrete, firma y pie, y
 * solo personaliza tres cosas sobre zonas en blanco (tapar + reescribir):
 *
 *   1. Fecha (arriba a la derecha)   — dinámica (hoy en Bogotá o la que se pase).
 *   2. "Apreciado _____,"            — el nombre del candidato (en negrita).
 *   3. La frase "…también a tu familia" — se le insertan los nombres de familiares.
 *
 * Coordenadas medidas con PyMuPDF sobre el PDF real (Letter 612x792, 1 página),
 * origen arriba-izquierda; mismo enfoque que estamparSolicitudIntegrante.ts.
 */

export interface CartaBienvenidaDatos {
  /** Nombre completo del candidato (va en "Apreciado ___,"). */
  nombre: string;
  /** Nombres de familiares ya formateados (ej. "María (esposa), Juan y Ana"). Opcional. */
  familiares?: string;
  /** Fecha en texto largo (ej. "19 de agosto de 2026"). Por defecto, hoy en Bogotá. */
  fecha?: string;
  /**
   * URL de una plantilla personalizada subida desde admin. Por defecto usa la
   * incluida en la app. OJO: debe mantener el MISMO diseño (posición de fecha,
   * saludo y párrafo de familia) para que los datos caigan en el lugar correcto.
   */
  plantillaUrl?: string;
}

export const RUTA_CARTA_BIENVENIDA = '/formatos/carta-bienvenida.pdf';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Fecha larga en español de HOY en zona Bogotá, sin depender de locale del navegador. */
export function fechaLargaBogotaHoy(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // "2026-08-19"
  const [a, m, d] = partes.split('-').map((n) => parseInt(n, 10));
  return `${d} de ${MESES[(m || 1) - 1]} de ${a}`;
}

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

export async function estamparCartaBienvenida(datos: CartaBienvenidaDatos): Promise<Blob> {
  const resp = await fetch(datos.plantillaUrl?.trim() || RUTA_CARTA_BIENVENIDA);
  if (!resp.ok) throw new Error('No se pudo cargar el formato de la carta de bienvenida.');
  const base = await resp.arrayBuffer();

  const pdf = await PDFDocument.load(base);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPages()[0];
  const H = page.getSize().height;
  const tinta = rgb(0, 0, 0);
  const blanco = rgb(1, 1, 1);

  const nombre = (datos.nombre || '').trim();
  const familiares = (datos.familiares || '').trim();
  const fecha = (datos.fecha || '').trim() || fechaLargaBogotaHoy();

  // 1) Fecha (tapar la baked + reescribir, alineada a la derecha como el original).
  const dateStr = `Medellín, ${fecha}`;
  const dateW = reg.widthOfTextAtSize(dateStr, 12);
  page.drawRectangle({ x: 340, y: H - 137, width: 225, height: 18, color: blanco });
  page.drawText(dateStr, { x: 561 - dateW, y: H - 133.5, size: 12, font: reg, color: tinta });

  // 2) Saludo + nombre del candidato (negrita, como el original).
  page.drawRectangle({ x: 49, y: H - 165, width: 300, height: 18, color: blanco });
  page.drawText(`Apreciado ${nombre},`, { x: 51.2, y: H - 160.8, size: 12, font: bold, color: tinta });

  // 3) Familia: solo si se pasan nombres, se reescribe la frase insertándolos.
  if (familiares) {
    page.drawRectangle({ x: 49, y: H - 277, width: 515, height: 34, color: blanco });
    const parrafo =
      `Hacemos extensiva esta bienvenida también a tu familia (${familiares}); pues para ` +
      'nosotros es importante mantener una relación cercana con tu familia y contar con su ' +
      'participación y apoyo.';
    envolver(parrafo, reg, 12, 512)
      .slice(0, 3)
      .forEach((linea, i) => {
        page.drawText(linea, { x: 51.2, y: H - 256.5 - i * 13.4, size: 12, font: reg, color: tinta });
      });
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
