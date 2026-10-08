/**
 * archivos · preparación ÚNICA de todo archivo que una persona elige para subir
 * (incidente 08-oct-2026: una candidata no pudo subir cédula, cesantías ni
 * certificados desde su celular y el portal le mostró
 * "Firebase Storage: User does not have permission… (storage/unauthorized)").
 *
 * Causa: el celular entregó archivos SIN tipo (sin extensión o desde apps como
 * Drive/correo). El navegador los manda entonces como "application/octet-stream"
 * y las reglas de Storage —que solo aceptan PDF, imagen o Word— los rechazan.
 * Los PDF que genera la propia plataforma sí subían porque llevan el tipo fijo.
 *
 * Por eso aquí NO se confía en `file.type`: el tipo se detecta por los primeros
 * bytes del archivo (la "firma"), se corrige la extensión del nombre, las fotos
 * pesadas o en HEIC se pasan a JPG, y el tamaño se valida DESPUÉS de comprimir.
 * Cualquier error sale en español y entendible (`mensajeErrorSubida`).
 *
 * Toda subida de un archivo elegido por el usuario pasa por `prepararArchivo`
 * y sube `blob` con `contentType` explícito. Ver también `asegurarSesionAnonima`
 * (src/lib/sesionAnonima.ts) para el portal y la landing.
 */

export type FamiliaArchivo = 'pdf' | 'imagen' | 'word';

export const MB = 1024 * 1024;

export interface ArchivoListo {
  /** Lo que se sube: el archivo original o la foto recomprimida. */
  blob: Blob;
  /** Tipo real (detectado por contenido), para `uploadBytes(..., { contentType })`. */
  contentType: string;
  familia: FamiliaArchivo;
  /** Extensión correcta sin punto ('pdf', 'jpg', 'docx'…). */
  extension: string;
  /** Nombre para mostrar/guardar, con la extensión correcta. */
  nombre: string;
  /** Nombre apto para la ruta de Storage (sin espacios ni símbolos). */
  nombreSeguro: string;
  tamano: number;
  comprimido: boolean;
  /** Lo que reportó el navegador (solo para diagnóstico). */
  tipoNavegador: string;
}

/** Error de validación con mensaje listo para mostrar al usuario. */
export class ErrorArchivo extends Error {
  readonly motivo: 'tipo' | 'tamano' | 'vacio' | 'lectura';
  constructor(message: string, motivo: 'tipo' | 'tamano' | 'vacio' | 'lectura') {
    super(message);
    this.name = 'ErrorArchivo';
    this.motivo = motivo;
  }
}

interface Detectado {
  contentType: string;
  familia: FamiliaArchivo;
  extension: string;
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Tipos que se aceptan si la firma no se pudo leer pero el navegador sí los informó. */
const POR_TIPO_NAVEGADOR: Record<string, Detectado> = {
  'application/pdf': { contentType: 'application/pdf', familia: 'pdf', extension: 'pdf' },
  'image/jpeg': { contentType: 'image/jpeg', familia: 'imagen', extension: 'jpg' },
  'image/jpg': { contentType: 'image/jpeg', familia: 'imagen', extension: 'jpg' },
  'image/png': { contentType: 'image/png', familia: 'imagen', extension: 'png' },
  'image/webp': { contentType: 'image/webp', familia: 'imagen', extension: 'webp' },
  'image/heic': { contentType: 'image/heic', familia: 'imagen', extension: 'heic' },
  'image/heif': { contentType: 'image/heif', familia: 'imagen', extension: 'heic' },
  'application/msword': { contentType: 'application/msword', familia: 'word', extension: 'doc' },
  [DOCX]: { contentType: DOCX, familia: 'word', extension: 'docx' },
};

function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nombre.trim());
  return m ? m[1].toLowerCase() : '';
}

function ascii(b: Uint8Array, desde: number, largo: number): string {
  let s = '';
  for (let i = desde; i < Math.min(b.length, desde + largo); i++) s += String.fromCharCode(b[i]);
  return s;
}

function empiezaCon(b: Uint8Array, firma: number[], desde = 0): boolean {
  return firma.every((x, i) => b[desde + i] === x);
}

