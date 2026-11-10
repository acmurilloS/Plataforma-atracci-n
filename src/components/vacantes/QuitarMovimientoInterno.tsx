import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { mensajeErrorFuncion } from '../../utils/errores';

/**
 * Quitar la marca "movimiento interno" de una vacante (Karen 10-nov, CU-CAL-1266):
 * la casilla se marcó por error al crear la solicitud y la vacante saltaba
 * perfilamiento, publicación y selección. Solo coordinación / admin / GH; el
 * servidor (`editarDatosVacante`) no deja quitarla si alguien ya entró como
 * movimiento interno, y deja la novedad en la bitácora.
 */
export function QuitarMovimientoInterno({ vacanteId }: { vacanteId: string }) {
  const [procesando, setProcesando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function quitar() {
    if (
      !window.confirm(
        '¿Esta vacante NO es un movimiento interno? Se quita la marca y sigue el proceso completo: perfilamiento, publicación y selección.',
      )
    )
      return;
    setProcesando(true);
    setErr(null);
    try {
      await httpsCallable(functions, 'editarDatosVacante')({
        vacante_id: vacanteId,
        cambios: { es_movimiento_interno: false },
      });
    } catch (e) {
      setErr(mensajeErrorFuncion(e, 'No se pudo quitar la marca.'));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-[12px] text-text-body flex items-center justify-between gap-3 flex-wrap">
      <span>
        Marcada como <strong>movimiento interno</strong>: se saltan perfilamiento, publicación y
        selección.
      </span>
      <button
        type="button"
        onClick={quitar}
        disabled={procesando}
        className="font-medium text-brand-700 hover:text-brand-800 hover:underline disabled:opacity-50"
      >
        {procesando ? 'Quitando…' : 'No es movimiento interno · quitar marca'}
      </button>
      {err && <p className="w-full text-danger-700">{err}</p>}
    </div>
  );
}
