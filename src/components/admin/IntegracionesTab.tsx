import { useEffect, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { HardDrive, Plug, Save } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useDoc } from '../../hooks/useDoc';
import { useAuth } from '../../hooks/useAuth';
import { db, functions } from '../../lib/firebase';
import { Button, Card } from '../../components/brand';
import { cn } from '../../utils/cn';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

interface ConfigDriveDoc {
  id: string;
  unidad_compartida_id?: string;
  carpeta_padre_id?: string;
  creado_en?: unknown;
  creado_por?: string;
}

/**
 * IntegracionesTab · Admin → destino de Drive de las carpetas (Unidad Compartida
 * de GH). Guarda `configuracion_global/drive` y permite "Probar conexión" sin
 * ensuciar la raíz de la unidad (escribe/borra dentro de _SISTEMA/health-check).
 */
export function IntegracionesTab() {
  const { user } = useAuth();
  const { doc: config } = useDoc<ConfigDriveDoc>('configuracion_global', 'drive');
  const [unidadId, setUnidadId] = useState('');
  const [carpetaPadre, setCarpetaPadre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  useEffect(() => {
    if (!config) return;
    setUnidadId(config.unidad_compartida_id ?? '');
    setCarpetaPadre(config.carpeta_padre_id ?? '');
  }, [config]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMsg(null);
    setGuardando(true);
    try {
      await setDoc(
        doc(db, 'configuracion_global', 'drive'),
        {
          id: 'drive',
          unidad_compartida_id: unidadId.trim(),
          carpeta_padre_id: carpetaPadre.trim(),
          actualizado_en: serverTimestamp(),
          actualizado_por: user.uid,
          creado_en: config?.creado_en ?? serverTimestamp(),
          creado_por: config?.creado_por ?? user.uid,
        },
        { merge: true },
      );
      setMsg({ tipo: 'ok', texto: 'Configuración guardada.' });
    } catch (err) {
      setMsg({ tipo: 'err', texto: err instanceof Error ? err.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    setMsg(null);
    if (!unidadId.trim()) {
      setMsg({ tipo: 'err', texto: 'Pega primero el ID de la Unidad Compartida.' });
      return;
    }
    setProbando(true);
    try {
      const fn = httpsCallable<{ unidad_compartida_id: string }, { ok: true; mensaje: string }>(
        functions,
        'probarConexionDrive',
      );
      const res = await fn({ unidad_compartida_id: unidadId.trim() });
      setMsg({ tipo: 'ok', texto: res.data.mensaje });
    } catch (err) {
      setMsg({ tipo: 'err', texto: err instanceof Error ? err.message : 'No se pudo conectar.' });
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive size={16} strokeWidth={1.75} className="text-brand-600" />
          <h2 className="text-[15px] font-semibold text-text-strong">
            Unidad Compartida de Drive (GH)
          </h2>
        </div>
        <p className="text-[12.5px] text-text-muted mb-4 leading-[1.5]">
          Cuando la carpeta de un integrante queda al 100% (CyD + GH), todos sus documentos se
          depositan automáticamente en esta Unidad Compartida. La cuenta de servicio{' '}
          <span className="font-mono text-[11.5px]">drive-uploader@ptm-atraccion…</span> debe ser
          miembro (Administrador de contenido) de la unidad.
        </p>
        <form onSubmit={guardar} className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium text-text-body mb-1">
              ID de la Unidad Compartida
            </span>
            <input
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
              className={inputClass}
              placeholder="0AB…XYZ (de la URL drive.google.com/drive/folders/<ID>)"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-text-body mb-1">
              Carpeta padre dentro de la unidad{' '}
              <span className="text-text-subtle font-normal">(opcional)</span>
            </span>
            <input
              value={carpetaPadre}
              onChange={(e) => setCarpetaPadre(e.target.value)}
              className={inputClass}
              placeholder="Vacío = las subcarpetas de integrantes van a la raíz de la unidad"
            />
          </label>
          {msg && (
            <p
              className={cn(
                'text-[12px] rounded-md px-3 py-2 border',
                msg.tipo === 'ok'
                  ? 'text-success-700 bg-success-50 border-success-500/25'
                  : 'text-rose-700 bg-rose-50 border-rose-200',
              )}
            >
              {msg.texto}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="brand-primary"
              loading={guardando}
              disabled={guardando}
              icon={<Save size={13} strokeWidth={1.75} />}
            >
              Guardar
            </Button>
            <Button
              type="button"
              variant="neutral-secondary"
              loading={probando}
              disabled={probando}
              onClick={probar}
              icon={<Plug size={13} strokeWidth={1.75} />}
            >
              Probar conexión
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
