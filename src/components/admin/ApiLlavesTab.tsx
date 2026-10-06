import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Plug,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { functions } from '../../lib/firebase';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * ApiLlavesTab · Admin → Catálogos → "API y llaves" (reu DOTATRACK 06-oct-2026).
 *
 * Una sola pantalla: la integración ("quién" consume) y debajo sus llaves. Las
 * colecciones api_* son server-only, así que todo pasa por callables. El
 * secreto de una llave se muestra UNA sola vez, en una ventana que no se cierra
 * al hacer clic fuera; se avisa ANTES de confirmar.
 */

const BASE_URL = 'https://ptm-atraccion.web.app/api/v1';

interface Permiso {
  id: string;
  nombre: string;
  descripcion: string;
}
interface Ambito {
  id: string;
  nombre: string;
}
interface Llave {
  id: string;
  integracion_id: string;
  nombre: string;
  key_prefix: string;
  estado: 'activa' | 'revocada';
  expira_en: string | null;
  revocada_en: string | null;
  tope_por_min: number;
  ultimo_uso_en: string | null;
  rotada_desde: string | null;
  permisos: string[];
  ambitos: string[];
  creado_en: string | null;
}
interface Integracion {
  id: string;
  nombre: string;
  descripcion: string;
  estado: 'activa' | 'inactiva';
  creado_en: string | null;
  llaves_emitidas: number;
  llaves: Llave[];
}
interface Listado {
  integraciones: Integracion[];
  permisos: Permiso[];
  ambitos: Ambito[];
}
interface FilaRegistro {
  id: string;
  en: string | null;
  llave_prefijo: string | null;
  metodo: string;
  ruta: string;
  status: number;
  duracion_ms: number;
  ip: string | null;
  error: string | null;
  limite_degradado: boolean;
}
interface SecretoNuevo {
  secreto: string;
  key_prefix: string;
  nombre: string;
  integracion: string;
  rotada: boolean;
}

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';

async function llamar<TReq, TRes>(nombre: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(functions, nombre);
  return (await fn(data)).data;
}

