import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { Modal } from '../ui/Modal';
import { Button } from '../brand';
import type { VacanteDoc } from '../../schemas';

/**
 * EliminarVacanteAdmin · acción destructiva SOLO para el rol admin.
 *
 * Borra la vacante completa (con toda su cascada) vía la callable
 * `eliminarVacante` (Admin SDK). Antes de borrar, el modal CARGA los candidatos
 * atados a la vacante y avisa en rojo si alguno tiene proceso avanzado
 * (terna/exámenes/contratación) — para no destruir por error un proceso real,
 * como pasó con una vacante duplicada. Exige teclear el consecutivo para
 * confirmar. Los candidatos NO se borran: quedan en el pool.
 *
 * Se usa "desde afuera" (en la tarjeta de la vacante) y también sirve en el
 * detalle. Para no-admin no renderiza nada.
 */

interface PostulacionMin {
  id: string;
  candidato_nombre?: string;
  estado?: string;
  [k: string]: unknown;
}

// Estados en los que el candidato ya avanzó de forma relevante: borrar la
// vacante destruye ese avance. Se resaltan en rojo en el modal.
const ESTADOS_AVANZADOS = new Set([
  'en_terna',
  'terna_enviada',
  'seleccionado_por_lider',
  'seleccionado',
  'en_examenes_medicos',
  'en_contratacion',
  'contratado',
]);

interface Props {
  vacante: VacanteDoc;
  /** 'icono' (tarjeta) o 'boton' (detalle). Default: 'icono'. */
  variante?: 'icono' | 'boton';
}

export function EliminarVacanteAdmin({ vacante, variante = 'icono' }: Props) {
  const { rol } = useAuth();
  const [abierto, setAbierto] = useState(false);

  if (rol !== 'admin') return null;

  function abrir(e: React.MouseEvent) {
    // La tarjeta es un <Link>: evitar que el click navegue.
    e.preventDefault();
    e.stopPropagation();
    setAbierto(true);
  }

  return (
    <>
      {variante === 'icono' ? (
        <button
          type="button"
          onClick={abrir}
          aria-label="Eliminar vacante"
          title="Eliminar vacante (admin)"
          className="shrink-0 p-1 rounded-md text-text-subtle hover:text-danger-600 hover:bg-danger-50 transition-colors"
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      ) : (
        <Button variant="destructive-secondary" size="medium" onClick={abrir}>
          <Trash2 size={14} strokeWidth={1.75} />
          Eliminar vacante
        </Button>
      )}
      {abierto && <ModalEliminar vacante={vacante} onClose={() => setAbierto(false)} />}
    </>
  );
}

function ModalEliminar({ vacante, onClose }: { vacante: VacanteDoc; onClose: () => void }) {
  // La query sólo se monta con el modal abierto (este componente sólo existe
  // mientras `abierto`), así no lee postulaciones hasta que hace falta.
  const { docs: posts, cargando } = useColeccion<PostulacionMin>('postulaciones', {
    filtros: [['vacante_id', '==', vacante.id]],
  });
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const consecutivo = (vacante.consecutivo ?? '').trim();
  const avanzados = posts.filter((p) => ESTADOS_AVANZADOS.has(String(p.estado ?? '')));
  const puedeConfirmar = !!consecutivo && texto.trim() === consecutivo && !borrando;

  async function eliminar() {
    setBorrando(true);
    setErr(null);
    try {
      const fn = httpsCallable(functions, 'eliminarVacante');
      await fn({ vacante_id: vacante.id, confirmar_consecutivo: consecutivo });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo eliminar la vacante.');
      setBorrando(false);
    }
  }

  return (
    <Modal
      open
      onClose={borrando ? () => {} : onClose}
      dismissable={!borrando}
      size="md"
      title="Eliminar vacante"
      description={`${consecutivo || 'sin consecutivo'} · ${vacante.cargo_nombre}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral-secondary" size="medium" onClick={onClose} disabled={borrando}>
            Cancelar
          </Button>
          <Button
            variant="destructive-primary"
            size="medium"
            onClick={eliminar}
            loading={borrando}
            disabled={!puedeConfirmar}
          >
            Eliminar definitivamente
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2.5 rounded-lg border border-danger-200 bg-danger-50 p-3">
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger-600" />
          <p className="text-[13px] leading-snug text-danger-800">
            Esto elimina la vacante y <strong>todo lo que cuelga de ella</strong>: postulaciones,
            carpetas, documentos, exámenes, informes y tickets. Los candidatos <strong>quedan en el
            pool</strong> (no se borran). Es una acción <strong>irreversible</strong>.
          </p>
        </div>

        {cargando ? (
          <p className="text-[13px] text-text-muted">Revisando candidatos atados…</p>
        ) : posts.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            No hay candidatos atados a esta vacante. Se puede eliminar con seguridad.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-subtle">
              {posts.length} candidato{posts.length > 1 ? 's' : ''} atado{posts.length > 1 ? 's' : ''}
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
              {posts.map((p) => {
                const av = ESTADOS_AVANZADOS.has(String(p.estado ?? ''));
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-text-strong">
                      {p.candidato_nombre ?? '(sin nombre)'}
                    </span>
                    <span
                      className={
                        av
                          ? 'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-danger-700 bg-danger-50'
                          : 'shrink-0 text-[11px] text-text-muted'
                      }
                    >
                      {p.estado ?? '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
            {avanzados.length > 0 && (
              <p className="text-[12px] font-medium text-danger-700">
                ⚠ {avanzados.length} con proceso avanzado (terna / exámenes / contratación): se
                perderá su avance. Confirma solo si estás seguro.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-text-strong">
            Escribe el consecutivo <span className="font-mono text-text-body">{consecutivo}</span>{' '}
            para confirmar
          </label>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={consecutivo}
            disabled={borrando}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] font-mono outline-none focus:border-danger-400 focus:ring-2 focus:ring-danger-100"
          />
        </div>

        {err && <p className="text-[13px] font-medium text-danger-700">{err}</p>}
      </div>
    </Modal>
  );
}
