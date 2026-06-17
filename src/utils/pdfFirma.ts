import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Genera una constancia PDF de aceptación + firma del candidato (D.2).
 *
 * Es una constancia de firma (no re-renderiza el texto legal completo, que ya
 * vive imprimible en la plataforma): identifica al firmante, el documento que
 * acepta, la fecha, e incrusta la imagen de la firma trazada. Suficiente como
 * evidencia normativa de que el candidato firmó.
 */
export async function generarConstanciaFirma(opts: {
  titulo: string;
  nombre: string;
  documentoIdentidad: string;
  fechaTexto: string;
  firmaPngDataUrl: string;
  empresaNombre?: string;
  parrafos?: string[];
}): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 56;
  const maxW = width - margin * 2;
  let y = height - margin;

  function linea(t: string, f = font, size = 11, dy = size + 7) {
    page.drawText(t, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
    y -= dy;
  }

  function parrafo(t: string, size = 10.5) {
    const words = t.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.17) });
        y -= size + 4;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.17) });
      y -= size + 4;
    }
    y -= 6;
  }

  linea(opts.empresaNombre || 'Organización Equitel', bold, 13);
  linea(opts.titulo, bold, 14);
  y -= 8;
  parrafo(
    `Yo, ${opts.nombre}, identificado(a) con documento No. ${opts.documentoIdentidad}, manifiesto ` +
      `que he leído y ACEPTO el documento "${opts.titulo}", y lo firmo de manera digital en la ` +
      `fecha indicada al pie.`,
  );
  for (const p of opts.parrafos ?? []) parrafo(p);

  // Firma incrustada.
  try {
    const png = await pdf.embedPng(opts.firmaPngDataUrl);
    const fw = 220;
    const fh = (png.height / png.width) * fw;
    y -= 24;
    page.drawImage(png, { x: margin, y: y - fh, width: fw, height: fh });
    y -= fh + 6;
  } catch {
    y -= 30;
  }
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + 240, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  linea('Firma del integrante', font, 10);
  linea(`Documento: ${opts.documentoIdentidad}`, font, 10);
  linea(`Fecha: ${opts.fechaTexto}`, font, 10);

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
