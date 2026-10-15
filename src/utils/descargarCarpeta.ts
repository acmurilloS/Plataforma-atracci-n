import { CATALOGO_DOCUMENTOS_CARPETA, type DocumentoCandidatoDoc } from '../schemas';

/**
 * Descarga de la CARPETA completa en un .zip (reu Karen + Diego 08-oct: "que me
 * permita bajar los documentos que tiene la carpeta"). Se arma en el navegador:
 * los archivos viven en Firebase Storage y el bucket permite GET desde la app
 * (storage.cors.json), así no quedan copias temporales en el servidor.
 *
 * Mismos nombres que el depósito en Drive (functions/src/drive/sincronizarCarpeta.ts):
 * "NN - Nombre del documento [(k)] - cédula.ext", con NN = posición en el
 * catálogo oficial (DGH-F-04), para que la carpeta descargada ordene igual.
 */

export interface ArchivoCarpetaZip {
  nombre: string;
  url: string;
}

function sanitizar(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'sin-nombre'
  );
}

function extensionDe(nombreOUrl: string): string {
  let limpio = nombreOUrl.split('?')[0];
  try {
    limpio = decodeURIComponent(limpio);
  } catch {
    /* nombre con % sueltos: se usa tal cual */
  }
  const m = limpio.match(/\.(pdf|png|jpe?g|docx?|xlsx?|heic|webp)$/i);
  return m ? `.${m[1].toLowerCase()}` : '.pdf';
}

/** Todos los archivos de la carpeta (también los ítems con varios archivos). */
export function archivosDeCarpeta(docs: DocumentoCandidatoDoc[], cedula: string): ArchivoCarpetaZip[] {
  const ordinal = new Map(CATALOGO_DOCUMENTOS_CARPETA.map((it, i) => [it.clave, i]));
  const nombrePorClave = new Map(CATALOGO_DOCUMENTOS_CARPETA.map((it) => [it.clave, it.nombre]));
  const nn = (n: number) => String(n).padStart(2, '0');
  const sufijoCedula = cedula ? ` - ${cedula}` : '';
  const out: ArchivoCarpetaZip[] = [];
  const usados = new Set<string>();
  for (const d of docs) {
    const lista =
      d.archivos && d.archivos.length
        ? d.archivos
        : d.archivo_url
          ? [{ url: d.archivo_url, nombre: d.nombre_archivo ?? '' }]
          : [];
    const num = ordinal.get(d.clave) ?? 90; // fuera del catálogo → al final
    const nombreDoc = nombrePorClave.get(d.clave) ?? d.nombre ?? d.clave;
    lista.forEach((a, i) => {
      const url = String(a.url ?? '').trim();
      if (!url) return;
      const base = `${nn(num)} - ${sanitizar(nombreDoc)}${i === 0 ? '' : ` (${i + 1})`}${sufijoCedula}`;
      const ext = extensionDe(String(a.nombre ?? '') || url);
      let nombre = `${base}${ext}`;
      for (let k = 2; usados.has(nombre); k += 1) nombre = `${base} [${k}]${ext}`;
      usados.add(nombre);
      out.push({ nombre, url });
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Corre `fn` sobre la lista con a lo sumo `n` descargas a la vez. */
async function enParalelo<T>(lista: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (i < lista.length) {
      const x = lista[i];
      i += 1;
      await fn(x);
    }
  });
  await Promise.all(trabajadores);
}

export interface ResultadoZip {
  incluidos: number;
  fallidos: string[];
}

/**
 * Descarga los archivos, arma el .zip (sin recomprimir: PDF y fotos ya vienen
 * comprimidos) y lo guarda. Si algún archivo no baja, el .zip incluye un LEEME
 * con la lista y su enlace, en vez de fallar todo.
 */
/** Arma el .zip sin tocar el DOM (así se puede probar fuera del navegador). */
export async function armarZipCarpeta(
  archivos: ArchivoCarpetaZip[],
  onProgreso?: (hechos: number, total: number) => void,
): Promise<{ blob: Blob; fallidos: string[] }> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const fallidos: ArchivoCarpetaZip[] = [];
  let hechos = 0;
  await enParalelo(archivos, 4, async (a) => {
    try {
      const r = await fetch(a.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      zip.file(a.nombre, await r.arrayBuffer());
    } catch {
      fallidos.push(a);
    }
    hechos += 1;
    onProgreso?.(hechos, archivos.length);
  });
  if (fallidos.length) {
    zip.file(
      'LEEME - archivos que no se pudieron incluir.txt',
      [
        'Estos archivos no se pudieron descargar al armar la carpeta. Ábrelos desde la plataforma:',
        '',
        ...fallidos.map((f) => `- ${f.nombre}`),
      ].join('\r\n'),
    );
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, fallidos: fallidos.map((f) => f.nombre) };
}

export async function descargarCarpetaZip(
  archivos: ArchivoCarpetaZip[],
  nombreZip: string,
  onProgreso?: (hechos: number, total: number) => void,
): Promise<ResultadoZip> {
  const { blob, fallidos } = await armarZipCarpeta(archivos, onProgreso);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreZip;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { incluidos: archivos.length - fallidos.length, fallidos };
}

export function nombreZipCarpeta(candidato: string, cedula: string, consecutivo?: string): string {
  const partes = [`Carpeta - ${candidato || 'Integrante'}`, cedula || consecutivo || ''].filter(Boolean);
  return `${sanitizar(partes.join(' - '))}.zip`;
}
