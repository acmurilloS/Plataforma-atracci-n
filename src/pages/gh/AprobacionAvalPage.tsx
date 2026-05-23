import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, X, Check } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearCOP } from '../../utils/moneda';
import { formatearFecha } from '../../utils/fechas';
import type { VacanteDoc } from '../../schemas';

type Filtro = 'pendientes' | 'aprobadas' | 'rechazadas';

export default function AprobacionAvalPage() {
  const { user, perfil } = useAuth();
  const { actualizar, crear } = useMutacion();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');

  // Cargamos las 3 cohortes para que el contador funcione sin re-query
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

  // Solo mostramos en "pendientes" las que tengan aval_url subido.
  const pendientes = useMemo(() => borradores.filter((v) => !!v.aval_url), [borradores]);
  // Rechazadas filtradas a las que tienen razón "GH rechazó" (las otras pueden venir de cancelaciones del líder).
  const rechazadas = useMemo(
    () => canceladas.filter((v) => (v.razon_cierre ?? '').toLowerCase().includes('gh rechazó')),
    [canceladas],
  );

  const visibles = filtro === 'pendientes' ? pendientes : filtro === 'aprobadas' ? aprobadas : rechazadas;

  async function aprobar(v: VacanteDoc, nota: string) {
    if (!user) return;
    setProcesando(v.id);
    setErr(null);
    try {
      const ahora = Timestamp.now();
      // 1) Vacante a estado aprobada con auditoría del aval
      await actualizar('vacantes', v.id, {
        estado: 'aprobada',
        aval_aprobado_por: user.uid,
        aval_aprobado_en: ahora,
      });

      // 2) Notificación al líder solicitante
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
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-equitel-rojo-700 font-bold flex items-center gap-1.5">
          <ShieldCheck size={14} /> Paso 2 · GH / Coordinación
        </p>
        <h1 className="font-display text-3xl font-semibold text-navy-900 mt-1">
          Aprobación de aval y condiciones
        </h1>
        <p className="text-sm text-navy-600 mt-1">
          Revisa el aval firmado por Alejandro, valida la banda salarial y aprueba o rechaza cada
          vacante en borrador. Solo después de aprobar pasa a perfilamiento.
        </p>
      </header>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-100">
        <TabBtn label="Pendientes" count={pendientes.length} activo={filtro === 'pendientes'} onClick={() => setFiltro('pendientes')} />
        <TabBtn label="Aprobadas" count={aprobadas.length} activo={filtro === 'aprobadas'} onClick={() => setFiltro('aprobadas')} />
        <TabBtn label="Rechazadas" count={rechazadas.length} activo={filtro === 'rechazadas'} onClick={() => setFiltro('rechazadas')} />
      </div>

      {cargB && filtro === 'pendientes' && (
        <p className="text-sm text-navy-500">Cargando vacantes…</p>
      )}

      {!cargB && visibles.length === 0 && (
        <div className="rounded-xl border border-dashed border-navy-200 bg-cream-50 p-10 text-center">
          <p className="font-display text-base font-semibold text-navy-900">
            {filtro === 'pendientes'
              ? 'No hay vacantes pendientes de aprobación'
              : filtro === 'aprobadas'
                ? 'Aún no hay vacantes aprobadas'
                : 'Aún no hay vacantes rechazadas'}
          </p>
          {filtro === 'pendientes' && (
            <p className="text-sm text-navy-500 mt-1">
              Cuando un líder cree una vacante con aval adjunto, aparecerá aquí para revisión.
            </p>
          )}
        </div>
      )}

      {filtro === 'pendientes' && (
        <div className="space-y-3">
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

// ─── Tabs ──────────────────────────────────────────────────────────────

function TabBtn({ label, count, activo, onClick }: { label: string; count: number; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 px-1 text-sm font-medium border-b-2 transition ${
        activo
          ? 'text-navy-900 border-equitel-rojo-600'
          : 'text-navy-500 border-transparent hover:text-navy-800'
      }`}
    >
      {label}
      <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        activo ? 'bg-equitel-rojo-100 text-equitel-rojo-700' : 'bg-navy-100 text-navy-600'
      }`}>
        {count}
      </span>
    </button>
  );
}

// ─── Card de vacante pendiente ─────────────────────────────────────────

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

  const enBandaTexto =
    vacante.en_banda === null
      ? 'Sin banda definida'
      : vacante.en_banda
        ? 'En banda'
        : 'Fuera de banda';
  const enBandaColor =
    vacante.en_banda === null
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : vacante.en_banda
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-red-50 text-red-700 border-red-200';

  return (
    <article className="rounded-xl border border-navy-100 bg-white p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-mono text-xs text-navy-500">{vacante.consecutivo || 'pendiente'}</p>
          <h3 className="font-display text-xl font-semibold text-navy-900 mt-0.5">
            {vacante.cargo_nombre}
          </h3>
          <p className="text-sm text-navy-600">
            {vacante.empresa_nombre} · {vacante.sede_nombre} · {vacante.unidad_nombre}
          </p>
          <p className="text-xs text-navy-500 mt-1">
            Solicitado por <span className="font-medium">{vacante.lider_nombre}</span> · Criticidad{' '}
            <span className="font-medium">{vacante.criticidad}</span> · {vacante.tipo_solicitud}
            {vacante.creado_en && (
              <> · creada {formatearFecha(vacante.creado_en.toDate())}</>
            )}
          </p>
        </div>
        <Link
          to={`/vacantes/${vacante.id}`}
          className="text-xs text-equitel-rojo-700 hover:underline whitespace-nowrap"
        >
          Ver detalle completo →
        </Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <Dato label="Salario base" valor={formatearCOP(vacante.salario_base)} />
        <Dato
          label="Banda salarial"
          valor={enBandaTexto}
          className={`rounded-md border px-3 py-2 ${enBandaColor}`}
        />
        <Dato
          label="Tipo solicitud"
          valor={vacante.tipo_solicitud === 'reemplazo' ? 'Reemplazo' : 'Aumento de planta'}
        />
        <Dato label="Comisiones" valor={vacante.comisiones_texto || 'No aplica'} />
      </section>

      {vacante.justificacion && (
        <section className="rounded-md bg-cream-50 border-l-2 border-equitel-rojo-300 p-3">
          <p className="text-[11px] uppercase tracking-wide text-navy-500 font-bold">Justificación del líder</p>
          <p className="text-sm text-navy-700 mt-1 whitespace-pre-line">{vacante.justificacion}</p>
        </section>
      )}

      <section className="flex items-center justify-between gap-3 rounded-md border border-navy-100 p-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-equitel-rojo-700" />
          <div>
            <p className="text-sm font-semibold text-navy-900">Aval firmado por Alejandro</p>
            <p className="text-[11px] text-navy-500">PDF adjunto · revisa antes de aprobar</p>
          </div>
        </div>
        <a
          href={vacante.aval_url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-cream-100"
        >
          Abrir PDF ↗
        </a>
      </section>

      {!mostrarRechazo && (
        <>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota interna de GH (opcional, ej. observaciones sobre el salario o la justificación)"
            rows={2}
            className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          <footer className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setMostrarRechazo(true)}
              disabled={procesando}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              <X size={14} /> Rechazar
            </button>
            <button
              type="button"
              onClick={() => onAprobar(nota)}
              disabled={procesando}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              <Check size={14} /> {procesando ? 'Aprobando…' : 'Aprobar'}
            </button>
          </footer>
        </>
      )}

      {mostrarRechazo && (
        <FormularioRechazo
          onCancelar={() => setMostrarRechazo(false)}
          onConfirmar={(motivo) => onRechazar(motivo)}
          procesando={procesando}
        />
      )}
    </article>
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
    <div className="rounded-md border border-red-200 bg-red-50/50 p-4 space-y-3">
      <p className="text-sm font-semibold text-red-800">Motivo del rechazo (obligatorio)</p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. Salario fuera de banda y sin justificación financiera. Reabrir cuando se ajuste."
        rows={3}
        className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancelar}
          disabled={procesando}
          className="rounded-md border border-navy-200 px-4 py-2 text-sm text-navy-700 hover:bg-cream-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => motivo.trim() && onConfirmar(motivo.trim())}
          disabled={procesando || !motivo.trim()}
          className="rounded-md bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:bg-red-300"
        >
          {procesando ? 'Rechazando…' : 'Confirmar rechazo'}
        </button>
      </div>
    </div>
  );
}

// ─── Fila histórica ───────────────────────────────────────────────────

function VacanteRowHistorica({ vacante, rechazada }: { vacante: VacanteDoc; rechazada: boolean }) {
  return (
    <div className="rounded-md border border-navy-100 bg-white p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-navy-500">{vacante.consecutivo}</p>
        <p className="font-medium text-sm text-navy-900 truncate">
          {vacante.cargo_nombre} · {vacante.empresa_nombre}
        </p>
        <p className="text-xs text-navy-500">
          {rechazada ? vacante.razon_cierre : `Salario ${formatearCOP(vacante.salario_base)}`}
          {vacante.aval_aprobado_en && !rechazada && (
            <> · aprobada {formatearFecha(vacante.aval_aprobado_en.toDate())}</>
          )}
        </p>
      </div>
      <Link
        to={`/vacantes/${vacante.id}`}
        className="text-xs text-equitel-rojo-700 hover:underline"
      >
        Ver →
      </Link>
    </div>
  );
}

function Dato({ label, valor, className }: { label: string; valor: string; className?: string }) {
  return (
    <div className={className ?? 'rounded-md bg-cream-50 px-3 py-2'}>
      <p className="text-[11px] text-navy-500 uppercase tracking-wide font-semibold">{label}</p>
      <p className="font-semibold text-navy-900 mt-0.5">{valor}</p>
    </div>
  );
}
