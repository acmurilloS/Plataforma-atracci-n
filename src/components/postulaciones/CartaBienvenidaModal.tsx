import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Check, Download, FileText, Mail, X } from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useDoc } from '../../hooks/useDoc';
import { functions } from '../../lib/firebase';
import type { DatosBasicosIntegranteDoc, PostulacionDoc } from '../../schemas';
import {
  estamparCartaBienvenida,
  fechaLargaBogotaHoy,
} from '../../utils/estamparCartaBienvenida';

/** Blob (PDF) → base64 sin prefijo, robusto para archivos grandes (usa FileReader). */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

interface Props {
  postulacion: PostulacionDoc;
  onClose: () => void;
}

/**
 * CartaBienvenidaModal · genera la CARTA DE BIENVENIDA oficial de Equitel
 * personalizada (nombre del candidato + familiares + fecha) sobre el formato real
 * firmado por el CEO. Reu 18-ago (#4b). Los familiares se prellenan desde
 * `datos_basicos_integrante` (cónyuge + hijos que el candidato diligenció en su
 * portal) y Gestión Humana los puede ajustar antes de descargar.
 */
export function CartaBienvenidaModal({ postulacion, onClose }: Props) {
  const { docs: datosBasicos } = useColeccion<DatosBasicosIntegranteDoc>(
    'datos_basicos_integrante',
    { filtros: [['postulacion_id', '==', postulacion.id]], limit: 1 },
  );
  // Plantilla personalizada subida desde admin (si existe); si no, la de la app.
  const { doc: cfgCarta } = useDoc<{ id: string; pdf_url?: string }>(
    'configuracion_global',
    'carta_bienvenida',
  );

  // Prellenado de familiares: cónyuge + hijos capturados por el candidato.
  const familiaresSugeridos = useMemo(() => {
    const d = datosBasicos[0];
    if (!d) return '';
    const partes: string[] = [];
    if (d.conyuge_nombre?.trim()) partes.push(`${d.conyuge_nombre.trim()} (cónyuge)`);
    for (const h of d.hijos ?? []) {
      if (h.nombre?.trim()) partes.push(h.nombre.trim());
    }
    return partes.join(', ');
  }, [datosBasicos]);

  const [nombre, setNombre] = useState(postulacion.candidato_nombre ?? '');
  const [familiares, setFamiliares] = useState('');
  const [fecha, setFecha] = useState(fechaLargaBogotaHoy());
  const [tocado, setTocado] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el usuario no ha tocado el campo, refleja el prellenado cuando cargue.
  const familiaresValor = tocado ? familiares : familiaresSugeridos;
  const email = (postulacion.candidato_email ?? '').trim();

  async function construir(): Promise<Blob> {
    return estamparCartaBienvenida({
      nombre: nombre.trim(),
      familiares: familiaresValor.trim(),
      fecha: fecha.trim(),
      plantillaUrl: cfgCarta?.pdf_url?.trim() || undefined,
    });
  }

  async function generar(descargar: boolean) {
    setError(null);
    if (!nombre.trim()) {
      setError('Escribe el nombre del candidato.');
      return;
    }
    setGenerando(true);
    try {
      const blob = await construir();
      const url = URL.createObjectURL(blob);
      if (descargar) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Carta de bienvenida - ${nombre.trim()}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, '_blank', 'noopener');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la carta.');
    } finally {
      setGenerando(false);
    }
  }

  async function enviar() {
    setError(null);
    setEnviado(false);
    if (!nombre.trim()) {
      setError('Escribe el nombre del candidato.');
      return;
    }
    if (!email) {
      setError('El candidato no tiene correo registrado; no se puede enviar automáticamente.');
      return;
    }
    setEnviando(true);
    try {
      const blob = await construir();
      const pdf_base64 = await blobABase64(blob);
      const fn = httpsCallable<
        { postulacion_id: string; pdf_base64: string },
        { ok: true; email_destinatario: string }
      >(functions, 'enviarCartaBienvenida');
      await fn({ postulacion_id: postulacion.id, pdf_base64 });
      setEnviado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la carta.');
    } finally {
      setEnviando(false);
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
              <FileText size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-text-strong">Carta de bienvenida</h3>
              <p className="text-[12px] text-text-subtle">
                Formato oficial firmado por el CEO, personalizado.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-strong transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-[12px] font-medium text-text-body">Nombre del candidato</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-text-body">
              Familiares <span className="text-text-subtle">(opcional)</span>
            </span>
            <textarea
              value={familiaresValor}
              onChange={(e) => {
                setTocado(true);
                setFamiliares(e.target.value);
              }}
              rows={2}
              placeholder="Ej. María Gómez (cónyuge), Juan y Ana"
              className="mt-1 w-full resize-none rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
            />
            <span className="mt-1 block text-[11px] text-text-subtle">
              {familiaresSugeridos
                ? 'Se prellenó con el cónyuge e hijos que registró el candidato en su portal. Puedes ajustarlo.'
                : 'Si el candidato ya diligenció su portal, aquí aparecerían sus familiares. Escríbelos si quieres incluirlos.'}
            </span>
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-text-body">Fecha</span>
            <input
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
            />
          </label>

          {error && (
            <p className="rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger-700">{error}</p>
          )}
          {enviado && (
            <p className="flex items-center gap-1.5 rounded-md bg-success-50 px-3 py-2 text-[12px] text-success-700">
              <Check size={14} strokeWidth={2} />
              Carta enviada a {email}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={() => generar(false)}
            disabled={generando || enviando}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            <FileText size={13} strokeWidth={1.75} />
            Vista previa
          </button>
          <button
            onClick={() => generar(true)}
            disabled={generando || enviando}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            <Download size={13} strokeWidth={1.75} />
            Descargar
          </button>
          <button
            onClick={enviar}
            disabled={generando || enviando}
            title={email ? `Se enviará a ${email}` : 'El candidato no tiene correo'}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            <Mail size={13} strokeWidth={1.75} />
            {enviando ? 'Enviando…' : enviado ? 'Reenviar al candidato' : 'Enviar al candidato'}
          </button>
        </div>
      </div>
    </div>
  );
}
