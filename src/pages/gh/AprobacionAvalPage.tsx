import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, FileText, ShieldCheck, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearCOP } from '../../utils/moneda';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';
import { TIPO_SOLICITUD_LABEL, type VacanteDoc } from '../../schemas';

/**
 * AprobacionAvalPage · sistema brand.
 *
 * GH revisa el aval firmado por Alejandro (paso 2 del flujograma).
 * Tabs: Pendientes / Aprobadas / Rechazadas. Card de vacante con datos
 * clave + PDF + acciones Aprobar / Rechazar con motivo obligatorio.
 */

type Filtro = 'pendientes' | 'aprobadas' | 'rechazadas';

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 resize-none leading-relaxed';

export default function AprobacionAvalPage() {
  const { user, perfil } = useAuth();
  const { actualizar, crear } = useMutacion();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');

  // useColeccion ya hace fallback automático a orden en cliente si el
  // índice compuesto no existe — no quedan listas vacías por queries 400.
  const { docs: borradores, cargando: cargB } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'borrador']],
    orden: ['creado_en', 'desc'],
  });
  const { docs: aprobadas } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'aprobada']],
    orden: ['creado_en', 'desc'],
    limit: 50,
  });
  const { docs: canceladas } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'cancelada']],
    orden: ['creado_en', 'desc'],
    limit: 50,
  });

  // Todos los borradores aparecen, incluso los que vienen sin aval. Las
  // que tienen `aval_pendiente=true` se marcan con chip warning para que
  // GH sepa que debe pedirlo al líder o adjuntarlo en su nombre.
  const pendientes = borradores;
  const rechazadas = useMemo(
    () => canceladas.filter((v) => (v.razon_cierre ?? '').toLowerCase().includes('gh rechazó')),
    [canceladas],
  );

  const visibles =
    filtro === 'pendientes'
      ? pendientes
      : filtro === 'aprobadas'
        ? aprobadas
        : rechazadas;

  async function aprobar(v: VacanteDoc, nota: string) {
    if (!user) return;
    setProcesando(v.id);
    setErr(null);
    try {
      const ahora = Timestamp.now();
      await actualizar('vacantes', v.id, {
        estado: 'aprobada',
        aval_aprobado_por: user.uid,
        aval_aprobado_en: ahora,
      });
      await crear('notificaciones', {
        destinatario_uid: v.lider_uid,
        tipo: 'aval_aprobado',
        titulo: 'Aval aprobado · vacante lista para perfilamiento',
        mensaje: `${v.cargo_nombre} (${v.consecutivo}) fue aprobada por ${perfil?.nombre ?? 'GH'}. ${nota ? `Nota: ${nota}` : ''}`.trim(),
        link: `/vacantes/${v.id}`,
        leida: false,
        leida_en: null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos aprobar.');
    } finally {
      setProcesando(null);
    }
  }

  async function rechazar(v: VacanteDoc, motivo: string) {
    if (!user) return;
    if (!motivo.trim()) {
      setErr('El motivo es obligatorio al rechazar.');
      return;
    }
    setProcesando(v.id);
    setErr(null);
    try {
      const ahora = Timestamp.now();
      await actualizar('vacantes', v.id, {
        estado: 'cancelada',
        razon_cierre: `GH rechazó: ${motivo}`,
        cerrada_en: ahora,
      });
      await crear('notificaciones', {
        destinatario_uid: v.lider_uid,
        tipo: 'aval_rechazado',
        titulo: 'Aval rechazado · revisa observaciones',
        mensaje: `${v.cargo_nombre} (${v.consecutivo}) fue rechazada por ${perfil?.nombre ?? 'GH'}. Motivo: ${motivo}`,
        link: `/vacantes/${v.id}`,
        leida: false,
        leida_en: null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos rechazar.');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Paso 2 · GH / Coordinación
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Aprobación de aval y condiciones
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Revisa el aval firmado por Alejandro, valida la banda salarial y aprueba o rechaza cada
          vacante en borrador. Solo después de aprobar pasa a perfilamiento.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6 -mb-px">
          <TabBtn
            label="Pendientes"
            count={pendientes.length}
            tono="warning"
            activo={filtro === 'pendientes'}
            onClick={() => setFiltro('pendientes')}
          />
          <TabBtn
            label="Aprobadas"
            count={aprobadas.length}
            tono="success"
            activo={filtro === 'aprobadas'}
            onClick={() => setFiltro('aprobadas')}
          />
          <TabBtn
            label="Rechazadas"
            count={rechazadas.length}
            tono="danger"
            activo={filtro === 'rechazadas'}
            onClick={() => setFiltro('rechazadas')}
          />
        </nav>
      </div>

      {cargB && filtro === 'pendientes' && (
        <p className="text-[13px] text-text-muted">Cargando vacantes…</p>
      )}

      {!cargB && visibles.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={20} strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-text-strong">
            {filtro === 'pendientes'
              ? 'No hay vacantes pendientes de aprobación'
              : filtro === 'aprobadas'
                ? 'Aún no hay vacantes aprobadas'
                : 'Aún no hay vacantes rechazadas'}
          </p>
          {filtro === 'pendientes' && (
            <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
              Cuando un líder cree una vacante (con o sin aval), aparecerá aquí para revisión.
            </p>
          )}
        </div>
      )}

      {filtro === 'pendientes' && (
        <div className="space-y-4">
          {visibles.map((v) => (
            <VacanteCardAprobacion
              key={v.id}
              vacante={v}
              procesando={procesando === v.id}
              onAprobar={(n) => aprobar(v, n)}
              onRechazar={(n) => rechazar(v, n)}
            />
          ))}
        </div>
      )}

      {filtro !== 'pendientes' && (
        <div className="space-y-2">
          {visibles.map((v) => (
            <VacanteRowHistorica key={v.id} vacante={v} rechazada={filtro === 'rechazadas'} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  label,
  count,
  activo,
  tono,
  onClick,
}: {
  label: string;
  count: number;
  activo: boolean;
  tono: PillTono;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative pb-3 text-[13px] font-medium transition-colors duration-150 ease-out border-b-2 inline-flex items-center gap-2',
        activo
          ? 'text-text-strong border-brand-600'
          : 'text-text-muted border-transparent hover:text-text-strong',
      )}
    >
      {label}
      <Pill tono={activo ? tono : 'neutral'}>
        <span className="tabular-nums">{count}</span>
      </Pill>
    </button>
  );
}

function VacanteCardAprobacion({
  vacante,
  procesando,
  onAprobar,
  onRechazar,
}: {
  vacante: VacanteDoc;
  procesando: boolean;
  onAprobar: (nota: string) => void;
  onRechazar: (motivo: string) => void;
}) {
  const [nota, setNota] = useState('');
  const [mostrarRechazo, setMostrarRechazo] = useState(false);

  const bandaTono: PillTono =
    vacante.en_banda === null ? 'warning' : vacante.en_banda ? 'success' : 'danger';
  const bandaLabel =
    vacante.en_banda === null
      ? 'Sin banda definida'
      : vacante.en_banda
        ? 'En banda'
        : 'Fuera de banda';

  return (
    <Card padding="lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-subtle">
            {vacante.consecutivo || 'pendiente'}
          </p>
          <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.018em] text-text-strong">
            {vacante.cargo_nombre}
          </h3>
          <p className="text-[13px] text-text-muted mt-1">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          <p className="text-[11px] text-text-subtle mt-2">
            Solicitado por{' '}
            <span className="font-medium text-text-body">{vacante.lider_nombre}</span> ·{' '}
            Criticidad <span className="font-medium text-text-body">{vacante.criticidad}</span> ·{' '}
            {vacante.tipo_solicitud}
            {vacante.creado_en && (
              <> · creada {formatearFecha(vacante.creado_en.toDate())}</>
            )}
          </p>
        </div>
        <Link
          to={`/vacantes/${vacante.id}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline whitespace-nowrap"
        >
          Ver detalle completo
          <ExternalLink size={11} strokeWidth={1.75} />
        </Link>
      </div>

      {/* Datos clave */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <Dato label="Salario base" valor={formatearCOP(vacante.salario_base)} hero />
        <DatoPill label="Banda salarial" valor={bandaLabel} tono={bandaTono} />
        <Dato
          label="Tipo solicitud"
          valor={TIPO_SOLICITUD_LABEL[vacante.tipo_solicitud] ?? '—'}
        />
        <Dato label="Comisiones" valor={vacante.comisiones_texto || 'No aplica'} />
      </div>

      {/* Justificación */}
      {vacante.justificacion && (
        <div className="mt-5 rounded-md bg-slate-50 border-l-2 border-brand-400 p-4">
          <p className="text-[10px] uppercase tracking-[0.10em] text-text-muted font-bold">
            Justificación del líder
          </p>
          <p className="text-[13px] text-text-body mt-1.5 whitespace-pre-line leading-relaxed">
            {vacante.justificacion}
          </p>
        </div>
      )}

      {/* Aval PDF · estado distinto si está pendiente */}
      {vacante.aval_url ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-slate-200 p-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <FileText size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-text-strong">
                Aval firmado por Alejandro
              </p>
              <p className="text-[11px] text-text-subtle">
                PDF adjunto · revisa antes de aprobar
              </p>
            </div>
          </div>
          <a
            href={vacante.aval_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white text-text-strong px-3 py-2 text-[12px] font-medium hover:bg-slate-50 transition-colors duration-150"
          >
            <ExternalLink size={11} strokeWidth={1.75} />
            Abrir PDF
          </a>
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-md border-2 border-warning-300 bg-warning-50/50 p-4">
          <div className="w-10 h-10 rounded-md bg-warning-100 text-warning-700 flex items-center justify-center shrink-0">
            <FileText size={18} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-warning-700">
              Aval pendiente · el líder envió sin adjuntar PDF
            </p>
            <p className="text-[12px] text-warning-700 mt-0.5 leading-[1.5]">
              Pídele a <span className="font-semibold">{vacante.lider_nombre}</span> que
              suba el aval firmado por Alejandro, o adjúntalo tú mismo desde el detalle
              de la vacante antes de aprobar.
            </p>
          </div>
        </div>
      )}

      {/* Acciones */}
      {!mostrarRechazo && (
        <div className="mt-5 space-y-3">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota interna de GH (opcional, ej. observaciones sobre salario o justificación)"
            rows={2}
            className={inputClass}
          />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="destructive-secondary"
              onClick={() => setMostrarRechazo(true)}
              disabled={procesando}
              icon={<X size={13} strokeWidth={1.75} />}
            >
              Rechazar
            </Button>
            <Button
              type="button"
              variant="brand-primary"
              onClick={() => onAprobar(nota)}
              disabled={procesando}
              loading={procesando}
              icon={<Check size={13} strokeWidth={1.75} />}
            >
              {procesando ? 'Aprobando…' : 'Aprobar'}
            </Button>
          </div>
        </div>
      )}

      {mostrarRechazo && (
        <FormularioRechazo
          onCancelar={() => setMostrarRechazo(false)}
          onConfirmar={(motivo) => onRechazar(motivo)}
          procesando={procesando}
        />
      )}
    </Card>
  );
}

function FormularioRechazo({
  onCancelar,
  onConfirmar,
  procesando,
}: {
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
  procesando: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="mt-5 rounded-md border border-danger-500/30 bg-danger-50/40 p-4 space-y-3">
      <p className="text-[13px] font-semibold text-danger-700">
        Motivo del rechazo <span className="text-text-subtle font-normal">(obligatorio)</span>
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. Salario fuera de banda y sin justificación financiera. Reabrir cuando se ajuste."
        rows={3}
        className={inputClass}
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="neutral-secondary"
          onClick={onCancelar}
          disabled={procesando}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive-primary"
          onClick={() => motivo.trim() && onConfirmar(motivo.trim())}
          disabled={procesando || !motivo.trim()}
          loading={procesando}
        >
          {procesando ? 'Rechazando…' : 'Confirmar rechazo'}
        </Button>
      </div>
    </div>
  );
}

function VacanteRowHistorica({
  vacante,
  rechazada,
}: {
  vacante: VacanteDoc;
  rechazada: boolean;
}) {
  return (
    <Card padding="sm" className="!p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-subtle">
            {vacante.consecutivo}
          </p>
          <p className="text-[14px] font-medium text-text-strong truncate mt-0.5">
            {vacante.cargo_nombre} · {vacante.empresa_nombre}
          </p>
          <p className="text-[12px] text-text-muted mt-0.5">
            {rechazada ? (
              <span className="italic">{vacante.razon_cierre}</span>
            ) : (
              <span className="tabular-nums">Salario {formatearCOP(vacante.salario_base)}</span>
            )}
            {vacante.aval_aprobado_en && !rechazada && (
              <>
                {' '}
                · aprobada{' '}
                <span className="tabular-nums">
                  {formatearFecha(vacante.aval_aprobado_en.toDate())}
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          to={`/vacantes/${vacante.id}`}
          className="text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          Ver →
        </Link>
      </div>
    </Card>
  );
}

function Dato({
  label,
  valor,
  hero,
}: {
  label: string;
  valor: string;
  hero?: boolean;
}) {
  return (
    <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 text-text-strong',
          hero
            ? 'text-[18px] font-light tracking-[-0.02em] tabular-nums'
            : 'text-[13px] font-medium',
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function DatoPill({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono: PillTono;
}) {
  return (
    <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-subtle">{label}</p>
      <div className="mt-1.5">
        <Pill tono={tono} dot>
          {valor}
        </Pill>
      </div>
    </div>
  );
}

