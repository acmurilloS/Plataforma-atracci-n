import { useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FileText, RotateCcw, Upload } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useAuth } from '../../hooks/useAuth';
import { db, storage } from '../../lib/firebase';
import { MB, mensajeErrorSubida, prepararArchivo } from '../../utils/archivos';
import { Button, Card } from '../../components/brand';
import { cn } from '../../utils/cn';

interface ConfigCartaDoc {
  id: string;
  pdf_url?: string;
  nombre_archivo?: string;
  actualizado_en?: { toDate?: () => Date };
  actualizado_por?: string;
}

const RUTA_STORAGE = 'configuracion/carta-bienvenida.pdf';

/**
 * CartaBienvenidaTab · Admin → reemplazar el formato de la CARTA DE BIENVENIDA
 * (#4b, reu 18-ago) sin depender de un despliegue. Sube un PDF a Storage y guarda
 * su URL en `configuracion_global/carta_bienvenida`; la app lo usa como plantilla
 * (si no hay, usa la incluida por defecto).
 *
 * IMPORTANTE: la plataforma inserta el nombre, la fecha y los familiares en
 * posiciones FIJAS, así que el reemplazo debe conservar el mismo diseño (misma
 * ubicación de la fecha, del "Apreciado ___," y del párrafo de familia).
 */
export function CartaBienvenidaTab() {
  const { user } = useAuth();
  const { doc: config } = useDoc<ConfigCartaDoc>('configuracion_global', 'carta_bienvenida');
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const tienePersonalizada = !!config?.pdf_url?.trim();

  async function subir(file: File) {
    if (!user) return;
    setMsg(null);
    setSubiendo(true);
    try {
      // PDF detectado por contenido (incidente 08-oct, utils/archivos).
      const listo = await prepararArchivo(file, { permitidos: ['pdf'], maxBytes: 10 * MB });
      const r = ref(storage, RUTA_STORAGE);
      await uploadBytes(r, listo.blob, { contentType: listo.contentType });
      const url = await getDownloadURL(r);
      await setDoc(
        doc(db, 'configuracion_global', 'carta_bienvenida'),
        {
          id: 'carta_bienvenida',
          pdf_url: url,
          nombre_archivo: listo.nombre,
          actualizado_en: serverTimestamp(),
          actualizado_por: user.uid,
        },
        { merge: true },
      );
      setMsg({ tipo: 'ok', texto: 'Plantilla actualizada. Ya se usa en las cartas nuevas.' });
    } catch (e) {
      setMsg({ tipo: 'err', texto: mensajeErrorSubida(e, 'No se pudo subir el PDF.') });
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function restaurar() {
    if (!user) return;
    setMsg(null);
    setRestaurando(true);
    try {
      await setDoc(
        doc(db, 'configuracion_global', 'carta_bienvenida'),
        {
          id: 'carta_bienvenida',
          pdf_url: '',
          nombre_archivo: '',
          actualizado_en: serverTimestamp(),
          actualizado_por: user.uid,
        },
        { merge: true },
      );
      setMsg({ tipo: 'ok', texto: 'Se restauró la carta predeterminada de la app.' });
    } catch (e) {
      setMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'No se pudo restaurar.' });
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} strokeWidth={1.75} className="text-brand-600" />
          <h2 className="text-[15px] font-semibold text-text-strong">Carta de bienvenida</h2>
        </div>
        <p className="text-[12.5px] text-text-muted mb-4 leading-[1.5]">
          Formato que se envía al candidato al final del proceso. La plataforma le inserta
          automáticamente el <strong>nombre</strong>, la <strong>fecha</strong> y los{' '}
          <strong>familiares</strong>. Puedes reemplazarlo por una versión nueva sin esperar un
          despliegue.
        </p>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4">
          <p className="text-[11.5px] text-amber-800 leading-[1.5]">
            ⚠️ Conserva el <strong>mismo diseño</strong>: la posición de la fecha (arriba a la
            derecha), del <span className="font-mono text-[11px]">Apreciado ___,</span> y del
            párrafo que menciona a la familia deben quedar donde están, o los datos caerán en el
            lugar equivocado.
          </p>
        </div>

        <div className="mb-4 rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5">
          <p className="text-[12px] text-text-body">
            Actualmente se usa:{' '}
            <span className="font-medium text-text-strong">
              {tienePersonalizada
                ? config?.nombre_archivo || 'plantilla personalizada'
                : 'la carta predeterminada de la app'}
            </span>
          </p>
          {tienePersonalizada && config?.pdf_url && (
            <a
              href={config.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11.5px] text-brand-700 hover:text-brand-800 underline"
            >
              Ver la plantilla actual
            </a>
          )}
        </div>

        {msg && (
          <p
            className={cn(
              'text-[12px] rounded-md px-3 py-2 border mb-4',
              msg.tipo === 'ok'
                ? 'text-success-700 bg-success-50 border-success-500/25'
                : 'text-rose-700 bg-rose-50 border-rose-200',
            )}
          >
            {msg.texto}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
        />
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="brand-primary"
            loading={subiendo}
            disabled={subiendo || restaurando}
            onClick={() => inputRef.current?.click()}
            icon={<Upload size={13} strokeWidth={1.75} />}
          >
            {tienePersonalizada ? 'Reemplazar PDF' : 'Subir PDF'}
          </Button>
          {tienePersonalizada && (
            <Button
              type="button"
              variant="neutral-secondary"
              loading={restaurando}
              disabled={subiendo || restaurando}
              onClick={restaurar}
              icon={<RotateCcw size={13} strokeWidth={1.75} />}
            >
              Usar la predeterminada
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
