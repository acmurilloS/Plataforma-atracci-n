import { useMemo, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { useMutacion } from '../../hooks/useMutacion';
import { Button, Card } from '../brand';
import { cn } from '../../utils/cn';
import type { UnidadDoc } from '../../schemas';

/**
 * Carga masiva de centros de costos por unidad (DotaTrack 17-nov, A2): el listado
 * oficial lo tienen contabilidad y tesorería; Juan lo consigue y se pega aquí.
 * Cruza por NOMBRE de unidad (sin tildes, sin mayúsculas, espacios normalizados),
 * muestra la vista previa y aplica solo lo que coincide. La API de ingresos lo
 * entrega en `vacante.unidad.centro_costos`.
 *
 * Formato: una unidad por línea, "NOMBRE DE LA UNIDAD;CÓDIGO" (sirve también con
 * tabulador —pegado de Excel—, coma o |).
 */

function normalizar(n: string): string {
  return n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

interface Fila {
  linea: number;
  nombre: string;
  codigo: string;
  unidad: UnidadDoc | null;
  estado: 'cambia' | 'igual' | 'no_encontrada' | 'invalida' | 'repetida';
}

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[12px] font-mono text-text-strong placeholder:text-text-subtle',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

export function CargaCentrosCostos({ unidades }: { unidades: UnidadDoc[] }) {
  const { actualizar } = useMutacion();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const filas = useMemo<Fila[]>(() => {
    const porNombre = new Map(unidades.map((u) => [normalizar(u.nombre), u]));
    const vistas = new Set<string>();
    return texto
      .split(/\r?\n/)
      .map((l, i) => ({ l: l.trim(), linea: i + 1 }))
      .filter((x) => x.l)
      .map(({ l, linea }) => {
        const partes = l.split(/\t|;|\||,/).map((p) => p.trim()).filter(Boolean);
        const codigo = partes.length >= 2 ? partes[partes.length - 1] : '';
        const nombre = partes.length >= 2 ? partes.slice(0, -1).join(' ') : partes[0] ?? '';
        if (!nombre || !codigo || codigo.length > 40) {
          return { linea, nombre, codigo, unidad: null, estado: 'invalida' as const };
        }
        const clave = normalizar(nombre);
        const unidad = porNombre.get(clave) ?? null;
        if (!unidad) return { linea, nombre, codigo, unidad: null, estado: 'no_encontrada' as const };
        if (vistas.has(unidad.id)) return { linea, nombre, codigo, unidad, estado: 'repetida' as const };
        vistas.add(unidad.id);
        const igual = (unidad.centro_costos ?? '').trim() === codigo;
        return { linea, nombre, codigo, unidad, estado: igual ? ('igual' as const) : ('cambia' as const) };
      });
  }, [texto, unidades]);

  const cambian = filas.filter((f) => f.estado === 'cambia');
  const sinCruce = filas.filter((f) => f.estado === 'no_encontrada' || f.estado === 'invalida');
  const sinCC = unidades.filter((u) => !(u.centro_costos ?? '').trim()).length;

  async function aplicar() {
    if (!cambian.length) return;
    setAplicando(true);
    setMsg(null);
    let hechos = 0;
    try {
      for (const f of cambian) {
        if (!f.unidad) continue;
        await actualizar('unidades', f.unidad.id, { centro_costos: f.codigo });
        hechos++;
      }
      setMsg({ tipo: 'ok', texto: `Centro de costos guardado en ${hechos} unidad(es).` });
      setTexto('');
    } catch (e) {
      setMsg({
        tipo: 'err',
        texto: `Se guardaron ${hechos} y luego falló: ${e instanceof Error ? e.message : 'error'}. Vuelve a aplicar.`,
      });
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Card padding="md">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-[14px] font-semibold text-text-strong">
            Cargar centros de costos desde una lista
          </span>
          <span className="block text-[12px] text-text-muted">
            {sinCC} de {unidades.length} unidades activas aún sin centro de costos. Los usa DotaTrack
            para cargar la dotación.
          </span>
        </span>
        <Upload size={16} strokeWidth={1.75} className="text-text-subtle shrink-0" />
      </button>
      {abierto && (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] text-text-muted">
            Pega una unidad por línea con su código: <code>NOMBRE DE LA UNIDAD;CÓDIGO</code> (también
            sirve copiar dos columnas de Excel). Se cruza por nombre; revisa la vista previa antes de
            aplicar.
          </p>
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setMsg(null);
            }}
            rows={6}
            placeholder={'ADM CONTABILIDAD;4101\nPOSTVENTA ENERGIA;5203'}
            className={inputClass}
          />
          {filas.length > 0 && (
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.06em] text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Línea</th>
                    <th className="px-3 py-2">Unidad</th>
                    <th className="px-3 py-2">Centro de costos</th>
                    <th className="px-3 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map((f) => (
                    <tr key={f.linea}>
                      <td className="px-3 py-1.5 tabular-nums text-text-subtle">{f.linea}</td>
                      <td className="px-3 py-1.5 text-text-strong">{f.unidad?.nombre ?? f.nombre}</td>
                      <td className="px-3 py-1.5 font-mono">
                        {f.unidad?.centro_costos && f.estado === 'cambia' ? (
                          <span>
                            <span className="line-through text-text-subtle">{f.unidad.centro_costos}</span>{' '}
                            {f.codigo}
                          </span>
                        ) : (
                          f.codigo || '—'
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-1.5',
                          f.estado === 'cambia' && 'text-success-700',
                          f.estado === 'igual' && 'text-text-muted',
                          (f.estado === 'no_encontrada' || f.estado === 'invalida' || f.estado === 'repetida') &&
                            'text-danger-700',
                        )}
                      >
                        {f.estado === 'cambia' && 'Se guarda'}
                        {f.estado === 'igual' && 'Ya lo tiene'}
                        {f.estado === 'no_encontrada' && 'No hay una unidad con ese nombre'}
                        {f.estado === 'invalida' && 'Falta el nombre o el código'}
                        {f.estado === 'repetida' && 'Unidad repetida en la lista'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sinCruce.length > 0 && (
            <p className="text-[12px] text-text-muted">
              {sinCruce.length} línea(s) no cruzan: revisa el nombre en la tabla de unidades o crea la
              unidad primero.
            </p>
          )}
          {msg && (
            <p className={cn('text-[12px]', msg.tipo === 'ok' ? 'text-success-700' : 'text-danger-700')}>
              {msg.texto}
            </p>
          )}
          <Button
            variant="brand-primary"
            size="medium"
            onClick={aplicar}
            disabled={!cambian.length || aplicando}
            loading={aplicando}
            icon={<Check size={13} strokeWidth={1.75} />}
          >
            {aplicando ? 'Guardando…' : `Aplicar ${cambian.length} centro(s) de costos`}
          </Button>
        </div>
      )}
    </Card>
  );
}
