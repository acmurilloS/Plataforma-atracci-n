import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { formatearFecha } from '../../utils/fechas';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Pill } from '../../components/brand';
import type { PostulacionDoc, DatosBasicosIntegranteDoc } from '../../schemas';
import { useColeccion } from '../../hooks/useColeccion';

interface PropsTipo {
  tipo: 'datos' | 'imagen';
}

const EMPRESAS_INFO: Record<string, {
  nombre: string;
  razon_social: string;
  nit: string;
  email_contacto: string;
}> = {
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

/**
 * AutorizacionPage · sistema brand + hoja oficial imprimible.
 *
 * Controles superiores en lenguaje brand. Hoja imprimible mantiene formato
 * legal con bordes neutros y tipografía serif-safe para que el PDF se vea
 * profesional al firmar.
 */
export function AutorizacionPage({ tipo }: PropsTipo) {
  const { id } = useParams<{ id: string }>();
  const { doc: postulacion } = useDoc<PostulacionDoc>('postulaciones', id);
  const { docs: datosBasicos } = useColeccion<DatosBasicosIntegranteDoc>(
    'datos_basicos_integrante',
    {
      filtros: id ? [['postulacion_id', '==', id]] : [],
      limit: 1,
    },
  );

  const datos = datosBasicos[0] ?? null;

  if (!postulacion)
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-[13px] text-text-muted">Cargando…</div>
    );

  const empresa = EMPRESAS_INFO[datos?.empresa_codigo ?? 'EQT'] ?? EMPRESAS_INFO.EQT;
  const titulo =
    tipo === 'datos'
      ? 'Autorización Tratamiento de Datos Personales'
      : 'Acuerdo de Uso de Imagen y Voz';

  function imprimir() {
    window.print();
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      {/* Controles superiores · brand */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <Link
            to={`/postulaciones/${postulacion.id}`}
            className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Volver a postulación
          </Link>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Pill tono="brand" dot>
              {tipo === 'datos' ? 'Habeas Data' : 'Imagen y voz'}
            </Pill>
            <Pill tono="neutral">{empresa.nombre}</Pill>
          </div>
          <h1
            className="mt-3 text-[32px] font-light leading-[1.1] tracking-[-0.025em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            {titulo}
          </h1>
          <p className="mt-1 text-[13px] text-text-muted font-mono">NIT {empresa.nit}</p>
        </div>
        <Button
          variant="brand-primary"
          onClick={imprimir}
          icon={<Printer size={13} strokeWidth={1.75} />}
        >
          Imprimir / Guardar PDF
        </Button>
      </div>

      {/* Hoja imprimible · formato oficial */}
      <article className="bg-white border border-slate-200 print:border-0 p-12 shadow-brand-card print:shadow-none print:p-0 text-[13px] leading-relaxed text-text-strong">
        <header className="flex items-center gap-6 border-b-2 border-text-strong pb-5 mb-7">
          <EquitelLogo size={64} />
          <div>
            <h2 className="text-[18px] font-bold uppercase tracking-tight text-text-strong">
              {empresa.nombre}
            </h2>
            <p className="text-[11px] text-text-muted mt-1">
              {empresa.razon_social} · NIT {empresa.nit}
            </p>
          </div>
        </header>

        <div className="text-center mb-6">
          <p className="text-[14px] font-bold uppercase tracking-wide">{titulo}</p>
          <p className="text-[11px] text-text-muted mt-1">
            Ley 1581 de 2012 · Decreto 1377 de 2013
          </p>
        </div>

        <p className="mb-4">
          <strong>Fecha:</strong> {formatearFecha(new Date())}
        </p>

        {tipo === 'datos' && (
          <>
            <p className="mb-4 text-justify">
              Por medio de la presente yo,{' '}
              <strong>
                {datos?.nombres} {datos?.apellidos}
              </strong>{' '}
              {!datos?.nombres && (
                <em className="text-text-subtle">[nombre completo]</em>
              )}
              , identificado(a) con la cédula de ciudadanía número{' '}
              <strong>{datos?.documento_numero || '—'}</strong> expedida en{' '}
              <strong>{datos?.documento_ciudad_expedicion || '—'}</strong>, autorizo de manera
              expresa al EMPLEADOR <strong>{empresa.nombre}</strong> y/o a la persona natural o
              jurídica a quién esta encargue, para que recolecte, almacene, use, haga circular o
              suprima los datos personales que le he suministrado y/o que le suministraré con el
              fin que sean utilizados por el EMPLEADOR para:
            </p>
            <ol className="list-decimal pl-5 space-y-3 text-justify">
              <li>
                Realizar cualquier operación que tenga una finalidad lícita, tales como la
                recolección, almacenamiento, uso, circulación, supresión, transferencia y
                transmisión sobre sus datos personales, entendidos como cualquier información
                vinculada o que pueda asociarse al INTEGRANTE, para el cumplimiento de los fines
                del EMPLEADOR que incluyen pero no limitados al proceso de selección, verificación
                de referencias, afiliación en las entidades del sistema general de seguridad social
                y parafiscales, archivo y procesamiento de nómina, archivos sobre antecedentes
                disciplinarios, reporte ante autoridades administrativas, laborales, fiscales o
                judiciales, así como al cumplimiento de obligaciones legales o contractuales del
                EMPLEADOR con terceros, la debida ejecución del Contrato de trabajo, sustituciones
                patronales, el cumplimiento de las políticas internas del EMPLEADOR, la
                verificación del cumplimiento de las obligaciones del INTEGRANTE, la administración
                de sus sistemas de información y comunicaciones, la generación de copias y
                archivos de seguridad de la información en los equipos proporcionados por EL
                EMPLEADOR.
              </li>
              <li>
                EL INTEGRANTE conoce el carácter facultativo de entregar o no al EMPLEADOR sus
                datos sensibles; EL INTEGRANTE reconoce y acepta que el Tratamiento de sus Datos
                Personales efectuado por fuera del territorio colombiano puede regirse para algunos
                efectos por leyes extranjeras.
              </li>
              <li>
                EL INTEGRANTE reconoce que ha sido informado de los derechos que le asisten en su
                calidad de titular de Datos Personales, entre los que se encuentran:
                <ul className="list-[lower-alpha] pl-5 mt-2 space-y-1">
                  <li>conocer, actualizar y rectificar sus Datos Personales;</li>
                  <li>solicitar prueba de la autorización otorgada al EMPLEADOR;</li>
                  <li>
                    previa solicitud, ser informado sobre el uso que se ha dado a sus Datos
                    Personales;
                  </li>
                  <li>
                    presentar ante las autoridades competentes quejas por violaciones al régimen
                    legal;
                  </li>
                  <li>
                    revocar la presente autorización y/o solicitar la supresión de sus Datos
                    Personales cuando la autoridad competente determine que EL EMPLEADOR incurrió
                    en conductas contrarias a la ley;
                  </li>
                  <li>
                    acceder en forma gratuita a sus Datos Personales que hayan sido objeto de
                    Tratamiento.
                  </li>
                </ul>
              </li>
              <li>
                Para los fines estipulados en la ley, EL EMPLEADOR ha definido la dirección
                electrónica <strong>{empresa.email_contacto}</strong> para la atención al
                INTEGRANTE en relación con los asuntos relativos a sus Datos Personales, conforme a
                lo estipulado en la Ley 1581 de 2012 y sus decretos reglamentarios.
              </li>
            </ol>
            <p className="mt-6 text-justify">
              En señal de haber leído, entendido y en constancia de aceptación del presente
              documento, consiento y autorizo que mis datos personales sean tratados conforme a lo
              previsto en la presente autorización.
            </p>
          </>
        )}

        {tipo === 'imagen' && (
          <>
            <p className="mb-4 text-justify">
              Por medio del presente documento, yo,{' '}
              <strong>
                {datos?.nombres} {datos?.apellidos}
              </strong>{' '}
              {!datos?.nombres && (
                <em className="text-text-subtle">[nombre completo]</em>
              )}
              , identificado(a) con cédula de ciudadanía número{' '}
              <strong>{datos?.documento_numero || '—'}</strong> expedida en{' '}
              <strong>{datos?.documento_ciudad_expedicion || '—'}</strong>, autorizo de manera
              libre, expresa, voluntaria e informada a{' '}
              <strong>{empresa.nombre}</strong>, identificada con NIT{' '}
              <strong>{empresa.nit}</strong>, para usar mi imagen, voz y/o nombre en fotografías,
              videograbaciones, audios y demás soportes audiovisuales o digitales que se realicen
              en el marco de las actividades laborales, comerciales, formativas o promocionales
              del EMPLEADOR.
            </p>
            <p className="mb-4 text-justify">
              <strong>Alcance de la autorización:</strong> incluye la captación, edición,
              reproducción, distribución, comunicación pública, transformación y publicación a
              través de cualquier medio (físico, digital, redes sociales, portales web
              corporativos, material promocional interno y externo) por el tiempo en que mantenga
              vínculo con la organización y por hasta 5 años adicionales una vez termine dicho
              vínculo, para fines exclusivamente legítimos del EMPLEADOR.
            </p>
            <p className="mb-4 text-justify">
              Declaro que esta autorización se otorga sin condicionamiento alguno y sin
              contraprestación económica, siempre y cuando el uso del material no atente contra mi
              honor, dignidad o intimidad. Reconozco que tengo derecho a revocar esta autorización
              en cualquier momento mediante comunicación escrita dirigida a{' '}
              <strong>{empresa.email_contacto}</strong>, sin que dicha revocatoria afecte los usos
              que hayan sido legítimamente realizados antes de la misma.
            </p>
            <p className="mb-4 text-justify">
              Esta autorización se rige por la Ley 1581 de 2012 (Habeas Data), la Ley 23 de 1982
              (Derechos de Autor) y la Decisión Andina 351 de 1993, conforme a la política de
              protección de datos personales del EMPLEADOR.
            </p>
          </>
        )}

        {/* Bloque de firma */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Nombre completo
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em]">
              {[datos?.nombres, datos?.apellidos].filter(Boolean).join(' ') || ' '}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Identificación
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em] font-mono">
              {datos?.documento_numero || ' '}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Celular
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em] font-mono">
              {datos?.celular || ' '}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Correo
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em]">
              {datos?.correo_electronico || ' '}
            </p>
          </div>
          <div className="col-span-2 mt-8">
            <div className="border-b border-text-strong mb-1 min-h-[3em]"></div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide">
              Firma del integrante
            </p>
          </div>
        </div>

        <footer className="mt-12 pt-4 border-t border-slate-300 text-[10px] text-text-muted text-center">
          {empresa.nombre} · {empresa.razon_social} · NIT {empresa.nit}
          <br />
          Plataforma de Atracción · {formatearFecha(new Date())}
        </footer>
      </article>
    </div>
  );
}

// Wrappers para las rutas
export function AutorizacionDatosPage() {
  return <AutorizacionPage tipo="datos" />;
}
export function AutorizacionImagenPage() {
  return <AutorizacionPage tipo="imagen" />;
}
