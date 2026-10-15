import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ExternalLink, FileText, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearCOP } from '../../utils/moneda';
import { formatearFecha } from '../../utils/fechas';
import { puedeVerVacante } from '../../utils/accesoRutas';
import { textoRodamiento } from '../../utils/rodamiento';
import { motivosAval, textoMotivoAval } from '../../utils/avalSolicitud';
import { mensajeErrorFuncion } from '../../utils/errores';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { CondicionesVacante } from '../../components/vacantes/CondicionesVacante';
import { VisorSolicitudOficial } from '../../components/vacantes/VisorSolicitudOficial';
import { EncabezadoPagina } from '../../components/ui/EncabezadoPagina';
import { cn } from '../../utils/cn';
import {
  TIPO_NOVEDAD_LABEL,
  TIPO_SOLICITUD_LABEL,
  TIPOS_REVISION_GH,
  type EstadoVacante,
  type NovedadVacanteDoc,
  type TipoNovedadVacante,
  type VacanteDoc,
} from '../../schemas';

/**
 * AprobacionAvalPage · sistema brand.
 *
 * GH revisa el aval firmado por Alejandro (paso 2 del flujograma).
 * Tabs: Pendientes / Aprobadas / Rechazadas. Card de vacante con datos
 * clave + PDF + acciones Aprobar / Rechazar con motivo obligatorio.
 *
 * Las condiciones (salario, rodamiento con VALOR, comisiones, garantizado, a
 * quién reemplaza) salen de `CondicionesVacante` (reu Karen 16-sep: Diego, rol
 * gh, no ve el detalle de la vacante y aquí le faltaban esos datos). Las filas
 * históricas conservan el link al aval: antes desaparecía al aprobar.
 *
 * "Aprobadas" = TODO lo que ya pasó la aprobación, en cualquier paso (reu Karen
 * 25-sep, punto 6): antes la pestaña consultaba solo `estado == 'aprobada'`, así
 * que en cuanto coordinación publicaba la vacante, a Diego "se le borraba" la
 * solicitud que acababa de aprobar. Ahora cada fila se despliega con la
 * solicitud completa (condiciones, justificación, aval, estado actual).
 *
 * Reu Karen + Diego 08-oct: "Rechazar" ya NO cancela la vacante (se borraba del
 * tablero de Karen y se perdía el consecutivo). Ahora la DEVUELVE al líder
 * (estado `devuelta`) con el motivo; el líder la corrige y la reenvía, y vuelve a
 * Pendientes marcada como "Corregida". Aprobar y devolver pasan por la callable
 * `decidirSolicitudVacante` (estado + bitácora + avisos en una transacción). La
 * nota que Diego ya escribió pasa al motivo del rechazo (antes se borraba).
 */

type Filtro = 'pendientes' | 'aprobadas' | 'rechazadas';

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40 resize-none leading-relaxed';

/**
 * Estados que NO cuentan como "ya aprobada": el borrador sigue pendiente, la
 * devuelta está con el líder y la cancelada incluye los rechazos viejos de GH
 * (razon_cierre 'GH rechazó…', de antes del 08-oct), que viven en "Rechazadas".
 * Todo lo demás (aprobada, publicada, en proceso, terna, contratación, cerrada,
 * desierta, pausada) pasó por la aprobación.
 */
const ESTADOS_SIN_APROBAR = new Set<EstadoVacante>(['borrador', 'devuelta', 'cancelada']);

// Estado ACTUAL de la vacante en la fila histórica (mismos tonos que Mis
// vacantes). Label corto en español para la Pill: aquí importa saber en qué
// paso va, no el detalle de la fase.
const ESTADO_TONO: Record<string, PillTono> = {
  borrador: 'neutral',
  devuelta: 'danger',
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
const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Pendiente de aprobación',
  devuelta: 'Devuelta · esperando corrección del líder',
  aprobada: 'Aprobada · en perfilamiento',
  lista_para_publicar: 'Lista para publicar',
  publicada: 'Publicada',
  en_proceso: 'En proceso de selección',
  terna_enviada: 'Terna enviada al líder',
  seleccionado: 'Integrante seleccionado',
  en_contratacion: 'En contratación',
  cerrada: 'Cerrada',
  desierta: 'Desierta',
  cancelada: 'Cancelada',
  pausada: 'Pausada',
};

