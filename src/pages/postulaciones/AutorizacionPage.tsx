import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { formatearFecha } from '../../utils/fechas';
import { Button, Pill } from '../../components/brand';
import type { PostulacionDoc, VacanteDoc } from '../../schemas';
import {
  empresaConsentimiento,
  tituloConsentimiento,
} from '../../components/consentimientos/consentimientoLegal';
import { rutaFormatoOficial } from '../../utils/estamparFormatoOficial';

interface PropsTipo {
  tipo: 'datos' | 'imagen';
}

/**
 * AutorizacionPage · vista del staff del consentimiento.
 *
 * Muestra el FORMATO OFICIAL (parametrizado por Calidad) de la empresa de la
 * vacante — NO un layout inventado por la plataforma. Si el integrante ya firmó
 * en su portal, muestra el PDF oficial estampado con sus datos + firma; si no,
 * la plantilla oficial en blanco (la firma se hace en el portal).
 */
export function AutorizacionPage({ tipo }: PropsTipo) {
  const { id } = useParams<{ id: string }>();
  const { doc: postulacion } = useDoc<PostulacionDoc>('postulaciones', id);
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', postulacion?.vacante_id ?? null);

  if (!postulacion)
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-[13px] text-text-muted">Cargando…</div>
    );

  const empresa = empresaConsentimiento(vacante?.empresa_codigo);
  const titulo = tituloConsentimiento(tipo);

  const p = postulacion as unknown as Record<string, unknown>;
  const campo = tipo === 'datos' ? 'consentimiento_datos' : 'consentimiento_imagen';
  const aceptadoEn = p[`${campo}_aceptado_en`] as { toDate?: () => Date } | null | undefined;
  const firmaPdfUrl = String(p[`${campo}_firma_url`] ?? '');
  const firmado = !!aceptadoEn;
  const fechaFirma = aceptadoEn?.toDate ? formatearFecha(aceptadoEn.toDate()) : '';

  // Firmado → PDF oficial estampado; pendiente → plantilla oficial en blanco.
  const pdfUrl =
    firmado && firmaPdfUrl ? firmaPdfUrl : rutaFormatoOficial(tipo, vacante?.empresa_codigo);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
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
            {firmado ? (
              <Pill tono="success" dot>
                Firmado{fechaFirma ? ` · ${fechaFirma}` : ''}
              </Pill>
            ) : (
              <Pill tono="warning" dot>
                Pendiente de firma
              </Pill>
            )}
          </div>
          <h1
            className="mt-3 text-[32px] font-light leading-[1.1] tracking-[-0.025em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            {titulo}
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Formato oficial de {empresa.nombre}
            {firmado
              ? ' · firmado por el integrante en su portal'
              : ' · el integrante lo firma en su portal'}
            .
          </p>
        </div>
        <a href={pdfUrl} target="_blank" rel="noreferrer">
          <Button variant="brand-primary" icon={<ExternalLink size={13} strokeWidth={1.75} />}>
            Abrir PDF
          </Button>
        </a>
      </div>

      {/* Documento OFICIAL — no un layout inventado por la plataforma. */}
      <div
        className="rounded-md border border-slate-200 overflow-hidden bg-slate-50"
        style={{ height: '80vh' }}
      >
        <iframe src={pdfUrl} title={titulo} className="w-full h-full" />
      </div>
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
