import type { ReactNode } from 'react';

/**
 * Texto legal de los consentimientos (tratamiento de datos + uso de imagen y voz).
 *
 * Fuente única de verdad: lo usan tanto la hoja imprimible que firma el analista
 * (AutorizacionPage) como el portal público donde el candidato lo lee y acepta
 * (PortalCandidatoPage). Así el candidato ve EXACTAMENTE el mismo texto que se
 * imprime, sin riesgo de que las dos versiones se desincronicen.
 */

export interface EmpresaConsentimiento {
  nombre: string;
  razon_social: string;
  nit: string;
  email_contacto: string;
}

export const EMPRESAS_INFO: Record<string, EmpresaConsentimiento> = {
  EQT: {
    nombre: 'Equitel S.A.',
    razon_social: 'Equipos Técnicos y Logística S.A.',
    nit: '890.900.323-5',
    email_contacto: 'enlace@equitel.com.co',
  },
  CUM: {
    nombre: 'Cumandes S.A.S.',
    razon_social: 'Cumandes S.A.',
    nit: '800.071.617-1',
    email_contacto: 'enlace@cumandes.com.co',
  },
  ING: {
    nombre: 'Ingenergía S.A.S.',
    razon_social: 'Ingenergia Colombia S.A.',
    nit: '900.140.082-9',
    email_contacto: 'enlace@ingenergia.com.co',
  },
  SLP: {
    nombre: 'Silap S.A.S.',
    razon_social: 'LAP Technologies S.A.',
    nit: '900.363.279-1',
    email_contacto: 'enlace@silap.com.co',
  },
};

export function empresaConsentimiento(codigo?: string | null): EmpresaConsentimiento {
  return EMPRESAS_INFO[codigo ?? 'EQT'] ?? EMPRESAS_INFO.EQT;
}

export function tituloConsentimiento(tipo: 'datos' | 'imagen'): string {
  return tipo === 'datos'
    ? 'Autorización Tratamiento de Datos Personales'
    : 'Acuerdo de Uso de Imagen y Voz';
}

/**
 * Cuerpo del consentimiento, con los datos del titular interpolados.
 * Si no hay nombre, deja el marcador "[nombre completo]" como en la hoja física.
 */
