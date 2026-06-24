import { useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { History, Pause, Play, Plus, RefreshCcw } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../brand';
import {
  TIPOS_NOVEDAD_VACANTE,
  TIPO_NOVEDAD_LABEL,
  type EstadoVacante,
  type NovedadVacanteDoc,
  type TipoNovedadVacante,
  type VacanteDoc,
} from '../../schemas';

/**
 * BitacoraReprocesos · sección del detalle de vacante (petición Karen 2026-06-24).
 *
 * Permite al equipo de Atracción registrar reprocesos, reinicios y observaciones
 * de un proceso, con fecha y autor. Las novedades de tipo `suspension` y
 * `reactivacion` además cambian el estado de la vacante (a `pausada` y de vuelta
 * a su estado previo), todo de forma atómica (writeBatch). El log es append-only:
 * no se edita ni se borra (las reglas Firestore lo refuerzan).
 */

const TIPO_TONO: Record<TipoNovedadVacante, PillTono> = {
  observacion: 'neutral',
  reproceso_terna: 'warning',
  reinicio_novedad: 'warning',
  suspension: 'danger',
  reactivacion: 'success',
};

/** Roles del equipo de Atracción que ven y gestionan la bitácora (no líderes). */
const ROLES_ATRACCION = ['admin', 'coordinador', 'gh', 'analista'];

interface Props {
  vacante: VacanteDoc;
}

export function BitacoraReprocesos({ vacante }: Props) {
  const { perfil, rol } = useAuth();
  const { docs } = useColeccion<NovedadVacanteDoc>('vacante_novedades', {
    filtros: [['vacante_id', '==', vacante.id]],
    orden: ['creado_en', 'desc'],
  });
  const [tipo, setTipo] = useState<TipoNovedadVacante>('observacion');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Solo el equipo de Atracción ve y gestiona la bitácora (los líderes no).
  if (!rol || !ROLES_ATRACCION.includes(rol)) return null;

  const estaPausada = vacante.estado === 'pausada';

  // Vista previa del efecto sobre el estado de la vacante.
  let avisoEstado: string | null = null;
  if (tipo === 'suspension') {
    avisoEstado = estaPausada
      ? 'La vacante ya está suspendida — esto quedará solo como registro.'
      : 'Al registrar, la vacante pasará a Suspendida (pausada).';
  } else if (tipo === 'reactivacion') {
    avisoEstado = estaPausada
      ? `Al registrar, la vacante se reactivará (volverá a «${(vacante.estado_previo_pausa ?? 'en_proceso').replace(/_/g, ' ')}»).`
      : 'La vacante no está suspendida — esto quedará solo como registro.';
  }

  async function registrar() {
    const texto = motivo.trim();
    if (!texto) {
      setErr('Escribe el motivo de la novedad.');
      return;
    }
    setErr(null);
    setGuardando(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('No hay sesión activa.');
      const nombre = perfil ? `${perfil.nombre} ${perfil.apellido}` : '—';

      // ¿Esta novedad cambia el estado de la vacante?
      let estadoAnterior: EstadoVacante | null = null;
      let estadoNuevo: EstadoVacante | null = null;
      const cambioVacante: Record<string, unknown> = {};
      if (tipo === 'suspension' && !estaPausada) {
        estadoAnterior = vacante.estado;
        estadoNuevo = 'pausada';
        cambioVacante.estado = 'pausada';
        cambioVacante.estado_previo_pausa = vacante.estado;
      } else if (tipo === 'reactivacion' && estaPausada) {
        estadoAnterior = 'pausada';
        estadoNuevo = (vacante.estado_previo_pausa as EstadoVacante | null) ?? 'en_proceso';
        cambioVacante.estado = estadoNuevo;
        cambioVacante.estado_previo_pausa = null;
      }

      // Atómico: la novedad y el cambio de estado de la vacante van juntos.
      const batch = writeBatch(db);
      const novRef = doc(collection(db, 'vacante_novedades'));
      batch.set(novRef, {
        id: novRef.id,
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        tipo,
        motivo: texto,
        estado_anterior: estadoAnterior,
        estado_nuevo: estadoNuevo,
        registrado_por_nombre: nombre,
        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
      if (Object.keys(cambioVacante).length > 0) {
        batch.update(doc(db, 'vacantes', vacante.id), {
          ...cambioVacante,
          actualizado_en: serverTimestamp(),
          actualizado_por: uid,
        });
      }
      await batch.commit();
      setMotivo('');
      setTipo('observacion');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos registrar la novedad.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">
          <History size={12} strokeWidth={1.75} />
        </span>
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
          Reprocesos y novedades
        </p>
      </div>

      <Card padding="lg" className="mt-3 space-y-6">
        {/* Formulario de registro */}
        <div className="space-y-3">
          <p className="text-[12px] text-text-muted">
            Registra por qué un proceso se reprocesa, se reinicia o cambia de estado. Cada novedad
            queda con su fecha y autor, y no se puede editar ni borrar (trazabilidad).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] gap-3">
            <div>
              <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
                Tipo
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoNovedadVacante)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
              >
                {TIPOS_NOVEDAD_VACANTE.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_NOVEDAD_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
                Motivo
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ej: la terna no se ajustó a la expectativa del líder; se reinicia la búsqueda."
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[13px] text-text-strong placeholder:text-text-subtle focus:outline-none focus:border-brand-500 resize-y"
              />
            </div>
          </div>

          {avisoEstado && (
            <p className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
              {tipo === 'suspension' ? (
                <Pause size={12} strokeWidth={1.75} />
              ) : (
                <Play size={12} strokeWidth={1.75} />
              )}
              {avisoEstado}
            </p>
          )}
          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <Button
            variant="brand-primary"
            onClick={registrar}
            loading={guardando}
            disabled={guardando || !motivo.trim()}
            icon={<Plus size={14} strokeWidth={1.75} />}
          >
            Registrar novedad
          </Button>
        </div>

        {/* Línea de tiempo (lo más reciente arriba) */}
        <div className="border-t border-slate-100 pt-5">
          {docs.length === 0 ? (
            <p className="text-[12px] text-text-subtle">Sin novedades registradas todavía.</p>
          ) : (
            <ul className="space-y-4">
              {docs.map((n) => (
                <li key={n.id} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <Pill tono={TIPO_TONO[n.tipo]} dot>
                      {TIPO_NOVEDAD_LABEL[n.tipo]}
                    </Pill>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-text-body whitespace-pre-line">{n.motivo}</p>
                    {n.estado_anterior && n.estado_nuevo && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <RefreshCcw size={10} strokeWidth={1.75} />
                        Estado: {n.estado_anterior.replace(/_/g, ' ')} →{' '}
                        {n.estado_nuevo.replace(/_/g, ' ')}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-text-subtle tabular-nums">
                      {n.registrado_por_nombre} ·{' '}
                      {n.creado_en ? formatearFecha(n.creado_en.toDate(), 'dd/MM/yyyy HH:mm') : '—'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}
