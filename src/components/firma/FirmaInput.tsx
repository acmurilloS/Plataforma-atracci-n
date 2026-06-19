import { useState } from 'react';
import { ImagePlus, Loader2, PenLine } from 'lucide-react';
import { FirmaCanvas } from './FirmaCanvas';

/**
 * FirmaInput · permite firmar de dos formas: DIBUJANDO (lienzo) o ADJUNTANDO una
 * imagen (foto/captura de la firma). Sea cual sea el modo, entrega siempre un PNG
 * en dataURL (la imagen subida se normaliza a PNG con fondo blanco), porque la
 * constancia PDF incrusta la firma con `embedPng`.
 */
export function FirmaInput({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [modo, setModo] = useState<'dibujar' | 'subir'>('dibujar');
  const [adjunto, setAdjunto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function cambiarModo(m: 'dibujar' | 'subir') {
    setModo(m);
    setAdjunto(null);
    setErr(null);
    onChange(null); // al cambiar de modo, descarta la firma anterior
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Sube una imagen (foto o captura de tu firma).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr('La imagen supera 8 MB. Usa una más liviana.');
      return;
    }
    setCargando(true);
    setErr(null);
    try {
      const png = await imagenAPngDataUrl(file);
      setAdjunto(png);
      onChange(png);
    } catch {
      setErr('No se pudo leer la imagen. Intenta con otra.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 mb-2">
        <BotonModo activo={modo === 'dibujar'} onClick={() => cambiarModo('dibujar')}>
          <PenLine size={13} strokeWidth={1.9} />
          Dibujar
        </BotonModo>
        <BotonModo activo={modo === 'subir'} onClick={() => cambiarModo('subir')}>
          <ImagePlus size={13} strokeWidth={1.9} />
          Subir imagen
        </BotonModo>
      </div>

      {modo === 'dibujar' ? (
        <FirmaCanvas onChange={onChange} />
      ) : (
        <div>
          {adjunto ? (
            <div className="rounded-md border border-slate-300 bg-white p-2">
              <img src={adjunto} alt="Tu firma" className="max-h-40 mx-auto object-contain" />
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => cambiarModo('subir')}
                  className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                >
                  Cambiar imagen
                </button>
              </div>
            </div>
          ) : (
            <label
              className={`flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white py-7 text-[13px] font-medium text-text-body cursor-pointer hover:bg-slate-50 ${
                cargando ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              {cargando ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ImagePlus size={18} strokeWidth={1.6} className="text-text-subtle" />
              )}
              {cargando ? 'Cargando…' : 'Selecciona una foto de tu firma'}
              <input type="file" accept="image/*" onChange={onFile} className="hidden" disabled={cargando} />
            </label>
          )}
          <p className="text-[11px] text-text-subtle mt-1">
            Sube una foto o captura clara de tu firma, de preferencia sobre fondo claro.
          </p>
        </div>
      )}

      {err && <p className="text-[12px] text-danger-700 mt-1">{err}</p>}
    </div>
  );
}

function BotonModo({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        activo ? 'bg-white text-text-strong shadow-sm' : 'text-text-muted hover:text-text-strong'
      }`}
    >
      {children}
    </button>
  );
}

/** Lee una imagen y la normaliza a PNG (fondo blanco, ancho máx 560) en dataURL. */
function imagenAPngDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img'));
      img.onload = () => {
        const maxW = 560;
        const scale = Math.min(1, maxW / (img.width || maxW));
        const w = Math.max(1, Math.round((img.width || maxW) * scale));
        const h = Math.max(1, Math.round((img.height || 200) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('ctx'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
