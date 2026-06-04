import { google, sheets_v4 } from 'googleapis';

/**
 * Cliente de Google Sheets con Service Account.
 *
 * Reusa el MISMO service account de Drive (secret GDRIVE_SERVICE_ACCOUNT_JSON,
 * client_email `drive-uploader@ptm-atraccion.iam.gserviceaccount.com`). Para
 * que pueda escribir, la hoja destino debe estar compartida con ese correo en
 * modo **Editor**. El scope se amplía a `spreadsheets`.
 *
 * Se usa para volcar la solicitud de herramientas a la hoja de trazabilidad de
 * IT (reemplazo del Google Forms). Reunión Sebastián Orozco 2026-05-28.
 */

let cachedSheets: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedSheets) return cachedSheets;

  const rawJson = (process.env.GDRIVE_SERVICE_ACCOUNT_JSON ?? '')
    .replace(/^﻿/, '')
    .trim();
  if (!rawJson) {
    throw new Error('GDRIVE_SERVICE_ACCOUNT_JSON secret no configurada.');
  }

  const credentials = JSON.parse(rawJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cachedSheets = google.sheets({ version: 'v4', auth });
  return cachedSheets;
}

/**
 * Agrega una fila al final de la pestaña indicada. Escribe desde la columna A;
 * las columnas que no enviamos (bloque que diligencia IT) quedan intactas.
 *
 * `valores` ya debe venir en el orden exacto de columnas de la hoja.
 */
export async function agregarFilaSheet(opts: {
  spreadsheetId: string;
  hoja: string;
  valores: (string | number)[];
}): Promise<void> {
  const { spreadsheetId, hoja, valores } = opts;
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${hoja}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [valores] },
  });
}

/**
 * Lee un rango completo de una hoja como matriz de strings.
 *
 * `rango` admite formato A1 (ej. `"BD_TECNICOS!A2:M"` lee desde la fila 2,
 * columnas A-M, hasta el final con datos). Si el rango no se proporciona,
 * lee toda la hoja (`<hoja>`).
 *
 * Las celdas vacías al final de cada fila pueden venir omitidas — el llamador
 * debe tolerar arrays de longitud variable.
 *
 * Usado por el módulo de Referidos internos para leer la base de técnicos
 * mantenida por RRHH (Sheet compartido con la SA en modo Editor).
 */
export async function leerHojaSheet(opts: {
  spreadsheetId: string;
  hoja: string;
  /** Rango A1 opcional. Si no se da, lee toda la hoja. */
  rango?: string;
}): Promise<string[][]> {
  const { spreadsheetId, hoja, rango } = opts;
  const sheets = getSheetsClient();

  const range = rango ?? hoja;
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const values = resp.data.values ?? [];
  // Normalizamos a string para que el llamador no tenga que lidiar con
  // numbers que vienen sin formato (ej. cédulas como número en el Sheet).
  return values.map((fila) => fila.map((c) => (c == null ? '' : String(c))));
}
