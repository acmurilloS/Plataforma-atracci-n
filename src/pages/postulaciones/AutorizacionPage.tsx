import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { formatearFecha } from '../../utils/fechas';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button, Pill } from '../../components/brand';
import type {
  PostulacionDoc,
  DatosBasicosIntegranteDoc,
  CandidatoDoc,
  VacanteDoc,
} from '../../schemas';
import { useColeccion } from '../../hooks/useColeccion';
import {
  CuerpoConsentimiento,
  empresaConsentimiento,
  tituloConsentimiento,
} from '../../components/consentimientos/consentimientoLegal';

interface PropsTipo {
  tipo: 'datos' | 'imagen';
}

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
  const { doc: candidato } = useDoc<CandidatoDoc>('candidatos', postulacion?.candidato_id ?? null);
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', postulacion?.vacante_id ?? null);
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

  const empresa = empresaConsentimiento(datos?.empresa_codigo ?? vacante?.empresa_codigo);
  const titulo = tituloConsentimiento(tipo);

  // Auto-relleno: usa la ficha de datos básicos si existe; si no, lo que la
  // plataforma ya tiene del candidato (registro / postulación).
  const nombre =
    [datos?.nombres, datos?.apellidos].filter(Boolean).join(' ') ||
    [candidato?.nombres, candidato?.apellidos].filter(Boolean).join(' ') ||
    postulacion.candidato_nombre ||
    '';
  const cedula = datos?.documento_numero || candidato?.documento_numero || '';
  const celular = datos?.celular || candidato?.telefono || postulacion.candidato_telefono || '';
  const correo =
    datos?.correo_electronico || candidato?.email || postulacion.candidato_email || '';
  const ciudad = datos?.documento_ciudad_expedicion ?? '';

  // Firma digital: si el candidato aceptó/firmó este consentimiento en el portal.
  const p = postulacion as unknown as Record<string, unknown>;
  const campo = tipo === 'datos' ? 'consentimiento_datos' : 'consentimiento_imagen';
  const aceptadoEn = p[`${campo}_aceptado_en`] as { toDate?: () => Date } | null | undefined;
  const firmaImagenUrl = String(p[`${campo}_firma_imagen_url`] ?? '');
  const firmaPdfUrl = String(p[`${campo}_firma_url`] ?? '');
  const firmado = !!aceptadoEn;
  const fechaFirma = aceptadoEn?.toDate ? formatearFecha(aceptadoEn.toDate()) : '';

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

        <CuerpoConsentimiento
          tipo={tipo}
          empresa={empresa}
          nombreCompleto={nombre}
          documentoNumero={cedula}
          documentoCiudad={ciudad}
        />

        {/* Bloque de firma · auto-rellenado + firma digital del portal */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Nombre completo
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em]">{nombre || ' '}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Identificación
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em] font-mono">{cedula || ' '}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Celular
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em] font-mono">{celular || ' '}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-body font-bold uppercase tracking-wide mb-1">
              Correo
            </p>
            <p className="border-b border-text-strong pb-1 min-h-[1.5em]">{correo || ' '}</p>
          </div>
          <div className="col-span-2 mt-8">
            {firmado ? (
              <>
                {firmaImagenUrl && (
                  <img
                    src={firmaImagenUrl}
                    alt="Firma del integrante"
                    className="max-h-24 object-contain mb-1"
                  />
                )}
                <div className="border-b border-text-strong mb-1"></div>
                <p className="text-[11px] text-text-body font-bold uppercase tracking-wide">
                  Firma del integrante
                </p>
                <p className="text-[11px] text-text-muted mt-1">
                  ✓ Firmado digitalmente por el candidato{fechaFirma ? ` el ${fechaFirma}` : ''}
                  {firmaPdfUrl && (
                    <>
                      {' · '}
                      <a
                        href={firmaPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline print:no-underline"
                      >
                        ver constancia (PDF)
                      </a>
                    </>
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="border-b border-text-strong mb-1 min-h-[3em]"></div>
                <p className="text-[11px] text-text-body font-bold uppercase tracking-wide">
                  Firma del integrante
                </p>
              </>
            )}
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
