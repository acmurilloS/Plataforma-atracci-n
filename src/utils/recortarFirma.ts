/**
 * recortarFirma · recorta un PNG de firma a su contenido (quita el espacio en
 * blanco/transparente que rodea el trazo) para que se apoye EXACTO sobre la línea
 * de firma, sin flotar. Devuelve un dataURL PNG recortado + dimensiones, o null si
 * no se puede (el llamador usa el original). Corre en el navegador (canvas).
 *
 * Sirve tanto para firmas dibujadas en canvas (fondo transparente, trazo oscuro)
 * como para imágenes subidas normalizadas a fondo blanco (trazo oscuro): detecta
 * el contenido como píxeles opacos y oscuros.
 */
export async function recortarFirma(
  fuente: ArrayBuffer | string,
): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const blob =
      typeof fuente === 'string'
        ? await (await fetch(fuente)).blob()
        : new Blob([fuente], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let minx = c.width, miny = c.height, maxx = 0, maxy = 0, found = false;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const a = data[i + 3];
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (a > 30 && lum < 200) {
          found = true;
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (!found) return null;
    const pad = 3;
    minx = Math.max(0, minx - pad);
    miny = Math.max(0, miny - pad);
    maxx = Math.min(c.width - 1, maxx + pad);
    maxy = Math.min(c.height - 1, maxy + pad);
    const cw = maxx - minx + 1;
    const ch = maxy - miny + 1;
    const c2 = document.createElement('canvas');
    c2.width = cw;
    c2.height = ch;
    const ctx2 = c2.getContext('2d');
    if (!ctx2) return null;
    ctx2.drawImage(c, minx, miny, cw, ch, 0, 0, cw, ch);
    return { url: c2.toDataURL('image/png'), w: cw, h: ch };
  } catch {
    return null;
  }
}