export function CuerpoConsentimiento({
  tipo,
  empresa,
  nombreCompleto,
  documentoNumero,
  documentoCiudad,
}: {
  tipo: 'datos' | 'imagen';
  empresa: EmpresaConsentimiento;
  nombreCompleto: string;
  documentoNumero: string;
  documentoCiudad: string;
}): ReactNode {
  const nombre = nombreCompleto.trim();
  const cc = documentoNumero.trim() || '—';
  const ciudad = documentoCiudad.trim() || '—';

  if (tipo === 'datos') {
    return (
      <>
        <p className="mb-4 text-justify">
          Por medio de la presente yo,{' '}
          {nombre ? (
            <strong>{nombre}</strong>
          ) : (
            <em className="text-text-subtle">[nombre completo]</em>
          )}
          , identificado(a) con la cédula de ciudadanía número <strong>{cc}</strong> expedida en{' '}
          <strong>{ciudad}</strong>, autorizo de manera expresa al EMPLEADOR{' '}
          <strong>{empresa.nombre}</strong> y/o a la persona natural o jurídica a quién esta
          encargue, para que recolecte, almacene, use, haga circular o suprima los datos personales
          que le he suministrado y/o que le suministraré con el fin que sean utilizados por el
          EMPLEADOR para:
        </p>
        <ol className="list-decimal pl-5 space-y-3 text-justify">
          <li>
            Realizar cualquier operación que tenga una finalidad lícita, tales como la recolección,
            almacenamiento, uso, circulación, supresión, transferencia y transmisión sobre sus datos
            personales, entendidos como cualquier información vinculada o que pueda asociarse al
            INTEGRANTE, para el cumplimiento de los fines del EMPLEADOR que incluyen pero no
            limitados al proceso de selección, verificación de referencias, afiliación en las
            entidades del sistema general de seguridad social y parafiscales, archivo y procesamiento
            de nómina, archivos sobre antecedentes disciplinarios, reporte ante autoridades
            administrativas, laborales, fiscales o judiciales, así como al cumplimiento de
            obligaciones legales o contractuales del EMPLEADOR con terceros, la debida ejecución del
            Contrato de trabajo, sustituciones patronales, el cumplimiento de las políticas internas
            del EMPLEADOR, la verificación del cumplimiento de las obligaciones del INTEGRANTE, la
            administración de sus sistemas de información y comunicaciones, la generación de copias y
            archivos de seguridad de la información en los equipos proporcionados por EL EMPLEADOR.
          </li>
          <li>
            EL INTEGRANTE conoce el carácter facultativo de entregar o no al EMPLEADOR sus datos
            sensibles; EL INTEGRANTE reconoce y acepta que el Tratamiento de sus Datos Personales
            efectuado por fuera del territorio colombiano puede regirse para algunos efectos por
            leyes extranjeras.
          </li>
          <li>
            EL INTEGRANTE reconoce que ha sido informado de los derechos que le asisten en su calidad
            de titular de Datos Personales, entre los que se encuentran:
            <ul className="list-[lower-alpha] pl-5 mt-2 space-y-1">
              <li>conocer, actualizar y rectificar sus Datos Personales;</li>
              <li>solicitar prueba de la autorización otorgada al EMPLEADOR;</li>
              <li>
                previa solicitud, ser informado sobre el uso que se ha dado a sus Datos Personales;
              </li>
              <li>
                presentar ante las autoridades competentes quejas por violaciones al régimen legal;
              </li>
              <li>
                revocar la presente autorización y/o solicitar la supresión de sus Datos Personales
                cuando la autoridad competente determine que EL EMPLEADOR incurrió en conductas
                contrarias a la ley;
              </li>
              <li>
                acceder en forma gratuita a sus Datos Personales que hayan sido objeto de
                Tratamiento.
              </li>
            </ul>
          </li>
          <li>
            Para los fines estipulados en la ley, EL EMPLEADOR ha definido la dirección electrónica{' '}
            <strong>{empresa.email_contacto}</strong> para la atención al INTEGRANTE en relación con
            los asuntos relativos a sus Datos Personales, conforme a lo estipulado en la Ley 1581 de
            2012 y sus decretos reglamentarios.
          </li>
        </ol>
        <p className="mt-6 text-justify">
          En señal de haber leído, entendido y en constancia de aceptación del presente documento,
          consiento y autorizo que mis datos personales sean tratados conforme a lo previsto en la
          presente autorización.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mb-4 text-justify">
        Por medio del presente documento, yo,{' '}
        {nombre ? (
          <strong>{nombre}</strong>
        ) : (
          <em className="text-text-subtle">[nombre completo]</em>
        )}
        , identificado(a) con cédula de ciudadanía número <strong>{cc}</strong> expedida en{' '}
        <strong>{ciudad}</strong>, autorizo de manera libre, expresa, voluntaria e informada a{' '}
        <strong>{empresa.nombre}</strong>, identificada con NIT <strong>{empresa.nit}</strong>, para
        usar mi imagen, voz y/o nombre en fotografías, videograbaciones, audios y demás soportes
        audiovisuales o digitales que se realicen en el marco de las actividades laborales,
        comerciales, formativas o promocionales del EMPLEADOR.
      </p>
      <p className="mb-4 text-justify">
        <strong>Alcance de la autorización:</strong> incluye la captación, edición, reproducción,
        distribución, comunicación pública, transformación y publicación a través de cualquier medio
        (físico, digital, redes sociales, portales web corporativos, material promocional interno y
        externo) por el tiempo en que mantenga vínculo con la organización y por hasta 5 años
        adicionales una vez termine dicho vínculo, para fines exclusivamente legítimos del EMPLEADOR.
      </p>
      <p className="mb-4 text-justify">
        Declaro que esta autorización se otorga sin condicionamiento alguno y sin contraprestación
        económica, siempre y cuando el uso del material no atente contra mi honor, dignidad o
        intimidad. Reconozco que tengo derecho a revocar esta autorización en cualquier momento
        mediante comunicación escrita dirigida a <strong>{empresa.email_contacto}</strong>, sin que
        dicha revocatoria afecte los usos que hayan sido legítimamente realizados antes de la misma.
      </p>
      <p className="mb-4 text-justify">
        Esta autorización se rige por la Ley 1581 de 2012 (Habeas Data), la Ley 23 de 1982 (Derechos
        de Autor) y la Decisión Andina 351 de 1993, conforme a la política de protección de datos
        personales del EMPLEADOR.
      </p>
    </>
  );
}
