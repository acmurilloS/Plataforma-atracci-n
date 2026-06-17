import { useEffect, useRef } from 'react';

/**
 * FirmaCanvas · lienzo para que el candidato trace su firma (dedo o mouse).
 * Llama onChange con el PNG en dataURL cuando hay trazo, o null al limpiar.
 */
export function FirmaCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const dibujado = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    dibujando.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dibujado.current = true;
  }

  function up() {
    if (!dibujando.current) return;
    dibujando.current = false;
    onChange(dibujado.current ? canvasRef.current!.toDataURL('image/png') : null);
  }

  function limpiar() {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dibujado.current = false;
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={170}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full h-44 rounded-md border border-slate-300 bg-white touch-none cursor-crosshair"
      />
      <div className="flex justify-between items-center mt-1">
        <span className="text-[11px] text-text-subtle">Traza tu firma con el dedo o el mouse.</span>
        <button
          type="button"
          onClick={limpiar}
          className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
