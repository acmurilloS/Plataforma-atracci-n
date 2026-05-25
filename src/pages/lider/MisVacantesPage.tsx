import { Link } from 'react-router-dom';
import { AlertTriangle, Briefcase, Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import { formatearCOP } from '../../utils/moneda';
import type { VacanteDoc } from '../../schemas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * MisVacantesPage · sistema brand.
 *
 * Vista líder: todas las vacantes que abrió + alertas urgentes de ternas
 * con reloj activo. La alerta es el corazón de la pantalla: si tiene
 * terna pendiente, ese bloque se ve antes que nada.
 */

const ESTADO_TONO: Record<string, PillTono> = {
  borrador: 'neutral',
  aprobada: 'brand',
  lista_para_publicar: 'brand',
  publicada: 'warning',
  en_proceso: 'info',
  terna_enviada: 'danger',
  seleccionado: 'success',
  en_contratacion: 'brand',
  cerrada: 'success',
  desierta: 'neutral',
  cancelada: 'neutral',
  pausada: 'warning',
};

export default function MisVacantesPage() {
  const { user } = useAuth();
  const { docs: vacantes, cargando } = useColeccion<VacanteDoc>('vacantes', {
    filtros: user ? [['lider_uid', '==', user.uid]] : [],
    orden: ['creado_en', 'desc'],
  });

  // Ternas con reloj activo: ya enviadas y sin respuesta del líder.
  const ternasPendientes = vacantes.filter(
    (v) => v.estado === 'terna_enviada' && v.terna_enviada_en && !v.terna_respondida_en,
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <Pill tono="brand" dot>
            Líder
          </Pill>
          <h1
            className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            Mis vacantes
          </h1>
          <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-xl">
            Todas las solicitudes que has abierto y su estado actual en el flujograma.
            {ternasPendientes.length > 0 && (
              <>
                {' '}
                Tienes{' '}
                <span className="font-semibold text-danger-700">
                  {ternasPendientes.length} terna(s) pendiente(s) de revisar
                </span>
                .
              </>
            )}
          </p>
        </div>
        <Link to="/vacantes/nueva">
          <Button variant="brand-primary" icon={<Plus size={14} strokeWidth={1.75} />}>
            Nueva vacante
          </Button>
        </Link>
      </div>

      {/* Alertas de terna pendiente · paso 13 con reloj 48h */}
      {ternasPendientes.length > 0 && (
        <div className="space-y-3">
          {ternasPendientes.map((v) => {
            const inicioMs = v.terna_enviada_en?.toMillis() ?? 0;
            const msRestantes = 48 * 60 * 60 * 1000 - (Date.now() - inicioMs);
            const horasRestantes = Math.max(0, Math.floor(msRestantes / (60 * 60 * 1000)));
            const vencido = msRestantes <= 0;
            const urgente = horasRestantes <= 24;

            const cajaCls = vencido
              ? 'border-2 border-danger-300 bg-danger-50/40'
              : urgente
                ? 'border-2 border-warning-300 bg-warning-50/40'
                : 'border-2 border-brand-200 bg-gradient-to-br from-brand-50/40 to-white';
            const iconoBg = vencido
              ? 'bg-danger-100 text-danger-700'
              : urgente
                ? 'bg-warning-100 text-warning-700'
                : 'bg-brand-100 text-brand-700';
            const heroCls = vencido
              ? 'text-danger-700'
              : urgente
                ? 'text-warning-700'
                : 'text-brand-700';

            return (
              <Card key={v.id} padding="md" className={cajaCls}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        'w-11 h-11 rounded-md flex items-center justify-center shrink-0',
                        iconoBg,
                      )}
                    >
                      <AlertTriangle size={18} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                        Terna pendiente · paso 13
                      </p>
                      <p className="mt-1 text-[15px] font-semibold text-text-strong">
                        Ya te conseguimos candidatos para{' '}
                        <span className="text-brand-700">{v.cargo_nombre}</span>
                      </p>
                      <p className="text-[12px] text-text-muted mt-0.5">
                        <span className="font-mono">{v.consecutivo}</span> · {v.empresa_nombre} ·{' '}
                        {v.sede_nombre}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p
                        className={cn(
                          'text-[28px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums',
                          heroCls,
                        )}
                      >
                        {vencido ? 'Vencido' : `${horasRestantes}h`}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.08em] text-text-subtle font-bold">
                        {vencido ? 'Se pausará' : 'restantes'}
                      </p>
                    </div>
                    <Link to={`/vacantes/${v.id}/terna`}>
                      <Button
                        variant={vencido ? 'destructive-primary' : 'brand-primary'}
                        size="medium"
                      >
                        Revisar terna →
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {!cargando && vacantes.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
            <Briefcase size={20} strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-text-strong">
            Aún no has abierto vacantes
          </p>
          <p className="text-[12px] text-text-muted mt-1 max-w-sm mx-auto">
            Crea tu primera solicitud desde el botón "Nueva vacante" en la parte superior.
          </p>
          <Link to="/vacantes/nueva" className="inline-block mt-4">
            <Button variant="brand-primary" icon={<Plus size={14} strokeWidth={1.75} />}>
              Nueva vacante
            </Button>
          </Link>
        </div>
      )}

      {vacantes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Histórico · <span className="tabular-nums text-text-strong">{vacantes.length}</span>{' '}
              vacantes
            </p>
          </div>
          <Card padding="none" className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Consecutivo
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Cargo
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Salario
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Creada
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {vacantes.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-strong text-[12px]">
                      {v.consecutivo || (
                        <span className="text-text-subtle italic">pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-strong">{v.cargo_nombre}</td>
                    <td className="px-4 py-3 text-text-muted tabular-nums">
                      {formatearCOP(v.salario_base)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tono={ESTADO_TONO[v.estado] ?? 'neutral'} dot>
                        {v.estado.replace(/_/g, ' ')}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-[12px] tabular-nums">
                      {v.creado_en ? formatearFecha(v.creado_en.toDate()) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/vacantes/${v.id}`}
                        className="text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
                      >
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
