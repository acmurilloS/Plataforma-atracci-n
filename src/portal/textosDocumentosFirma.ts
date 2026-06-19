/**
 * Textos de los documentos que el candidato FIRMA en el portal (datos básicos y
 * debida diligencia · SAGRILAFT). Se muestran completos antes de firmar y también
 * se incrustan en la constancia PDF.
 *
 * ⚠️ TEXTO ESTÁNDAR / PLANTILLA. Reemplazar con el texto OFICIAL de Equitel
 * (Datos Básicos del Integrante DGH-F-05 y Debida Diligencia F-CAR-01) cuando GH
 * lo facilite. Es el único lugar a editar.
 */

export type TipoDocumentoFirma = 'datos_basicos' | 'debida_diligencia';

export interface TextoDocumentoFirma {
  intro: string;
  parrafos: string[];
}

export function textoDocumentoFirma(
  tipo: TipoDocumentoFirma,
  args: { nombre: string; documento: string; empresa: string },
): TextoDocumentoFirma {
  const nombre = args.nombre || 'el integrante';
  const documento = args.documento || '—';
  const empresa = args.empresa || 'la Compañía';

  if (tipo === 'datos_basicos') {
    return {
      intro:
        'Formato de Datos Básicos del Integrante (DGH-F-05). Con tu firma declaras que la información que entregaste para tu vinculación es veraz.',
      parrafos: [
        `Yo, ${nombre}, identificado(a) con documento de identidad No. ${documento}, declaro que la ` +
          `información personal, laboral, académica y familiar que he suministrado a ${empresa} para mi ` +
          `proceso de vinculación es veraz, completa y se encuentra actualizada.`,
        `Me comprometo a informar de manera oportuna cualquier cambio en dichos datos y autorizo su ` +
          `uso para los fines propios de la relación laboral, la afiliación al sistema de seguridad ` +
          `social y el cumplimiento de obligaciones legales.`,
        `Entiendo que la entrega de información falsa o inexacta puede constituir causal de terminación ` +
          `del proceso o del contrato, conforme a la ley y a las políticas internas.`,
      ],
    };
  }

  return {
    intro:
      'Declaración de Debida Diligencia · SAGRILAFT (F-CAR-01), para la prevención del lavado de activos y la financiación del terrorismo.',
    parrafos: [
      `Yo, ${nombre}, identificado(a) con documento de identidad No. ${documento}, declaro de manera ` +
        `libre y voluntaria que mis ingresos y los recursos con los que cuento provienen de actividades ` +
        `lícitas y no se encuentran relacionados con el lavado de activos ni con la financiación del ` +
        `terrorismo.`,
      `Declaro que no me encuentro incluido(a) en listas vinculantes ni restrictivas nacionales o ` +
        `internacionales (ONU, OFAC u otras), y que no he sido condenado(a) por delitos relacionados con ` +
        `lavado de activos, financiación del terrorismo o conexos.`,
      `Autorizo a ${empresa} a verificar la información aquí suministrada y a consultar las fuentes y ` +
        `listas que considere pertinentes, en el marco de su Sistema de Autocontrol y Gestión del Riesgo ` +
        `(SAGRILAFT).`,
      `Manifiesto que la información suministrada es veraz y verificable, y me comprometo a actualizarla ` +
        `cuando sea requerido.`,
    ],
  };
}
