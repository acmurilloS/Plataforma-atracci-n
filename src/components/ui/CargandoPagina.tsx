/**
 * CargandoPagina · esqueleto neutro que se muestra mientras carga por PRIMERA vez
 * una página (caché fría). Evita el "flash de 0": en vez de números en cero,
 * aparecen barras grises hasta que llegan los datos. En revisitas la caché de
 * useColeccion ya trae los datos → este esqueleto ni se ve.
 */
export function CargandoPagina() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10 animate-pulse" aria-busy="true" aria-hidden>
      {/* Encabezado */}
      <div className="space-y-3">
        <div className="h-3 w-44 bg-slate-100 rounded" />
        <div className="h-11 w-80 max-w-full bg-slate-100 rounded" />
      </div>
      {/* Fila de tarjetas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 bg-slate-100 rounded-md" />
        ))}
      </div>
      {/* Bloque grande */}
      <div className="h-72 bg-slate-100 rounded-md" />
    </div>
  );
}
