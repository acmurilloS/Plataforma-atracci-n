import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { subirPdfADrive } from './cliente';

/**
 * subirArchivoADrive · HTTPS endpoint que recibe un PDF en base64 + metadata
 * y lo sube a la Shared Drive corporativa.
 *
 * Auth manual via Bearer (Firebase ID token). Cualquier usuario autenticado
 * de la plataforma puede subir (el chequeo de qué tipo de archivo cada rol
 * puede subir lo hace el frontend). Más adelante se pueden granular permisos
 * por carpeta si hace falta.
 *
 * Body esperado:
 *   {
 *     carpeta: "Avales" | "CVs" | "Documentos" | "Conceptos",
 *     nombre: "EQT-BOG-2026-0001 · Asesor.pdf",
 *     pdfBase64: "JVBERi0xLj..."
 *   }
 */

const GDRIVE_SERVICE_ACCOUNT_JSON = defineSecret('GDRIVE_SERVICE_ACCOUNT_JSON');
const GDRIVE_SHARED_DRIVE_ID = defineSecret('GDRIVE_SHARED_DRIVE_ID');

const CARPETAS_VALIDAS = new Set(['Avales', 'CVs', 'Documentos', 'Conceptos', 'Pruebas']);
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

export const subirArchivoADrive = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    secrets: [GDRIVE_SERVICE_ACCOUNT_JSON, GDRIVE_SHARED_DRIVE_ID],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.header('Authorization') ?? '';
      const idToken = authHeader.replace(/^Bearer\s+/i, '');
      if (!idToken) {
        res.status(401).json({ error: 'Falta Authorization: Bearer <idToken>.' });
        return;
      }

      const decoded = await getAuth().verifyIdToken(idToken);
      // Cualquier user autenticado puede subir — Auth ya es suficiente filtro.
      // (Los candidatos anónimos también pueden, para CVs en landing pública.)

      const { carpeta, nombre, pdfBase64 } = (req.body ?? {}) as {
        carpeta?: string;
        nombre?: string;
        pdfBase64?: string;
      };

      if (!carpeta || !CARPETAS_VALIDAS.has(carpeta)) {
        res.status(400).json({
          error: `Carpeta inválida. Permitidas: ${[...CARPETAS_VALIDAS].join(', ')}.`,
        });
        return;
      }
      if (!nombre || nombre.length > 200) {
        res.status(400).json({ error: 'Nombre requerido (máx 200 chars).' });
        return;
      }
      if (!pdfBase64) {
        res.status(400).json({ error: 'pdfBase64 requerido.' });
        return;
      }

      const tamanioEstimado = Math.ceil((pdfBase64.length * 3) / 4);
      if (tamanioEstimado > MAX_PDF_BYTES) {
        res.status(413).json({
          error: `Archivo muy grande (${Math.round(tamanioEstimado / 1024 / 1024)} MB). Max ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
        });
        return;
      }

      const resultado = await subirPdfADrive({
        carpeta,
        nombreArchivo: nombre,
        pdfBase64,
      });

      logger.info('Archivo subido a Drive', {
        carpeta,
        nombre,
        fileId: resultado.fileId,
        por: decoded.uid,
      });

      res.json({
        ok: true,
        fileId: resultado.fileId,
        webViewLink: resultado.webViewLink,
        embedLink: resultado.embedLink,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('subirArchivoADrive error', { msg });
      res.status(500).json({ error: msg });
    }
  },
);
