import { useCallback, useState } from 'react';
import { auth } from '../lib/firebase';

/**
 * useDriveUpload · sube un PDF a la Shared Drive de Equitel vía Cloud
 * Function. Reemplaza el upload directo a Firebase Storage para tener
 * todos los docs visibles desde Drive (preview embed + descarga).
 *
 * El archivo se convierte a base64 en el browser y se manda al endpoint.
 * Para PDFs > ~10 MB esto puede comerse memoria — la Cloud Function tiene
 * límite de 15 MB. Si necesitamos más, switcheamos a upload resumable
 * con OAuth de Drive directo (no urgente).
 */

export type CarpetaDrive = 'Avales' | 'CVs' | 'Documentos' | 'Conceptos' | 'Pruebas';

export interface ArchivoDrive {
  fileId: string;
  webViewLink: string;
  embedLink: string;
}

const ENDPOINT = 'https://us-central1-ptm-atraccion.cloudfunctions.net/subirArchivoADrive';

export function useDriveUpload() {
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);

  const subir = useCallback(
    async (file: File, carpeta: CarpetaDrive, nombreSugerido?: string): Promise<ArchivoDrive> => {
      if (file.type !== 'application/pdf') {
        throw new Error('Solo se aceptan archivos PDF.');
      }
      const user = auth.currentUser;
      if (!user) throw new Error('Necesitas iniciar sesión para subir archivos.');

      setSubiendo(true);
      setProgreso(5);
      try {
        // Convertir el archivo a base64 con progress básico
        const pdfBase64 = await fileABase64(file, (p) => setProgreso(5 + p * 0.4));
        setProgreso(50);

        const idToken = await user.getIdToken();
        const nombre = nombreSugerido ?? file.name;

        const resp = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ carpeta, nombre, pdfBase64 }),
        });

        setProgreso(95);

        if (!resp.ok) {
          const errBody = await resp.text();
          throw new Error(
            `Subida a Drive falló (${resp.status}): ${errBody.slice(0, 300)}`,
          );
        }
        const data = (await resp.json()) as ArchivoDrive;
        setProgreso(100);
        return data;
      } finally {
        setTimeout(() => {
          setSubiendo(false);
          setProgreso(0);
        }, 400);
      }
    },
    [],
  );

  return { subir, subiendo, progreso };
}

function fileABase64(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo.'));
        return;
      }
      // result viene como "data:application/pdf;base64,JVBERi0..."
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lectura fallida.'));
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    reader.readAsDataURL(file);
  });
}
