import { format } from 'date-fns';
import type { FilaExcel } from './reportesVacantes';

/**
 * Descarga de Excel en el CLIENTE con SheetJS. El dashboard ya lee vacantes y
 * postulaciones; aquí solo se arma el .xlsx a partir de las filas ya calculadas
 * en `reportesVacantes.ts`. Nombre de archivo con fecha (TZ del equipo).
 *
 * SheetJS (~600 KB) se carga con `import()` dinámico: solo entra al navegador
 * cuando el usuario realmente descarga un reporte, no en la carga inicial.
 */

/** Ancho de columnas según el largo del encabezado y de los datos (legible). */
function anchoColumnas(filas: FilaExcel[]): { wch: number }[] {
  if (filas.length === 0) return [];
  return Object.keys(filas[0]).map((col) => {
    const largoDatos = filas.reduce((max, f) => {
      const v = f[col];
      return Math.max(max, v === undefined || v === null ? 0 : String(v).length);
    }, 0);
    return { wch: Math.min(40, Math.max(col.length, largoDatos) + 2) };
  });
}

async function descargar(
  filas: FilaExcel[],
  nombreHoja: string,
  nombreArchivo: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = anchoColumnas(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  XLSX.writeFile(wb, nombreArchivo);
}

const hoyIso = () => format(new Date(), 'yyyy-MM-dd');

export function exportarBaseVacantes(filas: FilaExcel[]): Promise<void> {
  return descargar(filas, 'Base vacantes', `Base_Vacantes_${hoyIso()}.xlsx`);
}

export function exportarReporteMensual(filas: FilaExcel[]): Promise<void> {
  return descargar(filas, 'Resumen mensual', `Reporte_Mensual_${hoyIso()}.xlsx`);
}