export function ApiLlavesTab() {
  const [datos, setDatos] = useState<Listado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nuevaInt, setNuevaInt] = useState({ nombre: '', descripcion: '' });
  const [mostrarNuevaInt, setMostrarNuevaInt] = useState(false);
  const [wizardPara, setWizardPara] = useState<Integracion | null>(null);
  const [secreto, setSecreto] = useState<SecretoNuevo | null>(null);
  const [registroDe, setRegistroDe] = useState<Integracion | null>(null);

  const cargar = useCallback(async () => {
    setErr(null);
    try {
      setDatos(await llamar<Record<string, never>, Listado>('apiListarIntegraciones', {}));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cargar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function conOcupado(clave: string, fn: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(clave);
    setErr(null);
    try {
      await fn();
      await cargar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Algo falló.');
    } finally {
      setOcupado(null);
    }
  }

  async function crearIntegracion() {
    if (!nuevaInt.nombre.trim()) {
      setErr('La integración necesita un nombre.');
      return;
    }
    await conOcupado('nueva-int', async () => {
      await llamar('apiGuardarIntegracion', { ...nuevaInt, estado: 'activa' });
      setNuevaInt({ nombre: '', descripcion: '' });
      setMostrarNuevaInt(false);
    });
  }

  async function cambiarEstado(i: Integracion) {
    const nuevo = i.estado === 'activa' ? 'inactiva' : 'activa';
    if (
      nuevo === 'inactiva' &&
      !window.confirm(`¿Desactivar "${i.nombre}"? Todas sus llaves dejan de funcionar al instante (403).`)
    )
      return;
    await conOcupado(`estado-${i.id}`, async () => {
      await llamar('apiGuardarIntegracion', { id: i.id, nombre: i.nombre, descripcion: i.descripcion, estado: nuevo });
    });
  }

  async function eliminarIntegracion(i: Integracion) {
    if (!window.confirm(`¿Eliminar "${i.nombre}"? Solo se puede si nunca emitió llaves.`)) return;
    await conOcupado(`del-${i.id}`, async () => {
      await llamar('apiEliminarIntegracion', { id: i.id });
    });
  }

  async function revocar(l: Llave, i: Integracion) {
    if (!window.confirm(`¿Revocar la llave "${l.nombre}" (${l.key_prefix})? Deja de funcionar al instante y no se puede deshacer.`))
      return;
    await conOcupado(`rev-${l.id}`, async () => {
      await llamar('apiRevocarLlave', { llave_id: l.id });
      void i;
    });
  }

  async function rotar(l: Llave, i: Integracion) {
    if (
      !window.confirm(
        `¿Rotar la llave "${l.nombre}"? Se crea una NUEVA con la misma configuración y la actual queda revocada. El secreto nuevo se muestra una sola vez.`,
      )
    )
      return;
    await conOcupado(`rot-${l.id}`, async () => {
      const r = await llamar<{ llave_id: string }, { secreto: string; key_prefix: string }>('apiRotarLlave', {
        llave_id: l.id,
      });
      setSecreto({ secreto: r.secreto, key_prefix: r.key_prefix, nombre: l.nombre, integracion: i.nombre, rotada: true });
    });
  }

  if (cargando) return <p className="text-[13px] text-text-muted">Cargando integraciones…</p>;

  return (
    <div className="space-y-6">
      {/* Qué es esto */}
      <Card padding="lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Plug size={18} strokeWidth={1.75} />
          </div>
          <div className="text-[13px] text-text-body leading-[1.6] space-y-2">
            <p>
              <span className="font-semibold text-text-strong">Una integración</span> es otro sistema que
              consulta información de esta plataforma (p. ej. DOTATRACK, el aplicativo de dotación). Nunca
              toca la base de datos: llama a la API con una <span className="font-semibold">llave</span> y la
              plataforma decide qué puede ver. Cada integración agrupa sus llaves; desactivarla apaga todas
              de una, y rotar una llave no obliga a reconfigurar la relación.
            </p>
            <p className="text-text-muted">
              URL base: <code className="font-mono text-[12px] text-text-strong">{BASE_URL}</code> · Cabecera:{' '}
              <code className="font-mono text-[12px] text-text-strong">Authorization: Bearer &lt;llave&gt;</code> ·
              Endpoints: <code className="font-mono text-[12px]">/me</code>,{' '}
              <code className="font-mono text-[12px]">/ingresos</code>,{' '}
              <code className="font-mono text-[12px]">/ingresos/{'{id}'}</code>. La documentación completa está en{' '}
              <code className="font-mono text-[12px]">docs/api-v1.md</code> del repositorio.
            </p>
          </div>
        </div>
      </Card>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}

      {/* Nueva integración */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
          Integraciones ({datos?.integraciones.length ?? 0})
        </p>
        <Button
          variant="brand-primary"
          size="medium"
          icon={<Plus size={13} strokeWidth={1.75} />}
          onClick={() => setMostrarNuevaInt((v) => !v)}
        >
          Nueva integración
        </Button>
      </div>
      {mostrarNuevaInt && (
        <Card padding="lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">Nombre</span>
              <input
                value={nuevaInt.nombre}
                onChange={(e) => setNuevaInt((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej.: DOTATRACK (dotación)"
                className={cn(inputClass, 'mt-1')}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                Descripción (quién la usa y para qué)
              </span>
              <input
                value={nuevaInt.descripcion}
                onChange={(e) => setNuevaInt((p) => ({ ...p, descripcion: e.target.value }))}
                placeholder="Ej.: Juan Esteban Ardila · recibe los nuevos ingresos para armar la dotación"
                className={cn(inputClass, 'mt-1')}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="neutral-secondary" size="medium" onClick={() => setMostrarNuevaInt(false)}>
              Cancelar
            </Button>
            <Button
              variant="brand-primary"
              size="medium"
              onClick={crearIntegracion}
              loading={ocupado === 'nueva-int'}
              disabled={!!ocupado}
            >
              Crear integración
            </Button>
          </div>
        </Card>
      )}

      {datos?.integraciones.length === 0 && !mostrarNuevaInt && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <KeyRound size={20} strokeWidth={1.5} className="mx-auto mb-2 text-text-subtle" />
          <p className="text-[14px] font-medium text-text-strong">Aún no hay integraciones</p>
          <p className="text-[12px] text-text-muted mt-1">
            Crea la primera (p. ej. DOTATRACK) y luego emítele una llave.
          </p>
        </div>
      )}

      {datos?.integraciones.map((i) => (
        <IntegracionCard
          key={i.id}
          integracion={i}
          permisos={datos.permisos}
          ambitos={datos.ambitos}
          ocupado={ocupado}
          onEstado={() => cambiarEstado(i)}
          onEliminar={() => eliminarIntegracion(i)}
          onNuevaLlave={() => setWizardPara(i)}
          onRotar={(l) => rotar(l, i)}
          onRevocar={(l) => revocar(l, i)}
          onRegistro={() => setRegistroDe(i)}
        />
      ))}

      {wizardPara && datos && (
        <WizardLlave
          integracion={wizardPara}
          permisos={datos.permisos}
          ambitos={datos.ambitos}
          onCerrar={() => setWizardPara(null)}
          onCreada={async (s) => {
            setWizardPara(null);
            setSecreto(s);
            await cargar();
          }}
        />
      )}

      {secreto && <ModalSecreto secreto={secreto} onCerrar={() => setSecreto(null)} />}

      {registroDe && <ModalRegistro integracion={registroDe} onCerrar={() => setRegistroDe(null)} />}
    </div>
  );
}

function IntegracionCard({
  integracion: i,
  permisos,
  ambitos,
  ocupado,
  onEstado,
  onEliminar,
  onNuevaLlave,
  onRotar,
  onRevocar,
  onRegistro,
}: {
  integracion: Integracion;
  permisos: Permiso[];
  ambitos: Ambito[];
  ocupado: string | null;
  onEstado: () => void;
  onEliminar: () => void;
  onNuevaLlave: () => void;
  onRotar: (l: Llave) => void;
  onRevocar: (l: Llave) => void;
  onRegistro: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [verRevocadas, setVerRevocadas] = useState(false);
  const q = busqueda.trim().toLowerCase();
  const filtrar = (ls: Llave[]) =>
    q ? ls.filter((l) => l.nombre.toLowerCase().includes(q) || l.key_prefix.toLowerCase().includes(q)) : ls;
  const activas = filtrar(i.llaves.filter((l) => l.estado === 'activa'));
  const revocadas = filtrar(i.llaves.filter((l) => l.estado === 'revocada'));
  const nombreAmbito = (id: string) => ambitos.find((a) => a.id === id)?.nombre ?? id;
  const nombrePermiso = (id: string) => permisos.find((p) => p.id === id)?.nombre ?? id;

  const Llaves = ({ lista, tenue }: { lista: Llave[]; tenue?: boolean }) => (
    <ul className="space-y-2">
      {lista.map((l) => {
        const vencida = !!l.expira_en && new Date(l.expira_en).getTime() <= Date.now();
        const tono: PillTono = l.estado === 'revocada' ? 'neutral' : vencida ? 'danger' : 'success';
        return (
          <li
            key={l.id}
            className={cn('rounded-md border border-slate-200 px-3.5 py-3', tenue ? 'bg-slate-50/50' : 'bg-white')}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-strong inline-flex items-center gap-2 flex-wrap">
                  {l.nombre}
                  <Pill tono={tono} dot>
                    {l.estado === 'revocada' ? 'Revocada' : vencida ? 'Vencida' : 'Activa'}
                  </Pill>
                  {l.rotada_desde && <span className="text-[10px] text-text-subtle">rotada</span>}
                </p>
                <p className="font-mono text-[11px] text-text-muted mt-0.5">{l.key_prefix}_…</p>
                <p className="text-[11px] text-text-muted mt-1.5">
                  <span className="font-medium text-text-body">Empresas:</span>{' '}
                  {l.ambitos.map(nombreAmbito).join(', ') || '—'} ·{' '}
                  <span className="font-medium text-text-body">Permisos:</span>{' '}
                  {l.permisos.map(nombrePermiso).join(', ') || '—'}
                </p>
                <p className="text-[11px] text-text-subtle mt-1 tabular-nums">
                  Tope {l.tope_por_min}/min · vence {l.expira_en ? fecha(l.expira_en) : 'nunca'} · último uso{' '}
                  {fecha(l.ultimo_uso_en)} · creada {fecha(l.creado_en)}
                  {l.revocada_en && <> · revocada {fecha(l.revocada_en)}</>}
                </p>
              </div>
              {l.estado === 'activa' && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRotar(l)}
                    disabled={!!ocupado}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-text-body hover:text-text-strong hover:underline disabled:opacity-50"
                  >
                    <RefreshCw size={11} strokeWidth={1.75} />
                    Rotar
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevocar(l)}
                    disabled={!!ocupado}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-danger-700 hover:underline disabled:opacity-50"
                  >
                    <X size={11} strokeWidth={1.75} />
                    Revocar
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.012em] text-text-strong inline-flex items-center gap-2">
            {i.nombre}
            <Pill tono={i.estado === 'activa' ? 'success' : 'neutral'} dot>
              {i.estado === 'activa' ? 'Activa' : 'Inactiva'}
            </Pill>
          </h3>
          {i.descripcion && <p className="text-[13px] text-text-muted mt-1">{i.descripcion}</p>}
          <p className="text-[11px] text-text-subtle mt-1">
            creada {fecha(i.creado_en)} · {i.llaves_emitidas} {i.llaves_emitidas === 1 ? 'llave emitida' : 'llaves emitidas'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="neutral-secondary" size="small" icon={<ScrollText size={12} strokeWidth={1.75} />} onClick={onRegistro}>
            Registro
          </Button>
          <Button variant="neutral-secondary" size="small" onClick={onEstado} disabled={!!ocupado}>
            {i.estado === 'activa' ? 'Desactivar' : 'Activar'}
          </Button>
          {i.llaves_emitidas === 0 && i.llaves.length === 0 && (
            <Button variant="destructive-secondary" size="small" onClick={onEliminar} disabled={!!ocupado}>
              Eliminar
            </Button>
          )}
          <Button
            variant="brand-primary"
            size="small"
            icon={<KeyRound size={12} strokeWidth={1.75} />}
            onClick={onNuevaLlave}
            disabled={!!ocupado || i.estado !== 'activa'}
          >
            Nueva llave
          </Button>
        </div>
      </div>

      <div className="mt-5">
        {i.llaves.length > 5 && (
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar llave por nombre o prefijo…"
            className={cn(inputClass, 'mb-3 max-w-sm')}
          />
        )}
        {activas.length === 0 && (
          <p className="text-[12px] text-text-muted">
            {i.llaves.length === 0 ? 'Sin llaves todavía.' : 'Sin llaves activas.'}
          </p>
        )}
        <Llaves lista={activas} />
        {revocadas.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setVerRevocadas((v) => !v)}
              className="text-[12px] font-medium text-text-muted hover:text-text-strong hover:underline"
            >
              {verRevocadas ? 'Ocultar' : 'Ver'} revocadas ({revocadas.length})
            </button>
            {verRevocadas && (
              <div className="mt-2">
                <Llaves lista={revocadas} tenue />
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function WizardLlave({
  integracion,
  permisos,
  ambitos,
  onCerrar,
  onCreada,
}: {
  integracion: Integracion;
  permisos: Permiso[];
  ambitos: Ambito[];
  onCerrar: () => void;
  onCreada: (s: SecretoNuevo) => Promise<void>;
}) {
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState('');
  const [ambSel, setAmbSel] = useState<string[]>(ambitos.map((a) => a.id));
  const [permSel, setPermSel] = useState<string[]>(permisos.map((p) => p.id));
  const [vence, setVence] = useState(false);
  const [expira, setExpira] = useState('');
  const [tope, setTope] = useState(60);
  const [creando, setCreando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const TOTAL = 6;
  const puedeSeguir = useMemo(() => {
    if (paso === 1) return nombre.trim().length > 0;
    if (paso === 2) return ambSel.length > 0;
    if (paso === 3) return permSel.length > 0;
    if (paso === 4) return !vence || (!!expira && new Date(expira).getTime() > Date.now());
    if (paso === 5) return Number.isInteger(tope) && tope >= 1 && tope <= 1000;
    return true;
  }, [paso, nombre, ambSel, permSel, vence, expira, tope]);

  async function crear() {
    setCreando(true);
    setErr(null);
    try {
      const r = await llamar<
        { integracion_id: string; nombre: string; permisos: string[]; ambitos: string[]; expira_en: string | null; tope_por_min: number },
        { secreto: string; key_prefix: string }
      >('apiCrearLlave', {
        integracion_id: integracion.id,
        nombre: nombre.trim(),
        permisos: permSel,
        ambitos: ambSel,
        expira_en: vence && expira ? new Date(expira).toISOString() : null,
        tope_por_min: tope,
      });
      await onCreada({ secreto: r.secreto, key_prefix: r.key_prefix, nombre: nombre.trim(), integracion: integracion.nombre, rotada: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo crear la llave.');
      setCreando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !creando && onCerrar()}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
          Nueva llave · {integracion.nombre} · paso {paso} de {TOTAL}
        </p>

        {paso === 1 && (
          <div className="mt-4">
            <h2 className="text-[16px] font-semibold text-text-strong">¿Cómo se llama esta llave?</h2>
            <p className="mt-1 text-[12px] text-text-muted">Un nombre que diga dónde vive: "Servidor DOTATRACK producción".</p>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus className={cn(inputClass, 'mt-3')} />
          </div>
        )}
        {paso === 2 && (
          <div className="mt-4">
            <h2 className="text-[16px] font-semibold text-text-strong">¿De qué empresas puede ver datos?</h2>
            <p className="mt-1 text-[12px] text-text-muted">
              Es el límite duro de la llave: nunca verá nada fuera de estas empresas, pida lo que pida.
            </p>
            <div className="mt-3 space-y-2">
              {ambitos.map((a) => (
                <label key={a.id} className="flex items-center gap-2.5 cursor-pointer text-[13px] text-text-strong">
                  <input type="checkbox" checked={ambSel.includes(a.id)} onChange={() => setAmbSel((s) => toggle(s, a.id))} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                  <span className="font-mono text-[12px] text-text-muted">{a.id}</span> {a.nombre}
                </label>
              ))}
            </div>
          </div>
        )}
        {paso === 3 && (
          <div className="mt-4">
            <h2 className="text-[16px] font-semibold text-text-strong">¿Qué puede hacer?</h2>
            <div className="mt-3 space-y-2">
              {permisos.map((p) => (
                <label key={p.id} className="flex items-start gap-2.5 cursor-pointer text-[13px] text-text-strong">
                  <input type="checkbox" checked={permSel.includes(p.id)} onChange={() => setPermSel((s) => toggle(s, p.id))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                  <span>
                    {p.nombre} <span className="font-mono text-[11px] text-text-muted">{p.id}</span>
                    <span className="block text-[12px] text-text-muted">{p.descripcion}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {paso === 4 && (
          <div className="mt-4">
            <h2 className="text-[16px] font-semibold text-text-strong">¿Vence?</h2>
            <p className="mt-1 text-[12px] text-text-muted">
              "No vence" es la ausencia de fecha, no una fecha lejana: una fecha lejana vence algún día y nadie recuerda por qué dejó de funcionar.
            </p>
            <div className="mt-3 space-y-2 text-[13px] text-text-strong">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="radio" checked={!vence} onChange={() => setVence(false)} className="h-4 w-4 border-slate-300 text-brand-600" /> No vence
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="radio" checked={vence} onChange={() => setVence(true)} className="h-4 w-4 border-slate-300 text-brand-600" /> Vence el
                <input type="date" value={expira} onChange={(e) => setExpira(e.target.value)} disabled={!vence} className={cn(inputClass, 'w-auto')} />
              </label>
            </div>
          </div>
        )}
        {paso === 5 && (
          <div className="mt-4">
            <h2 className="text-[16px] font-semibold text-text-strong">Tope de peticiones por minuto</h2>
            <p className="mt-1 text-[12px] text-text-muted">Al pasarse recibe 429 con Retry-After. 60 alcanza para una integración normal.</p>
            <input type="number" min={1} max={1000} value={tope} onChange={(e) => setTope(Number(e.target.value))} className={cn(inputClass, 'mt-3 w-32')} />
          </div>
        )}
        {paso === 6 && (
          <div className="mt-4 space-y-3">
            <h2 className="text-[16px] font-semibold text-text-strong">Confirmar</h2>
            <dl className="text-[13px] text-text-body space-y-1">
              <div><dt className="inline font-semibold">Nombre:</dt> <dd className="inline">{nombre}</dd></div>
              <div><dt className="inline font-semibold">Empresas:</dt> <dd className="inline">{ambSel.join(', ')}</dd></div>
              <div><dt className="inline font-semibold">Permisos:</dt> <dd className="inline">{permSel.join(', ')}</dd></div>
              <div><dt className="inline font-semibold">Vence:</dt> <dd className="inline">{vence ? expira : 'nunca'}</dd></div>
              <div><dt className="inline font-semibold">Tope:</dt> <dd className="inline">{tope}/min</dd></div>
            </dl>
            <div className="rounded-md border border-warning-500/40 bg-warning-50 px-3.5 py-2.5 text-[12px] text-warning-800 flex items-start gap-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
              <span>
                Al confirmar, el secreto de la llave se muestra <strong>una sola vez</strong>. Cópialo y entrégalo por un canal
                seguro; después no hay forma de volver a verlo (se puede rotar).
              </span>
            </div>
          </div>
        )}

        {err && <p className="mt-3 text-[12px] text-danger-700">{err}</p>}

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="neutral-secondary" size="medium" onClick={onCerrar} disabled={creando}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {paso > 1 && (
              <Button variant="neutral-secondary" size="medium" onClick={() => setPaso((p) => p - 1)} disabled={creando}>
                Atrás
              </Button>
            )}
            {paso < TOTAL ? (
              <Button variant="brand-primary" size="medium" onClick={() => setPaso((p) => p + 1)} disabled={!puedeSeguir}>
                Siguiente
              </Button>
            ) : (
              <Button variant="brand-primary" size="medium" onClick={crear} loading={creando} disabled={creando} icon={<ShieldCheck size={13} strokeWidth={1.75} />}>
                Crear llave
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** El secreto, UNA vez. No se cierra al hacer clic fuera. */
function ModalSecreto({ secreto, onCerrar }: { secreto: SecretoNuevo; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(secreto.secreto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* el usuario puede seleccionar y copiar a mano */
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-[16px] font-semibold text-text-strong">
          {secreto.rotada ? 'Llave rotada' : 'Llave creada'} · {secreto.nombre}
        </h2>
        <p className="mt-1 text-[12px] text-text-muted">
          Integración {secreto.integracion}. Este secreto <strong>no se vuelve a mostrar</strong>: cópialo ahora y
          entrégalo por un canal seguro (nunca por chat ni correo sin cifrar).
        </p>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 flex items-center gap-2">
          <code className="font-mono text-[12px] text-text-strong break-all flex-1 select-all">{secreto.secreto}</code>
          <button
            type="button"
            onClick={copiar}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-text-strong hover:bg-slate-50 shrink-0"
          >
            {copiado ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-text-subtle">
          Prefijo público (para identificarla después): <span className="font-mono">{secreto.key_prefix}</span>
        </p>
        <div className="mt-5 flex justify-end">
          <Button variant="brand-primary" size="medium" onClick={onCerrar}>
            Ya la guardé
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalRegistro({ integracion, onCerrar }: { integracion: Integracion; onCerrar: () => void }) {
  const [filas, setFilas] = useState<FilaRegistro[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    llamar<{ integracion_id: string; limit: number }, { filas: FilaRegistro[] }>('apiListarRegistro', {
      integracion_id: integracion.id,
      limit: 100,
    })
      .then((r) => setFilas(r.filas))
      .catch((e) => setErr(e instanceof Error ? e.message : 'No se pudo cargar el registro.'));
  }, [integracion.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCerrar}>
      <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-text-strong">Registro · {integracion.nombre}</h2>
          <button type="button" onClick={onCerrar} className="text-text-subtle hover:text-text-strong" aria-label="Cerrar">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-text-muted">
          Últimas 100 peticiones, incluidas las rechazadas. "Degradado" = el contador del tope no respondió y la petición pasó sin tope.
        </p>
        {err && <p className="mt-3 text-[12px] text-danger-700">{err}</p>}
        {!filas && !err && <p className="mt-3 text-[12px] text-text-muted">Cargando…</p>}
        {filas && filas.length === 0 && <p className="mt-3 text-[12px] text-text-muted">Sin peticiones todavía.</p>}
        {filas && filas.length > 0 && (
          <table className="mt-3 w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-text-muted">
                <th className="py-1.5 pr-3">Cuándo</th>
                <th className="py-1.5 pr-3">Llave</th>
                <th className="py-1.5 pr-3">Ruta</th>
                <th className="py-1.5 pr-3">Estado</th>
                <th className="py-1.5 pr-3">ms</th>
                <th className="py-1.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 tabular-nums text-text-muted whitespace-nowrap">{fecha(f.en)}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-text-muted">{f.llave_prefijo ?? '—'}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-text-strong">{f.metodo} {f.ruta}</td>
                  <td className={cn('py-1.5 pr-3 tabular-nums font-medium', f.status >= 400 ? 'text-danger-700' : 'text-success-700')}>{f.status}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-text-muted">{f.duracion_ms}</td>
                  <td className="py-1.5 text-text-muted">
                    {f.error ?? ''}
                    {f.limite_degradado && <span className="ml-1 text-warning-700">degradado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
