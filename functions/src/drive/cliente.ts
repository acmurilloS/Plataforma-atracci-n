import { google, drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';

/**
 * Cliente de Google Drive con Service Account.
 *
 * El JSON de credenciales y el ID de la Shared Drive vienen de secrets de
 * Firebase Functions (GDRIVE_SERVICE_ACCOUNT_JSON, GDRIVE_SHARED_DRIVE_ID).
 *
 * Todos los uploads van a la Shared Drive corporativa, NO a una Drive
 * personal. Si el service account pierde acceso, el archivo no queda
 * huérfano — pertenece a la organización.
 */

export interface UploadResult {
  fileId: string;
  webViewLink: string;
  embedLink: string;
}

let cachedDrive: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;

  const rawJson = (process.env.GDRIVE_SERVICE_ACCOUNT_JSON ?? '')
    .replace(/^﻿/, '')
    .trim();
  if (!rawJson) {
    throw new Error('GDRIVE_SERVICE_ACCOUNT_JSON secret no configurada.');
  }

  const credentials = JSON.parse(rawJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  cachedDrive = google.drive({ version: 'v3', auth });
  return cachedDrive;
}

function getSharedDriveId(): string {
  const id = (process.env.GDRIVE_SHARED_DRIVE_ID ?? '').replace(/^﻿/, '').trim();
  if (!id) throw new Error('GDRIVE_SHARED_DRIVE_ID secret no configurada.');
  return id;
}

/**
 * Asegura que existe una subcarpeta con el nombre dado dentro de la Shared
 * Drive root. Retorna el folderId. Idempotente — si ya existe, la reutiliza.
 */
async function asegurarCarpeta(nombre: string): Promise<string> {
  const drive = getDriveClient();
  const sharedDriveId = getSharedDriveId();

  // Buscar carpeta existente
  const q = `name='${nombre.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${sharedDriveId}' in parents and trashed=false`;
  const existentes = await drive.files.list({
    q,
    fields: 'files(id,name)',
    corpora: 'drive',
    driveId: sharedDriveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  if (existentes.data.files && existentes.data.files.length > 0) {
    return existentes.data.files[0].id as string;
  }

  // Crear nueva
  const creado = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [sharedDriveId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return creado.data.id as string;
}

/**
 * Sube un PDF (base64) a la Shared Drive dentro de la carpeta indicada.
 * Retorna fileId + URLs para visualización (preview embed + abrir en Drive).
 */
export async function subirPdfADrive(opts: {
  carpeta: string;
  nombreArchivo: string;
  pdfBase64: string;
}): Promise<UploadResult> {
  const { carpeta, nombreArchivo, pdfBase64 } = opts;
  const drive = getDriveClient();
  const folderId = await asegurarCarpeta(carpeta);

  // Convertir base64 a buffer y luego a Readable stream
  const buffer = Buffer.from(pdfBase64, 'base64');
  const stream = Readable.from(buffer);

  const creado = await drive.files.create({
    requestBody: {
      name: nombreArchivo,
      parents: [folderId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: stream,
    },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  });

  const fileId = creado.data.id as string;
  const webViewLink = creado.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  const embedLink = `https://drive.google.com/file/d/${fileId}/preview`;

  return { fileId, webViewLink, embedLink };
}

/** Borra un archivo de Drive por ID. Útil para limpiar uploads fallidos. */
export async function borrarDeDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers genéricos para el DEPÓSITO DE CARPETAS en la Unidad Compartida de GH.
// A diferencia de subirPdfADrive (que usa el secret GDRIVE_SHARED_DRIVE_ID del
// flujo de avales/CVs), estos reciben el `driveId`/`parentId` explícitos — la
// unidad de carpetas viene del config `configuracion_global/drive`, configurable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asegura un folder por nombre bajo `parentId` dentro de la Shared Drive `driveId`.
 * Idempotente: si ya existe, lo reutiliza (no duplica).
 */
export async function asegurarFolder(opts: {
  parentId: string;
  nombre: string;
}): Promise<string> {
  const drive = getDriveClient();
  const nombreEscapado = opts.nombre.replace(/'/g, "\\'");
  const q = `name='${nombreEscapado}' and mimeType='application/vnd.google-apps.folder' and '${opts.parentId}' in parents and trashed=false`;
  // Sin corpora/driveId: filtramos por carpeta padre; supportsAllDrives +
  // includeItemsFromAllDrives cubren Shared Drives sin exigir el ID-raíz del drive
  // (el destino puede ser una carpeta DENTRO de la unidad, no su raíz).
  const existentes = await drive.files.list({
    q,
    fields: 'files(id,name)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  if (existentes.data.files && existentes.data.files.length > 0) {
    return existentes.data.files[0].id as string;
  }
  const creado = await drive.files.create({
    requestBody: {
      name: opts.nombre,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [opts.parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return creado.data.id as string;
}

/** Nombres de los archivos (no carpetas) dentro de un folder. Para idempotencia. */
export async function listarNombresEnFolder(opts: {
  parentId: string;
}): Promise<Set<string>> {
  const drive = getDriveClient();
  const nombres = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${opts.parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(name)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
    });
    (res.data.files ?? []).forEach((f) => {
      if (f.name) nombres.add(f.name);
    });
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return nombres;
}

/** Sube un buffer a un folder. NO deduplica (el caller lo hace con listarNombresEnFolder). */
export async function subirBufferAFolder(opts: {
  parentId: string;
  nombre: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const drive = getDriveClient();
  const creado = await drive.files.create({
    requestBody: { name: opts.nombre, parents: [opts.parentId], mimeType: opts.mimeType },
    media: { mimeType: opts.mimeType, body: Readable.from(opts.buffer) },
    fields: 'id',
    supportsAllDrives: true,
  });
  return creado.data.id as string;
}