/** Tipo real por la firma de los primeros bytes. `ext` desempata OLE/ZIP. */
export function detectarPorFirma(b: Uint8Array, ext: string, tipoNavegador = ''): Detectado | null {
  // PDF: la norma admite basura antes de '%PDF-' dentro del primer KB.
  if (ascii(b, 0, 1024).includes('%PDF-')) {
    return { contentType: 'application/pdf', familia: 'pdf', extension: 'pdf' };
  }
  if (empiezaCon(b, [0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', familia: 'imagen', extension: 'jpg' };
  if (empiezaCon(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', familia: 'imagen', extension: 'png' };
  }
  if (ascii(b, 0, 4) === 'GIF8') return { contentType: 'image/gif', familia: 'imagen', extension: 'gif' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    return { contentType: 'image/webp', familia: 'imagen', extension: 'webp' };
  }
  if (ascii(b, 4, 4) === 'ftyp') {
    const marca = ascii(b, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(marca)) {
      return { contentType: 'image/heic', familia: 'imagen', extension: 'heic' };
    }
    if (marca === 'avif' || marca === 'avis') return { contentType: 'image/avif', familia: 'imagen', extension: 'avif' };
  }
  if (empiezaCon(b, [0x49, 0x49, 0x2a, 0x00]) || empiezaCon(b, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { contentType: 'image/tiff', familia: 'imagen', extension: 'tif' };
  }
  if (ascii(b, 0, 2) === 'BM' && ext === 'bmp') return { contentType: 'image/bmp', familia: 'imagen', extension: 'bmp' };
  // Word 97-2003 (contenedor OLE). Excel/PowerPoint usan el mismo contenedor: solo
  // se acepta si el nombre dice .doc o no trae extensión.
  if (empiezaCon(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && (ext === 'doc' || ext === '')) {
    return { contentType: 'application/msword', familia: 'word', extension: 'doc' };
  }
  // .docx es un ZIP: se acepta si el nombre o el navegador dicen Word.
  if (empiezaCon(b, [0x50, 0x4b, 0x03, 0x04]) && (ext === 'docx' || tipoNavegador === DOCX)) {
    return { contentType: DOCX, familia: 'word', extension: 'docx' };
  }
  return null;
}

async function leerCabecera(file: Blob, n = 1024): Promise<Uint8Array> {
  const trozo = file.slice(0, n);
  if (typeof trozo.arrayBuffer === 'function') return new Uint8Array(await trozo.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error ?? new Error('lectura'));
    r.readAsArrayBuffer(trozo);
  });
}

/**
 * Re-codifica una imagen a JPEG (máx. 2560 px por lado). Respeta la orientación
 * EXIF y pone fondo blanco (PNG con transparencia). Devuelve null si el
 * navegador no puede decodificarla (p. ej. HEIC en Chrome): se sube la original.
 */
async function aJpeg(blob: Blob, maxLado = 2560, calidad = 0.85): Promise<Blob | null> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', calidad));
  } catch {
    return null;
  }
}

const NOMBRE_FAMILIA: Record<FamiliaArchivo, string> = {
  pdf: 'PDF',
  imagen: 'foto (JPG o PNG)',
  word: 'Word',
};

function listaPermitidos(permitidos: FamiliaArchivo[]): string {
  const n = permitidos.map((f) => NOMBRE_FAMILIA[f]);
  return n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} o ${n[n.length - 1]}`;
}

function conExtension(nombre: string, extension: string): string {
  const limpio = nombre.trim() || 'archivo';
  const base = limpio.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return `${base}.${extension}`;
}

export function nombreSeguro(nombre: string, max = 80): string {
  const ext = extensionDe(nombre);
  const base = nombre.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const limpio = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, max)
    .replace(/^_+|_+$/g, '');
  return `${limpio || 'archivo'}${ext ? `.${ext}` : ''}`;
}

export interface OpcionesPreparar {
  permitidos: FamiliaArchivo[];
  /** Tope en bytes (el mismo de la regla de Storage de la ruta). */
  maxBytes: number;
  /** Fotos de más de este peso se pasan a JPEG (default 3 MB). false = nunca. */
  comprimirSobre?: number | false;
}

export async function prepararArchivo(file: File, opts: OpcionesPreparar): Promise<ArchivoListo> {
  const tipoNavegador = file.type || '';
  if (!file.size) {
    throw new ErrorArchivo(`"${file.name || 'El archivo'}" está vacío. Vuelve a seleccionarlo.`, 'vacio');
  }
  let cabecera: Uint8Array;
  try {
    cabecera = await leerCabecera(file);
  } catch {
    throw new ErrorArchivo(
      `No pudimos leer "${file.name || 'el archivo'}". Si está en la nube (Drive, correo), descárgalo primero al celular y vuelve a intentarlo.`,
      'lectura',
    );
  }
  const ext = extensionDe(file.name);
  const detectado = detectarPorFirma(cabecera, ext, tipoNavegador) ?? POR_TIPO_NAVEGADOR[tipoNavegador] ?? null;

  if (!detectado || !opts.permitidos.includes(detectado.familia)) {
    const solo = listaPermitidos(opts.permitidos);
    const pista = opts.permitidos.includes('imagen')
      ? ' Si es un documento, guárdalo o expórtalo como PDF; si es una foto, tómala de nuevo o súbela como JPG.'
      : opts.permitidos.includes('pdf')
        ? ' Guárdalo o expórtalo como PDF e inténtalo de nuevo.'
        : '';
    throw new ErrorArchivo(
      `"${file.name || 'El archivo'}" no es un ${solo} válido, así que no se puede subir.${pista}`,
      'tipo',
    );
  }

  let blob: Blob = file;
  let actual = detectado;
  let comprimido = false;
  const umbral = opts.comprimirSobre === undefined ? 3 * MB : opts.comprimirSobre;
  const esFotoComprimible = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(
    detectado.contentType,
  );
  // HEIC se intenta pasar a JPG siempre: en Windows casi nadie lo puede abrir.
  if (
    esFotoComprimible &&
    umbral !== false &&
    (file.size > umbral || detectado.contentType === 'image/heic' || detectado.contentType === 'image/heif')
  ) {
    const jpeg = await aJpeg(file);
    if (jpeg && (jpeg.size < file.size || detectado.contentType !== 'image/jpeg')) {
      blob = jpeg;
      actual = { contentType: 'image/jpeg', familia: 'imagen', extension: 'jpg' };
      comprimido = true;
    }
  }

  if (blob.size > opts.maxBytes) {
    const mb = (blob.size / MB).toFixed(1);
    const max = Math.round(opts.maxBytes / MB);
    const pista =
      actual.familia === 'pdf'
        ? ' Comprímelo (por ejemplo en ilovepdf.com/es/comprimir_pdf) o divídelo en partes.'
        : actual.familia === 'imagen'
          ? ' Toma la foto con menor resolución o envíala como PDF.'
          : '';
    throw new ErrorArchivo(`"${file.name}" pesa ${mb} MB y el máximo es ${max} MB.${pista}`, 'tamano');
  }

  // Si el original no traía el tipo, se reetiqueta el blob para quien lo lea.
  if (!comprimido && blob.type !== actual.contentType) {
    blob = new Blob([file], { type: actual.contentType });
  }
  const nombre = conExtension(file.name, actual.extension);
  return {
    blob,
    contentType: actual.contentType,
    familia: actual.familia,
    extension: actual.extension,
    nombre,
    nombreSeguro: nombreSeguro(nombre),
    tamano: blob.size,
    comprimido,
    tipoNavegador,
  };
}

/** Código de error de Firebase (storage/…, functions/…) o ''. */
export function codigoError(e: unknown): string {
  return typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
}

/**
 * Mensaje para mostrar cuando una subida falla. Nunca deja pasar el texto
 * técnico en inglés de Firebase ("Firebase Storage: User does not have…").
 */
export function mensajeErrorSubida(e: unknown, porDefecto = 'No se pudo subir el archivo. Vuelve a intentarlo.'): string {
  if (e instanceof ErrorArchivo) return e.message;
  const code = codigoError(e);
  switch (code) {
    case 'storage/unauthorized':
      return 'No pudimos guardar el archivo: el formato no es válido o tu sesión se venció. Recarga la página y vuelve a intentarlo con un PDF o una foto.';
    case 'storage/unauthenticated':
      return 'Tu sesión se venció. Recarga la página y vuelve a intentarlo.';
    case 'storage/retry-limit-exceeded':
    case 'storage/server-file-wrong-size':
    case 'storage/invalid-checksum':
      return 'Se cortó la conexión mientras subía el archivo. Revisa tu internet y vuelve a intentarlo.';
    case 'storage/canceled':
      return 'Se canceló la subida.';
    case 'storage/quota-exceeded':
      return 'No pudimos guardar el archivo en este momento. Inténtalo más tarde.';
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
      return 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.';
    default:
      break;
  }
  const msg = e instanceof Error ? e.message : '';
  if (code.startsWith('functions/') && msg && !/^internal$/i.test(msg)) return msg;
  if (/network|failed to fetch|load failed|internet/i.test(msg)) {
    return 'Se cortó la conexión. Revisa tu internet y vuelve a intentarlo.';
  }
  if (msg && !/firebase|storage\/|\(.*\/.*\)/i.test(msg)) return msg;
  return porDefecto;
}