export default function AprobacionAvalPage() {
  const { user, rol } = useAuth();
  // GH (Diego/Paola) NO tiene acceso al detalle de vacantes ajenas (reu Karen
  // 09-jul: no ven el pipeline de reclutamiento). La card de aprobación ya trae
  // todo lo necesario para decidir, así que a ellos se les oculta el link (si
  // no, caían en "Sin permisos"). Coordinación y admin sí pueden abrirlo.
  // EXCEPCIÓN (reu Karen 25-sep): cuando gh es el LÍDER SOLICITANTE de la
  // vacante (lider_uid == su uid, p. ej. Diego con ET-BOG-1014) sí puede abrir
  // su detalle. Se decide por vacante, no por rol, para no abrir vacantes ajenas.
  const puedeVerDetallePorRol = puedeVerVacante(rol);
  const puedeAbrirDetalle = (v: VacanteDoc) =>
    puedeVerDetallePorRol || (rol === 'gh' && !!user && v.lider_uid === user.uid);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');

  // useColeccion ya hace fallback automático a orden en cliente si el
  // índice compuesto no existe — no quedan listas vacías por queries 400.
  const { docs: borradores, cargando: cargB } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'borrador']],
    orden: ['creado_en', 'desc'],
  });
  // Lista amplia SIN filtro de estado para "Aprobadas" (reu Karen 25-sep): una
  // sola suscripción grande (300 más recientes) y el corte por estado se hace en
  // cliente. Firestore permite a gh/coordinación/admin listar todas las vacantes.
  const { docs: todas, cargando: cargA } = useColeccion<VacanteDoc>('vacantes', {
    orden: ['creado_en', 'desc'],
    limit: 300,
  });
  // Devueltas al líder (reu 08-oct): siguen vivas hasta que el líder las corrija.
  const { docs: devueltas, cargando: cargD } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'devuelta']],
    orden: ['creado_en', 'desc'],
  });
  // Rechazos de antes del 08-oct: quedaron canceladas con razon_cierre 'GH rechazó…'.
  const { docs: canceladas, cargando: cargC } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'cancelada']],
    orden: ['creado_en', 'desc'],
    limit: 50,
  });

  // Todos los borradores aparecen, incluso los que vienen sin aval. Las
  // que tienen `aval_pendiente=true` se marcan con chip warning para que
  // GH sepa que debe pedirlo al líder o adjuntarlo en su nombre.
  const pendientes = borradores;
  // Aprobadas en cualquier paso: ordenadas por la fecha en que GH aprobó (o la
  // de creación si la vacante viene de antes de que se guardara ese dato).
  const aprobadas = useMemo(() => {
    const fechaMs = (v: VacanteDoc) => (v.aval_aprobado_en ?? v.creado_en)?.toMillis() ?? 0;
    return todas
      .filter(
        (v) =>
          !ESTADOS_SIN_APROBAR.has(v.estado) &&
          // Un borrador (o devuelta) suspendido desde la bitácora nunca pasó por GH:
          // no es "aprobada".
          !(
            v.estado === 'pausada' &&
            (v.estado_previo_pausa === 'borrador' || v.estado_previo_pausa === 'devuelta')
          ),
      )
      .sort((a, b) => fechaMs(b) - fechaMs(a));
  }, [todas]);
  // Rechazadas = devueltas vivas (las más recientes primero) + rechazos viejos.
  const rechazadas = useMemo(() => {
    const ms = (v: VacanteDoc) => (v.devuelta_en ?? v.creado_en)?.toMillis() ?? 0;
    const viejas = canceladas.filter((v) =>
      (v.razon_cierre ?? '').toLowerCase().includes('gh rechazó'),
    );
    return [...[...devueltas].sort((a, b) => ms(b) - ms(a)), ...viejas];
  }, [devueltas, canceladas]);

  const visibles =
    filtro === 'pendientes'
      ? pendientes
      : filtro === 'aprobadas'
        ? aprobadas
        : rechazadas;
  // Cada pestaña espera a SU query: si no, "Aprobadas" mostraba el vacío un
  // instante mientras llegaba la lista amplia.
  const cargando =
    filtro === 'pendientes' ? cargB : filtro === 'aprobadas' ? cargA : cargC || cargD;

  /** Aprobar o devolver: la callable hace estado + bitácora + avisos juntos. */
  async function decidir(v: VacanteDoc, decision: 'aprobar' | 'devolver', nota: string) {
    if (!user) return;
    if (decision === 'devolver' && nota.trim().length < 5) {
      setErr('Escribe el motivo de la devolución: el líder lo necesita para corregir.');
      return;
    }
    setProcesando(v.id);
    setErr(null);
    setAviso(null);
    try {
      const fn = httpsCallable(functions, 'decidirSolicitudVacante');
      await fn({ vacante_id: v.id, decision, nota: nota.trim() });
      setAviso(
        decision === 'aprobar'
          ? `${v.consecutivo} aprobada. Le avisamos a ${v.lider_nombre || 'el líder'}.`
          : `${v.consecutivo} devuelta a ${v.lider_nombre || 'el líder'} para corregir. Queda en «Rechazadas» con su consecutivo y le avisamos a coordinación.`,
      );
    } catch (e) {
      setErr(
        mensajeErrorFuncion(e, decision === 'aprobar' ? 'No pudimos aprobar.' : 'No pudimos devolver la solicitud.'),
      );
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <EncabezadoPagina
        icono={<ShieldCheck size={26} strokeWidth={1.6} />}
        tono="brand"
        eyebrow="Paso 2 · GH / Coordinación"
        titulo="Aprobación de aval y condiciones"
        descripcion="Revisa el aval firmado por Alejandro y las condiciones de cada solicitud. Apruébala o recházala con un motivo: la rechazada vuelve al líder para corregirla, con el mismo consecutivo. Solo después de aprobar pasa a perfilamiento."
      />

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}
      {aviso && (
        <div className="rounded-md border border-success-500/20 bg-success-50 px-3.5 py-2.5 text-[13px] text-success-700">
          {aviso}
        </div>
      )}

      {/* Tabs (+ copy de la pestaña activa cuando hace falta aclararla) */}
      <div className="space-y-3">
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

        {/* Rechazadas: siguen vivas con su consecutivo (reu 08-oct). */}
        {filtro === 'rechazadas' && !cargando && visibles.length > 0 && (
          <p className="text-[12px] text-text-muted">
            Solicitudes que devolviste al líder para corregir. No se cancelan: conservan el
            consecutivo y el historial, y cuando el líder las corrige vuelven a{' '}
            <span className="font-medium text-text-body">Pendientes</span> marcadas como corregidas.
          </p>
        )}
        {/* Aprobadas: aquí la solicitud no se "borra" al avanzar (reu Karen 25-sep). */}
        {filtro === 'aprobadas' && !cargando && visibles.length > 0 && (
          <p className="text-[12px] text-text-muted">
            Todas las solicitudes que ya pasaron la aprobación, en cualquier paso del proceso
            (perfilamiento, publicada, selección, contratación o cerrada). Despliega una fila con{' '}
            <span className="font-medium text-text-body">Ver solicitud</span> para revisar las
            condiciones, la justificación y el aval tal como se aprobaron.
          </p>
        )}
      </div>

      {cargando && <p className="text-[13px] text-text-muted">Cargando vacantes…</p>}

      {!cargando && visibles.length === 0 && (
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
          {filtro === 'aprobadas' && (
            <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
              Aquí quedan todas las solicitudes ya aprobadas, en cualquier paso del proceso,
              para volver a consultarlas.
            </p>
          )}
          {filtro === 'rechazadas' && (
            <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
              Cuando rechaces una solicitud, quedará aquí con su motivo hasta que el líder la
              corrija y la reenvíe.
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
              puedeVerDetalle={puedeAbrirDetalle(v)}
              onAprobar={(n) => decidir(v, 'aprobar', n)}
              onRechazar={(n) => decidir(v, 'devolver', n)}
            />
          ))}
        </div>
      )}

      {filtro !== 'pendientes' && (
        <div className="space-y-2">
          {visibles.map((v) => (
            <VacanteRowHistorica
              key={v.id}
              vacante={v}
              rechazada={filtro === 'rechazadas'}
              puedeVerDetalle={puedeAbrirDetalle(v)}
            />
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

/**
 * Justificación del líder · mismo bloque en la tarjeta pendiente y en la fila
 * histórica desplegada (reu Karen 25-sep: la solicitud completa se debe poder
 * volver a leer después de aprobar).
 */
function BloqueJustificacion({ vacante }: { vacante: VacanteDoc }) {
  if (!vacante.justificacion) return null;
  return (
    <div className="rounded-md bg-slate-50 border-l-2 border-brand-400 p-4">
      <p className="text-[10px] uppercase tracking-[0.10em] text-text-muted font-bold">
        Justificación del líder
      </p>
      <p className="text-[13px] text-text-body mt-1.5 whitespace-pre-line leading-relaxed">
        {vacante.justificacion}
      </p>
    </div>
  );
}

/**
 * Aval · 3 estados (PDF adjunto / no requiere / pendiente). Lo comparten la
 * tarjeta pendiente y la fila histórica desplegada. `contexto='historico'` solo
 * cambia el copy: ya no tiene sentido decir "revisa antes de aprobar" sobre una
 * vacante que ya se aprobó o rechazó.
 */
function BloqueAval({
  vacante,
  contexto,
}: {
  vacante: VacanteDoc;
  contexto: 'pendiente' | 'historico';
}) {
  const historico = contexto === 'historico';
  // Aval obligatorio (reu 08-oct): aumento de planta o reemplazo con cambio.
  const motivos = motivosAval(vacante);

  if (vacante.aval_url) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <FileText size={18} strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-text-strong">
              Aval firmado por Alejandro
            </p>
            <p className="text-[11px] text-text-subtle">
              {historico ? 'PDF adjunto a la solicitud' : 'PDF adjunto · revisa antes de aprobar'}
              {motivos.length > 0 && ` · obligatorio: ${textoMotivoAval(motivos).toLowerCase()}`}
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
    );
  }

  if (motivos.length > 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-danger-500/30 bg-danger-50/60 p-4">
        <div className="w-10 h-10 rounded-md bg-danger-500/10 text-danger-700 flex items-center justify-center shrink-0">
          <FileText size={18} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-danger-700">
            Falta el aval firmado, y es obligatorio
          </p>
          <p className="text-[12px] text-danger-700 mt-0.5 leading-[1.5]">
            {textoMotivoAval(motivos)}.{' '}
            {historico
              ? 'La solicitud se decidió sin el aval.'
              : `No se puede aprobar sin él: recházala pidiendo el aval y ${vacante.lider_nombre || 'el líder'} lo adjunta al corregirla.`}
          </p>
        </div>
      </div>
    );
  }

  if (vacante.aval_no_requiere) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/50 p-4">
        <div className="w-10 h-10 rounded-md bg-slate-100 text-text-muted flex items-center justify-center shrink-0">
          <FileText size={18} strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-text-strong">No requiere aval</p>
          <p className="text-[11px] text-text-subtle">
            El líder marcó que este cargo no necesita aval (p. ej. un reemplazo).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-md border-2 border-warning-300 bg-warning-50/50 p-4">
      <div className="w-10 h-10 rounded-md bg-warning-100 text-warning-700 flex items-center justify-center shrink-0">
        <FileText size={18} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-warning-700">
          {historico
            ? 'Sin PDF de aval adjunto'
            : 'Aval pendiente · el líder envió sin adjuntar PDF'}
        </p>
        <p className="text-[12px] text-warning-700 mt-0.5 leading-[1.5]">
          {historico ? (
            <>La solicitud se decidió sin el aval firmado por Alejandro.</>
          ) : (
            <>
              Para este tipo de solicitud el aval no es obligatorio. Si lo necesitas, recházala
              pidiéndoselo a <span className="font-semibold">{vacante.lider_nombre}</span>: lo
              adjunta al corregirla.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function VacanteCardAprobacion({
  vacante,
  procesando,
  puedeVerDetalle,
  onAprobar,
  onRechazar,
}: {
  vacante: VacanteDoc;
  procesando: boolean;
  puedeVerDetalle: boolean;
  onAprobar: (nota: string) => void;
  onRechazar: (motivo: string) => void;
}) {
  const [nota, setNota] = useState('');
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [verOficial, setVerOficial] = useState(false);
  // Sin el aval obligatorio no se aprueba (reu 08-oct); el servidor también lo exige.
  const faltaAvalObligatorio = motivosAval(vacante).length > 0 && !vacante.aval_url;

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
            {TIPO_SOLICITUD_LABEL[vacante.tipo_solicitud] ?? vacante.tipo_solicitud}
            {vacante.creado_en && (
              <> · creada {formatearFecha(vacante.creado_en.toDate())}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {/* VIDA-F-01 en consulta: el formato que Karen le mostraba a Diego (decisión 25-sep). */}
          <Link
            to={`/vacantes/${vacante.id}/solicitud-integrante`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline whitespace-nowrap"
          >
            <FileText size={11} strokeWidth={1.75} />
            Solicitud de Integrantes
          </Link>
          {/* El original que se descarga (reu 08-oct: "él quiere ver los dos"). */}
          <button
            type="button"
            onClick={() => setVerOficial(true)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline whitespace-nowrap"
          >
            <FileText size={11} strokeWidth={1.75} />
            Formato oficial (PDF)
          </button>
          {puedeVerDetalle && (
            <Link
              to={`/vacantes/${vacante.id}`}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline whitespace-nowrap"
            >
              Ver detalle completo
              <ExternalLink size={11} strokeWidth={1.75} />
            </Link>
          )}
        </div>
      </div>

      {/* Corregida por el líder tras una devolución (reu 08-oct): motivo + qué cambió. */}
      {vacante.reenviada_en && (
        <div className="mt-5 rounded-md border border-warning-500/40 bg-warning-50/60 p-4">
          <div className="flex items-center gap-2">
            <RotateCcw size={14} strokeWidth={1.75} className="text-warning-700" />
            <p className="text-[12px] font-semibold text-warning-700">
              Corregida y reenviada
              {vacante.reenviada_por_nombre ? ` por ${vacante.reenviada_por_nombre}` : ''} ·{' '}
              {formatearFecha(vacante.reenviada_en.toDate())}
              {(vacante.devoluciones ?? 0) > 1 ? ` · devuelta ${vacante.devoluciones} veces` : ''}
            </p>
          </div>
          {vacante.aval_rechazo_motivo && (
            <p className="mt-2 text-[12.5px] text-text-body whitespace-pre-line">
              <span className="font-semibold">Tu motivo:</span> {vacante.aval_rechazo_motivo}
            </p>
          )}
          <div className="mt-2 text-[12.5px] text-text-body">
            <span className="font-semibold">Qué cambió:</span>{' '}
            {vacante.reenvio_cambios?.length ? (
              <ul className="mt-1 space-y-0.5">
                {vacante.reenvio_cambios.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            ) : (
              'no cambió las condiciones (ver la nota).'
            )}
          </div>
          {vacante.reenvio_nota && (
            <p className="mt-2 text-[12.5px] text-text-body whitespace-pre-line">
              <span className="font-semibold">Nota del líder:</span> {vacante.reenvio_nota}
            </p>
          )}
        </div>
      )}

      {/* Condiciones completas: lo que Cultura y Desarrollo valida. */}
      <div className="mt-5">
        <CondicionesVacante vacante={vacante} incluirTipoSolicitud />
      </div>

      {/* Justificación */}
      {vacante.justificacion && (
        <div className="mt-5">
          <BloqueJustificacion vacante={vacante} />
        </div>
      )}

      {/* Aval PDF · estado distinto si está pendiente */}
      <div className="mt-5">
        <BloqueAval vacante={vacante} contexto="pendiente" />
      </div>

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
              disabled={procesando || faltaAvalObligatorio}
              loading={procesando}
              icon={<Check size={13} strokeWidth={1.75} />}
            >
              {procesando ? 'Aprobando…' : 'Aprobar'}
            </Button>
          </div>
          {faltaAvalObligatorio && (
            <p className="text-right text-[11px] text-danger-700">
              No se puede aprobar sin el aval obligatorio: recházala para que lo adjunten.
            </p>
          )}
        </div>
      )}

      {mostrarRechazo && (
        <FormularioRechazo
          liderNombre={vacante.lider_nombre}
          consecutivo={vacante.consecutivo}
          // La nota que ya escribió pasa al motivo (reu 08-oct: "se eliminó la nota").
          inicial={nota}
          onCancelar={(motivo) => {
            setNota(motivo);
            setMostrarRechazo(false);
          }}
          onConfirmar={(motivo) => onRechazar(motivo)}
          procesando={procesando}
        />
      )}

      {((vacante.devoluciones ?? 0) > 0 || (vacante.reenvios ?? 0) > 0) && (
        <div className="mt-5">
          <HistorialRevision vacanteId={vacante.id} />
        </div>
      )}
      {verOficial && <VisorSolicitudOficial vacante={vacante} onClose={() => setVerOficial(false)} />}
    </Card>
  );
}

/**
 * Rechazar = DEVOLVER al líder para corregir (reu 08-oct). Arranca con la nota
 * que Diego ya había escrito: antes, al hundir "Rechazar", se borraba y tenía que
 * escribirla otra vez.
 */
function FormularioRechazo({
  liderNombre,
  consecutivo,
  inicial,
  onCancelar,
  onConfirmar,
  procesando,
}: {
  liderNombre: string;
  consecutivo: string;
  inicial: string;
  onCancelar: (motivo: string) => void;
  onConfirmar: (motivo: string) => void;
  procesando: boolean;
}) {
  const [motivo, setMotivo] = useState(inicial);
  const valido = motivo.trim().length >= 5;
  return (
    <div className="mt-5 rounded-md border border-danger-500/30 bg-danger-50/40 p-4 space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-danger-700">
          Rechazar y devolver al líder{' '}
          <span className="text-text-subtle font-normal">(motivo obligatorio)</span>
        </p>
        <p className="mt-1 text-[12px] text-text-muted leading-[1.5]">
          La solicitud vuelve a {liderNombre || 'el líder'} con este motivo para que la corrija. No
          se cancela: conserva el consecutivo {consecutivo} y el historial. A coordinación también
          le llega el aviso, y cuando el líder la reenvíe volverá aquí a Pendientes.
        </p>
      </div>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. El básico no corresponde: debe ser $1.750.905. Falta el aval firmado."
        rows={3}
        className={inputClass}
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="neutral-secondary"
          onClick={() => onCancelar(motivo)}
          disabled={procesando}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive-primary"
          onClick={() => valido && onConfirmar(motivo.trim())}
          disabled={procesando || !valido}
          loading={procesando}
        >
          {procesando ? 'Devolviendo…' : 'Devolver al líder'}
        </Button>
      </div>
    </div>
  );
}

/** Tono de cada paso del historial de revisión de GH. */
const TONO_REVISION: Partial<Record<TipoNovedadVacante, PillTono>> = {
  devolucion_gh: 'danger',
  reenvio_correccion: 'warning',
  aprobacion_gh: 'success',
};

/**
 * Historial de la revisión de GH (devoluciones, reenvíos, aprobación) desde la
 * bitácora `vacante_novedades`, que escriben las callables en la misma
 * transacción que el cambio de estado.
 */
function HistorialRevision({ vacanteId }: { vacanteId: string }) {
  const { docs } = useColeccion<NovedadVacanteDoc>('vacante_novedades', {
    filtros: [['vacante_id', '==', vacanteId]],
    orden: ['creado_en', 'desc'],
  });
  const items = docs.filter((n) => TIPOS_REVISION_GH.includes(n.tipo));
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <p className="text-[10px] uppercase tracking-[0.10em] text-text-muted font-bold">
        Historial de revisión
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <Pill tono={TONO_REVISION[n.tipo] ?? 'neutral'} dot>
                {TIPO_NOVEDAD_LABEL[n.tipo]}
              </Pill>
            </div>
            <div className="min-w-0">
              <p className="text-[12.5px] text-text-body whitespace-pre-line leading-relaxed">
                {n.motivo}
              </p>
              <p className="mt-0.5 text-[11px] text-text-subtle tabular-nums">
                {n.registrado_por_nombre} ·{' '}
                {n.creado_en ? formatearFecha(n.creado_en.toDate(), 'dd/MM/yyyy HH:mm') : '—'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Fila histórica (Aprobadas / Rechazadas). Plegada es compacta: consecutivo,
 * cargo, salario, rodamiento, tipo, a quién reemplaza, fecha de aprobación y
 * links "Aval PDF" / "Ver →". Con "Ver solicitud" se despliega la solicitud
 * completa (reu Karen 25-sep, punto 6): condiciones, justificación, aval,
 * estado actual y observaciones de GH. Así Diego vuelve a ver lo que aprobó
 * aunque la vacante ya esté publicada, en selección o cerrada.
 */
function VacanteRowHistorica({
  vacante,
  rechazada,
  puedeVerDetalle,
}: {
  vacante: VacanteDoc;
  rechazada: boolean;
  puedeVerDetalle: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const [verOficial, setVerOficial] = useState(false);
  const tonoEstado = ESTADO_TONO[vacante.estado] ?? 'neutral';
  const labelEstado = ESTADO_LABEL[vacante.estado] ?? vacante.estado.replace(/_/g, ' ');

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
          {rechazada && vacante.estado === 'devuelta' && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Pill tono="danger" dot>
                Esperando corrección del líder
              </Pill>
              <span className="text-[11px] text-text-subtle">
                {vacante.devuelta_por_nombre ? `Devuelta por ${vacante.devuelta_por_nombre}` : 'Devuelta'}
                {vacante.devuelta_en ? ` · ${formatearFecha(vacante.devuelta_en.toDate())}` : ''}
                {vacante.lider_nombre ? ` · la tiene ${vacante.lider_nombre}` : ''}
              </span>
            </div>
          )}
          <p className="text-[12px] text-text-muted mt-0.5">
            {rechazada ? (
              <span className="italic">
                {vacante.estado === 'devuelta'
                  ? `Motivo: ${vacante.aval_rechazo_motivo ?? '—'}`
                  : vacante.razon_cierre}
              </span>
            ) : (
              <>
                <span className="tabular-nums">Salario {formatearCOP(vacante.salario_base)}</span>
                {' · '}Rodamiento {textoRodamiento(vacante)}
              </>
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
          <p className="text-[12px] text-text-muted mt-0.5">
            {TIPO_SOLICITUD_LABEL[vacante.tipo_solicitud] ?? vacante.tipo_solicitud}
            {vacante.tipo_solicitud === 'reemplazo_indefinido' && vacante.reemplaza_a_nombre && (
              <>
                {' '}
                · reemplaza a{' '}
                <span className="font-medium text-text-body">{vacante.reemplaza_a_nombre}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setAbierta((a) => !a)}
            aria-expanded={abierta}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline"
          >
            {abierta ? 'Ocultar' : 'Ver solicitud'}
            <ChevronDown
              size={13}
              strokeWidth={1.75}
              className={cn(
                'text-text-muted transition-transform duration-200',
                abierta && 'rotate-180',
              )}
            />
          </button>
          {vacante.aval_url && (
            <a
              href={vacante.aval_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline"
            >
              <FileText size={11} strokeWidth={1.75} />
              Aval PDF
            </a>
          )}
          <Link
            to={`/vacantes/${vacante.id}/solicitud-integrante`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline"
            title="Solicitud de Integrantes (VIDA-F-01)"
          >
            VIDA-F-01
          </Link>
          <button
            type="button"
            onClick={() => setVerOficial(true)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline"
            title="Formato oficial VIDA-F-01 en PDF"
          >
            Oficial (PDF)
          </button>
          {puedeVerDetalle && (
            <Link
              to={`/vacantes/${vacante.id}`}
              className="text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              Ver →
            </Link>
          )}
        </div>
      </div>

      {/* Solicitud completa · desplegable */}
      {abierta && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-text-subtle">
              Solicitado por{' '}
              <span className="font-medium text-text-body">{vacante.lider_nombre}</span> ·{' '}
              Criticidad <span className="font-medium text-text-body">{vacante.criticidad}</span>
              {vacante.creado_en && <> · creada {formatearFecha(vacante.creado_en.toDate())}</>}
            </p>
            <div className="inline-flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.06em] text-text-subtle font-bold">
                Estado actual
              </span>
              <Pill tono={tonoEstado} dot>
                {labelEstado}
              </Pill>
            </div>
          </div>

          <CondicionesVacante vacante={vacante} incluirTipoSolicitud />

          <BloqueJustificacion vacante={vacante} />

          <BloqueAval vacante={vacante} contexto="historico" />

          {!rechazada && vacante.aval_observaciones && (
            <div className="rounded-md bg-slate-50 border border-slate-200 p-4">
              <p className="text-[10px] uppercase tracking-[0.10em] text-text-muted font-bold">
                Observaciones de GH al aprobar
              </p>
              <p className="text-[13px] text-text-body mt-1.5 whitespace-pre-line leading-relaxed">
                {vacante.aval_observaciones}
              </p>
            </div>
          )}

          <HistorialRevision vacanteId={vacante.id} />
        </div>
      )}
      {verOficial && <VisorSolicitudOficial vacante={vacante} onClose={() => setVerOficial(false)} />}
    </Card>
  );
}
