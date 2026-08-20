import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Layers, X } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { useEmpresas, useSedesDeEmpresa, useUnidadesDeSede } from '../../hooks/useCatalogos';
import type { VacanteDoc } from '../../schemas';

interface Props {
  vacante: VacanteDoc;
  onClose: () => void;
  onGuardado?: () => void;
}

const CRITICIDADES = ['Baja', 'Media', 'Alta'];
const TIPOS: { value: string; label: string }[] = [
  { value: 'reemplazo_indefinido', label: 'Reemplazo indefinido' },
  { value: 'aumento_planta', label: 'Aumento de planta' },
  { value: 'necesidad_temporal', label: 'Necesidad temporal' },
];

const selectClass =
  'mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 disabled:bg-slate-50 disabled:text-text-subtle';

/**
 * EditarIdentificacionModal · corregir la identificación de una vacante ya creada
 * (empresa/sede/unidad/criticidad/tipo/duración). Reu líder 19-ago: un líder debía
 * cambiar la SEDE y no podía. Escribe por la callable `editarDatosVacante` (valida
 * que sea el líder creador o staff, y solo en estados tempranos). Los cambios de
 * empresa/sede resetean las dependencias (sede/unidad) y recalculan el consecutivo.
 */
export function EditarIdentificacionModal({ vacante, onClose, onGuardado }: Props) {
  const { empresas } = useEmpresas();

  const [empresaCodigo, setEmpresaCodigo] = useState(vacante.empresa_codigo ?? '');
  const [sedeCodigo, setSedeCodigo] = useState(vacante.sede_codigo ?? '');
  const [unidadId, setUnidadId] = useState(vacante.unidad_id ?? '');
  const [criticidad, setCriticidad] = useState<string>(vacante.criticidad ?? 'Media');
  const [tipoSolicitud, setTipoSolicitud] = useState<string>(
    vacante.tipo_solicitud ?? 'reemplazo_indefinido',
  );
  const [meses, setMeses] = useState(
    vacante.temporalidad_meses != null ? String(vacante.temporalidad_meses) : '',
  );
  const [reemplazaA, setReemplazaA] = useState(vacante.reemplaza_a_nombre ?? '');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sedes } = useSedesDeEmpresa(empresaCodigo || null);
  const { unidades } = useUnidadesDeSede(sedeCodigo || null);

  const empresaNombre = useMemo(
    () => empresas.find((e) => e.codigo === empresaCodigo)?.nombre ?? vacante.empresa_nombre ?? '',
    [empresas, empresaCodigo, vacante.empresa_nombre],
  );

  async function guardar() {
    setError(null);
    if (!empresaCodigo || !sedeCodigo || !unidadId) {
      setError('Empresa, sede y unidad son obligatorias.');
      return;
    }
    if (tipoSolicitud === 'necesidad_temporal' && (!meses || Number(meses) <= 0)) {
      setError('Indica la duración estimada en meses.');
      return;
    }
    const sedeNombre = sedes.find((x) => x.codigo === sedeCodigo)?.nombre ?? vacante.sede_nombre ?? '';
    const unidadNombre = unidades.find((x) => x.id === unidadId)?.nombre ?? vacante.unidad_nombre ?? '';

    setGuardando(true);
    try {
      const fn = httpsCallable<
        { vacante_id: string; cambios: Record<string, unknown> },
        { ok: true; consecutivo: string }
      >(functions, 'editarDatosVacante');
      await fn({
        vacante_id: vacante.id,
        cambios: {
          empresa_codigo: empresaCodigo,
          empresa_nombre: empresaNombre,
          sede_codigo: sedeCodigo,
          sede_nombre: sedeNombre,
          unidad_id: unidadId,
          unidad_nombre: unidadNombre,
          criticidad,
          tipo_solicitud: tipoSolicitud,
          temporalidad_meses: tipoSolicitud === 'necesidad_temporal' ? Number(meses) : null,
          reemplaza_a_nombre: tipoSolicitud === 'reemplazo_indefinido' ? reemplazaA.trim() : '',
        },
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Layers size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-text-strong">Editar identificación</h3>
              <p className="text-[12px] text-text-subtle">Empresa, sede, unidad, tipo y duración.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-subtle hover:text-text-strong" aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-[12px] font-medium text-text-body">Empresa</span>
            <select
              value={empresaCodigo}
              onChange={(e) => {
                setEmpresaCodigo(e.target.value);
                setSedeCodigo('');
                setUnidadId('');
              }}
              className={selectClass}
            >
              <option value="" disabled>
                Selecciona la empresa
              </option>
              {empresas.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombre} ({e.codigo})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[12px] font-medium text-text-body">Sede</span>
              <select
                value={sedeCodigo}
                onChange={(e) => {
                  setSedeCodigo(e.target.value);
                  setUnidadId('');
                }}
                disabled={!empresaCodigo}
                className={selectClass}
              >
                <option value="" disabled>
                  {empresaCodigo ? 'Selecciona la sede' : 'Elige empresa primero'}
                </option>
                {sedes.map((sd) => (
                  <option key={sd.codigo} value={sd.codigo}>
                    {sd.nombre} ({sd.codigo})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[12px] font-medium text-text-body">Unidad</span>
              <select
                value={unidadId}
                onChange={(e) => setUnidadId(e.target.value)}
                disabled={!sedeCodigo}
                className={selectClass}
              >
                <option value="" disabled>
                  {sedeCodigo ? 'Selecciona la unidad' : 'Elige sede primero'}
                </option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[12px] font-medium text-text-body">Criticidad</span>
              <select
                value={criticidad}
                onChange={(e) => setCriticidad(e.target.value)}
                className={selectClass}
              >
                {CRITICIDADES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[12px] font-medium text-text-body">Tipo de solicitud</span>
              <select
                value={tipoSolicitud}
                onChange={(e) => setTipoSolicitud(e.target.value)}
                className={selectClass}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {tipoSolicitud === 'necesidad_temporal' && (
            <label className="block">
              <span className="text-[12px] font-medium text-text-body">Duración estimada (meses)</span>
              <input
                type="number"
                min={1}
                value={meses}
                onChange={(e) => setMeses(e.target.value)}
                className={selectClass}
              />
            </label>
          )}
          {tipoSolicitud === 'reemplazo_indefinido' && (
            <label className="block">
              <span className="text-[12px] font-medium text-text-body">
                Reemplaza a <span className="text-text-subtle">(opcional)</span>
              </span>
              <input
                value={reemplazaA}
                onChange={(e) => setReemplazaA(e.target.value)}
                className={selectClass}
              />
            </label>
          )}

          {error && (
            <p className="rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger-700">{error}</p>
          )}
          <p className="text-[11px] text-text-subtle">
            Si cambias la empresa o la sede, el consecutivo se ajusta automáticamente.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            disabled={guardando}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-md bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
