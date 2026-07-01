import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Estampa la Debida Diligencia / SAGRILAFT del integrante sobre el PDF OFICIAL
 * F-CAR-01 (Calidad), sin alterar el layout. Espejo de `estamparDatosBasicos`.
 *
 * El PDF base es `public/formatos/debida-diligencia.pdf` (Letter 612×792, 1 pág).
 * Solo se rellenan los blancos con `drawText`/`drawImage`.
 *
 * COORDENADAS: medidas con PyMuPDF sobre el PDF real y VERIFICADAS visualmente
 * (render del resultado). El valor va en la casilla a la DERECHA de cada etiqueta;
 * las tres columnas caen en x≈183 / 318 / 468. `yTop` = línea base desde el borde
 * SUPERIOR (mismo sistema que PyMuPDF y `estamparDatosBasicos`).
 */

export interface DebidaDiligenciaEstampado {
  // 1. Empresa y registro
  tipo_registro?: string;
  departamento?: string;
  ciudad_municipio?: string;
  fecha_diligenciamiento?: string; // dd/MM/yyyy
  fecha_ingreso?: string;
  cargo?: string;
  tipo_vinculacion?: string;
  // 2. Datos generales
  primer_apellido?: string;
  segundo_apellido?: string;
  nombres?: string;
  identificacion?: string;
  tipo_documento?: string;
  tipo_documento_otro?: string;
  fecha_nacimiento?: string; // dd/MM/yyyy
  celular?: string;
  pais?: string;
  fecha_expedicion_documento?: string; // dd/MM/yyyy
  lugar_expedicion?: string;
  direccion_residencial?: string;
  correo_electronico?: string;
  // Familiar en la empresa (sí/no + datos)
  tiene_familiar_empresa?: string; // 'si' | 'no'
  nombre_apellidos_familiar?: string;
  cargo_familiar?: string;
  parentesco_familiar?: string;
  // 3. Cónyuge
  conyuge_primer_apellido?: string;
  conyuge_segundo_apellido?: string;
  conyuge_nombres?: string;
  conyuge_identificacion?: string;
  conyuge_tipo_documento?: string;
  conyuge_telefono?: string;
  conyuge_ocupacion?: string;
  conyuge_empleador?: string;
  conyuge_parentesco?: string;
  // 4. Financiera (sí/no + especifique)
  realiza_operaciones_moneda_extranjera?: string; // 'si' | 'no'
  operaciones_moneda_extranjera_detalle?: string;
  posee_productos_financieros_extranjero?: string; // 'si' | 'no'
  productos_financieros_extranjero_detalle?: string;
  realiza_actividad_ingresos_adicionales?: string; // 'si' | 'no'
  ingresos_adicionales_observaciones?: string;
  // 5. PEP (sí/no + tabla)
  posee_reconocimiento_publico?: string; // 'si' | 'no'
  posee_vinculo_pep?: string; // 'si' | 'no'
  vinculados_pep?: {
    nombre?: string;
    relacion?: string;
    identidad?: string;
    cargo_ocupacion?: string;
    fecha_desvinculacion?: string;
  }[];
}

type CampoKey = keyof DebidaDiligenciaEstampado;

/** Campos de texto: [clave, x, yTop, maxAncho?]. El valor va en la casilla a la derecha de su etiqueta. */
const CAMPOS: [CampoKey, number, number, number?][] = [
  // 1. Empresa y registro
  ['tipo_registro', 183, 118, 120],
  ['departamento', 183, 131, 120],
  ['ciudad_municipio', 318, 131, 120],
  ['fecha_diligenciamiento', 468, 131, 62],
  ['fecha_ingreso', 183, 146, 55],
  ['cargo', 318, 146, 120],
  ['tipo_vinculacion', 468, 146, 62],
  // 2. Datos generales
  ['primer_apellido', 183, 173, 125],
  ['segundo_apellido', 318, 173, 125],
  ['nombres', 468, 173, 62],
  ['identificacion', 183, 188, 125],
  ['tipo_documento', 318, 188, 125],
  ['tipo_documento_otro', 468, 188, 62],
  ['fecha_nacimiento', 183, 203, 55],
  ['celular', 318, 203, 125],
  ['pais', 468, 203, 62],
  ['fecha_expedicion_documento', 183, 218, 55],
  ['lugar_expedicion', 318, 218, 125],
  ['direccion_residencial', 468, 218, 62],
  ['correo_electronico', 183, 235, 125],
  // Familiar en la empresa
  ['nombre_apellidos_familiar', 318, 252, 125],
  ['cargo_familiar', 468, 252, 62],
  ['parentesco_familiar', 468, 235, 62],
  // 3. Cónyuge
  ['conyuge_primer_apellido', 183, 379, 125],
  ['conyuge_segundo_apellido', 318, 379, 125],
  ['conyuge_nombres', 468, 379, 62],
  ['conyuge_identificacion', 183, 393, 125],
  ['conyuge_tipo_documento', 318, 393, 125],
  ['conyuge_telefono', 468, 393, 62],
  ['conyuge_ocupacion', 183, 408, 125],
  ['conyuge_empleador', 318, 408, 125],
  ['conyuge_parentesco', 468, 408, 62],
  // 4. Financiera (especifique)
  ['operaciones_moneda_extranjera_detalle', 185, 442, 100],
  ['productos_financieros_extranjero_detalle', 382, 442, 145],
  ['ingresos_adicionales_observaciones', 382, 460, 145],
];

