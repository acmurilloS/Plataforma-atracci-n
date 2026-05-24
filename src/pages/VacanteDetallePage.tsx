import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FlujogramaTimeline } from '../components/FlujogramaTimeline';
import { PoliticaCriticidadBanner } from '../components/vacantes/PoliticaCriticidadBanner';
import { Badge, Card, PageHeader, type BadgeVariant } from '../components/ui';
import { useVacantes } from '../hooks/useVacantes';
import { formatearFecha } from '../utils/fechas';
import { formatearCOP } from '../utils/moneda';
import type { VacanteDoc } from '../schemas';

// Monocromático rojo→negro alineado al brand book.
const ESTADO_BADGE: Record<string, BadgeVariant> = {
  borrador: 'fase-a',
  aprobada: 'fase-a',
  lista_para_publicar: 'fase-b',
  publicada: 'fase-b',
  en_proceso: 'fase-c',
  terna_enviada: 'fase-d',
  seleccionado: 'fase-d',
  en_contratacion: 'fase-e',
  cerrada: 'fase-f',
  desierta: 'neutral',
  cancelada: 'neutral',
  pausada: 'neutral',
};

export default function VacanteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { suscribirVacante } = useVacantes();
  const [vac, setVac] = useState<VacanteDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setErr(null);
    try {
      return suscribirVacante(id, setVac, (msg) => setErr(msg));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cargar la vacante.');
    }
  }, [id, suscribirVacante]);

  if (err) {
    return <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-red-700">{err}</div>;
  }
  if (!vac) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-navy-500">Cargando vacante…</div>
    );
  }

  const fechaPropuesta = vac.fecha_entrevista_propuesta?.toDate?.() ?? null;
  const fechaPactada = vac.fecha_entrevista_pactada?.toDate?.() ?? null;
  const avalAprobadoEn = vac.aval_aprobado_en?.toDate?.() ?? null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <PageHeader
        eyebrow={vac.consecutivo || 'Generando consecutivo…'}
        titulo={vac.cargo_nombre}
        descripcion={`${vac.empresa_nombre} · ${vac.sede_nombre} · ${vac.unidad_nombre}`}
        accion={<Badge variant={ESTADO_BADGE[vac.estado] ?? 'neutral'}>{vac.estado}</Badge>}
      />

      <PoliticaCriticidadBanner criticidad={vac.criticidad} />

      <Card padding="lg">
        <h2 className="font-display text-lg font-bold text-navy-900">Empresa y cargo</h2>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-navy-500">Empresa</dt>
            <dd className="font-medium">
              {vac.empresa_nombre} ({vac.empresa_codigo})
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Sede</dt>
            <dd className="font-medium">
              {vac.sede_nombre} ({vac.sede_codigo})
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Unidad</dt>
            <dd className="font-medium">{vac.unidad_nombre}</dd>
          </div>
          <div>
            <dt className="text-navy-500">Criticidad</dt>
            <dd className="font-medium">{vac.criticidad}</dd>
          </div>
          <div>
            <dt className="text-navy-500">Tipo</dt>
            <dd className="font-medium capitalize">{vac.tipo_solicitud}</dd>
          </div>
          <div>
            <dt className="text-navy-500">Líder solicitante</dt>
            <dd className="font-medium">{vac.lider_nombre}</dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg">
        <h2 className="font-display text-lg font-bold text-navy-900">Condiciones</h2>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-navy-500">Salario base</dt>
            <dd className="font-medium">{formatearCOP(vac.salario_base)}</dd>
          </div>
          <div>
            <dt className="text-navy-500">En banda</dt>
            <dd className="font-medium">
              {vac.en_banda === null
                ? 'Sin banda definida'
                : vac.en_banda
                  ? 'Sí'
                  : 'No (a validar por GH)'}
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Comisiones</dt>
            <dd className="font-medium">{vac.comisiones_texto || '—'}</dd>
          </div>
          <div>
            <dt className="text-navy-500">Rodamiento</dt>
            <dd className="font-medium">{vac.rodamiento ? 'Sí' : 'No'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-navy-500">Garantizado</dt>
            <dd className="font-medium whitespace-pre-line">{vac.garantizado_texto || '—'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-navy-500">Justificación</dt>
            <dd className="font-medium whitespace-pre-line">{vac.justificacion}</dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg">
        <h2 className="font-display text-lg font-bold text-navy-900">Aval y agendamiento</h2>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-navy-500">Aval adjunto</dt>
            <dd>
              <a
                href={vac.aval_url}
                target="_blank"
                rel="noreferrer"
                className="text-gold-700 hover:underline"
              >
                Ver PDF
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Aval aprobado por Alejandro</dt>
            <dd className="font-medium">
              {avalAprobadoEn ? formatearFecha(avalAprobadoEn) : 'Pendiente'}
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Fecha propuesta de entrevista</dt>
            <dd className="font-medium">{formatearFecha(fechaPropuesta)}</dd>
          </div>
          <div>
            <dt className="text-navy-500">Fecha pactada con líder</dt>
            <dd className="font-medium">
              {fechaPactada ? formatearFecha(fechaPactada) : 'Pendiente (paso 3 · perfilamiento)'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg">
        <h2 className="font-display text-lg font-semibold text-navy-900 mb-4">
          Flujograma · 20 pasos
        </h2>
        <p className="text-xs text-navy-500 mb-4">
          El paso resaltado en dorado corresponde al estado actual. Los pasos en verde ya están
          completados. Click en cualquiera para abrir la pantalla correspondiente.
        </p>
        <FlujogramaTimeline vacante={vac} />
      </Card>

      <Link to="/vacantes/nueva" className="text-sm text-navy-500 hover:text-navy-800">
        ← Nueva solicitud
      </Link>
    </div>
  );
}
