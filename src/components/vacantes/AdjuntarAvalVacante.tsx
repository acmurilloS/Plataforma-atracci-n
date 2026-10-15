import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Button } from '../brand';
import { AvalUploader } from './AvalUploader';
import { motivosAval, textoMotivoAval } from '../../utils/avalSolicitud';
import type { VacanteDoc } from '../../schemas';

/**
 * Adjuntar el aval a una solicitud que aún no pasa por GH (borrador o devuelta).
 * Reu Karen + Diego 08-oct: el aval es obligatorio en aumento de planta y en
 * reemplazos con cambio, y sin él GH no puede aprobar. Así el líder (o
 * coordinación en su nombre) lo sube sin esperar a que se la devuelvan. Escribe
 * por la callable `editarDatosVacante` (los líderes no escriben vacantes).
 */
export function AdjuntarAvalVacante({ vacante }: { vacante: VacanteDoc }) {
  const [aval, setAval] = useState<{ url: string; driveFileId: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const motivos = motivosAval(vacante);

  async function guardar() {
    if (!aval?.url) return;
    setGuardando(true);
    setMsg(null);
    try {
      const fn = httpsCallable(functions, 'editarDatosVacante');
      await fn({ vacante_id: vacante.id, cambios: { aval_url: aval.url, aval_drive_file_id: aval.driveFileId } });
      setMsg({ tono: 'ok', texto: 'Aval adjuntado a la solicitud.' });
    } catch (e) {
      setMsg({ tono: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar el aval.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {motivos.length > 0 && (
        <p className="text-[12px] text-danger-700 leading-[1.5]">
          <span className="font-semibold">Obligatorio:</span> {textoMotivoAval(motivos).toLowerCase()}.
          GH no puede aprobar la solicitud sin el aval firmado.
        </p>
      )}
      <AvalUploader
        empresaCodigo={vacante.empresa_codigo}
        value={aval?.url || undefined}
        driveFileId={aval?.driveFileId || undefined}
        onChange={(info) => setAval(info)}
        disabled={guardando}
      />
      {aval?.url && (
        <Button variant="brand-primary" onClick={guardar} loading={guardando} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar aval en la solicitud'}
        </Button>
      )}
      {msg && (
        <p className={`text-[12px] ${msg.tono === 'ok' ? 'text-success-700' : 'text-danger-700'}`}>{msg.texto}</p>
      )}
    </div>
  );
}