/**
 * Preguntas sí/no que SIEMPRE se estampan como texto ("SÍ"/"NO") en su casilla
 * (la casilla está en blanco en el formato oficial): [clave, x, yTop].
 */
const SINO_SIEMPRE: [CampoKey, number, number][] = [
  ['tiene_familiar_empresa', 318, 235],
  ['realiza_actividad_ingresos_adicionales', 250, 462],
  ['posee_reconocimiento_publico', 514, 266],
  ['posee_vinculo_pep', 514, 280],
];

/**
 * Preguntas sí/no de la sección financiera donde el formato YA trae "NO"
 * pre-impreso: se tapa el "NO" con un recuadro blanco y se estampa la respuesta
 * real (SÍ/NO), para que quede una sola respuesta clara. [clave, x, yTop].
 */
const SINO_FINANCIERO: [CampoKey, number, number][] = [
  ['realiza_operaciones_moneda_extranjera', 131, 446],
  ['posee_productos_financieros_extranjero', 341, 446],
];

/** Tabla PEP: primera fila de datos + alto de fila (3 filas en el formato). */
const PEP_Y0 = 337;
const PEP_DY = 11.5;
const PEP_X = { nombre: 100, relacion: 245, identidad: 298, cargo_ocupacion: 380, fecha_desvinculacion: 450 };

/** Firma del integrante: va SOBRE la línea "FIRMA Y CÉDULA DEL INTEGRANTE" (y≈719). */
const FIRMA = { x: 100, yTop: 702, ancho: 150, altoMax: 18 };

export const RUTA_DEBIDA_DILIGENCIA = '/formatos/debida-diligencia.pdf';

export async function estamparDebidaDiligencia(
  datos: DebidaDiligenciaEstampado,
  firmaPngDataUrl?: string,
): Promise<Blob> {
  const resp = await fetch(RUTA_DEBIDA_DILIGENCIA);
  if (!resp.ok) throw new Error('No se pudo cargar el formato oficial de Debida Diligencia (F-CAR-01).');
  const base = await resp.arrayBuffer();

  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPages()[0];
  const { height: H } = page.getSize();
  const tinta = rgb(0.05, 0.05, 0.12);

  const draw = (texto: unknown, x: number, yTop: number, maxAncho?: number, size = 8, f = font) => {
    const s0 = texto === undefined || texto === null ? '' : String(texto);
    if (!s0) return;
    let size2 = size;
    if (maxAncho) {
      while (size2 > 5 && f.widthOfTextAtSize(s0, size2) > maxAncho) size2 -= 0.5;
    }
    page.drawText(s0, { x, y: H - yTop, size: size2, font: f, color: tinta });
  };
  const siNo = (v: unknown) => (String(v ?? '').toLowerCase() === 'si' ? 'SÍ' : 'NO');

  for (const [k, x, yTop, maxA] of CAMPOS) draw(datos[k], x, yTop, maxA);
  for (const [k, x, yTop] of SINO_SIEMPRE) draw(siNo(datos[k]), x, yTop, 40, 8.5, fontB);
  // Financiera: tapar el "NO" pre-impreso del formato y escribir la respuesta real.
  for (const [k, x, yTop] of SINO_FINANCIERO) {
    page.drawRectangle({ x: x - 3, y: H - yTop - 3, width: 26, height: 11, color: rgb(1, 1, 1) });
    draw(siNo(datos[k]), x, yTop, 40, 8.5, fontB);
  }

  (datos.vinculados_pep ?? []).slice(0, 3).forEach((v, i) => {
    const y = PEP_Y0 + i * PEP_DY;
    draw(v.nombre, PEP_X.nombre, y, 130, 7);
    draw(v.relacion, PEP_X.relacion, y, 48, 7);
    draw(v.identidad, PEP_X.identidad, y, 70, 7);
    draw(v.cargo_ocupacion, PEP_X.cargo_ocupacion, y, 62, 7);
    draw(v.fecha_desvinculacion, PEP_X.fecha_desvinculacion, y, 52, 7);
  });

  if (firmaPngDataUrl) {
    try {
      // El portal pasa un data-URI del canvas; la regeneración (corrección) pasa
      // la URL de descarga del PNG en Storage. pdf-lib NO descarga http(s), así que
      // si viene una URL la traemos como binario antes de incrustarla.
      const fuente = /^https?:\/\//i.test(firmaPngDataUrl)
        ? await (await fetch(firmaPngDataUrl)).arrayBuffer()
        : firmaPngDataUrl;
      const png = await pdf.embedPng(fuente);
      let w = FIRMA.ancho;
      let h = (png.height / png.width) * w;
      if (h > FIRMA.altoMax) {
        h = FIRMA.altoMax;
        w = (png.width / png.height) * h;
      }
      page.drawImage(png, { x: FIRMA.x, y: H - FIRMA.yTop - h, width: w, height: h });
    } catch {
      /* la firma es opcional para el estampado */
    }
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}
