import { useEffect, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { Save, Trash2, UserMinus, Sheet as SheetIcon } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { Button, Card } from '../../components/brand';
import { cn } from '../../utils/cn';
import type { ConfiguracionReferidosDoc, ReferidoOptOutDoc } from '../../schemas';

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

const VERSION_COLUMNAS_ACTUAL = 1;

interface FormConfig {
  sheet_id: string;
  hoja: string;
  columna_cedula: string;
  columna_nombre: string;
  columna_empresa: string;
  columna_sede: string;
  columna_cargo: string;
  columna_cel_corporativo: string;
  columna_cel_personal: string;
  columna_fecha_ingreso: string;
  dias_antiguedad_minima: number;
}

const VALORES_DEFECTO: FormConfig = {
  sheet_id: '',
  hoja: 'BD_TECNICOS',
  columna_cedula: 'A',
  columna_nombre: 'B',
  columna_empresa: 'C',
  columna_sede: 'D',
  columna_cargo: 'E',
  columna_cel_corporativo: 'F',
  columna_cel_personal: 'G',
  columna_fecha_ingreso: '',
  dias_antiguedad_minima: 30,
};

export function ReferidosTab() {
  const { user } = useAuth();
  const { doc: config } = useDoc<ConfiguracionReferidosDoc & { id: string }>(
    'configuracion_global',
    'referidos',
  );
  const { docs: optOuts } = useColeccion<ReferidoOptOutDoc & { id: string }>(
    'referidos_optouts',
  );

  const [form, setForm] = useState<FormConfig>(VALORES_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Cuando el doc carga, hidratar el form.
  useEffect(() => {
    if (!config) return;
    setForm({
      sheet_id: config.sheet_id ?? '',
      hoja: config.hoja ?? 'BD_TECNICOS',
      columna_cedula: config.columna_cedula ?? 'A',
      columna_nombre: config.columna_nombre ?? 'B',
      columna_empresa: config.columna_empresa ?? 'C',
      columna_sede: config.columna_sede ?? 'D',
      columna_cargo: config.columna_cargo ?? 'E',
      columna_cel_corporativo: config.columna_cel_corporativo ?? 'F',
      columna_cel_personal: config.columna_cel_personal ?? 'G',
      columna_fecha_ingreso: config.columna_fecha_ingreso ?? '',
      dias_antiguedad_minima: config.dias_antiguedad_minima ?? 30,
    });
  }, [config]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMsg(null);
    setGuardando(true);
    try {
      await setDoc(
        doc(db, 'configuracion_global', 'referidos'),
        {
          id: 'referidos',
          sheet_id: form.sheet_id.trim(),
          hoja: form.hoja.trim(),
          columna_cedula: form.columna_cedula.trim().toUpperCase(),
          columna_nombre: form.columna_nombre.trim().toUpperCase(),
          columna_empresa: form.columna_empresa.trim().toUpperCase(),
          columna_sede: form.columna_sede.trim().toUpperCase(),
          columna_cargo: form.columna_cargo.trim().toUpperCase(),
          columna_cel_corporativo: form.columna_cel_corporativo.trim().toUpperCase(),
          columna_cel_personal: form.columna_cel_personal.trim().toUpperCase(),
          columna_fecha_ingreso: form.columna_fecha_ingreso.trim().toUpperCase() || null,
          dias_antiguedad_minima: Number(form.dias_antiguedad_minima) || 0,
          version_columnas: VERSION_COLUMNAS_ACTUAL,
          actualizado_en: serverTimestamp(),
          actualizado_por: user.uid,
          creado_en: config?.creado_en ?? serverTimestamp(),
          creado_por: config?.creado_por ?? user.uid,
        },
        { merge: true },
      );
      setMsg({ tipo: 'ok', texto: 'Configuración guardada.' });
    } catch (e) {
      setMsg({
        tipo: 'err',
        texto: e instanceof Error ? e.message : 'No se pudo guardar.',
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Config del Sheet */}
      <div className="lg:col-span-2">
        <Card padding="lg">
          <div className="flex items-center gap-2 mb-1">
            <SheetIcon size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Conexión con el Sheet de RRHH
            </p>
          </div>
          <p className="text-[12px] text-text-muted mb-5 leading-[1.55]">
            Comparte el Sheet con la cuenta{' '}
            <span className="font-mono font-medium text-text-strong">
              drive-uploader@ptm-atraccion.iam.gserviceaccount.com
            </span>{' '}
            con permisos de <span className="font-semibold">Editor</span> antes de guardar.
          </p>

          <form onSubmit={guardar} className="space-y-4">
            <Field label="Sheet ID (parte larga del URL)">
              <input
                value={form.sheet_id}
                onChange={(e) => setForm({ ...form, sheet_id: e.target.value })}
                placeholder="1aBcDeF..."
                className={inputClass}
                required
              />
            </Field>

            <Field label="Nombre de la pestaña / hoja">
              <input
                value={form.hoja}
                onChange={(e) => setForm({ ...form, hoja: e.target.value })}
                placeholder="BD_TECNICOS"
                className={inputClass}
                required
              />
            </Field>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">
                Mapping de columnas (letras A-Z)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Cédula" small>
                  <input
                    value={form.columna_cedula}
                    onChange={(e) => setForm({ ...form, columna_cedula: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Nombre" small>
                  <input
                    value={form.columna_nombre}
                    onChange={(e) => setForm({ ...form, columna_nombre: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Empresa" small>
                  <input
                    value={form.columna_empresa}
                    onChange={(e) => setForm({ ...form, columna_empresa: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Sede" small>
                  <input
                    value={form.columna_sede}
                    onChange={(e) => setForm({ ...form, columna_sede: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Cargo" small>
                  <input
                    value={form.columna_cargo}
                    onChange={(e) => setForm({ ...form, columna_cargo: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Cel. corporativo" small>
                  <input
                    value={form.columna_cel_corporativo}
                    onChange={(e) =>
                      setForm({ ...form, columna_cel_corporativo: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Cel. personal" small>
                  <input
                    value={form.columna_cel_personal}
                    onChange={(e) => setForm({ ...form, columna_cel_personal: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Fecha ingreso (opcional)" small>
                  <input
                    value={form.columna_fecha_ingreso}
                    onChange={(e) =>
                      setForm({ ...form, columna_fecha_ingreso: e.target.value })
                    }
                    placeholder="vacío si no existe"
                    className={inputClass}
                  />
                </Field>
                <Field label="Días mínimos antigüedad" small>
                  <input
                    type="number"
                    min={0}
                    value={form.dias_antiguedad_minima}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dias_antiguedad_minima: Number(e.target.value) || 0,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            {msg && (
              <div
                className={cn(
                  'rounded-md border px-3 py-2 text-[12px]',
                  msg.tipo === 'ok'
                    ? 'border-success-500/20 bg-success-50 text-success-700'
                    : 'border-danger-500/20 bg-danger-50 text-danger-700',
                )}
              >
                {msg.texto}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="brand-primary"
                loading={guardando}
                disabled={guardando}
                icon={<Save size={13} strokeWidth={1.75} />}
              >
                Guardar configuración
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Opt-outs */}
      <div>
        <Card padding="lg">
          <div className="flex items-center gap-2 mb-1">
            <UserMinus size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Opt-outs ({optOuts.length})
            </p>
          </div>
          <p className="text-[12px] text-text-muted mb-4 leading-[1.55]">
            Técnicos que pidieron no recibir más invitaciones. El generador los excluye
            automáticamente.
          </p>

          <NuevoOptOut uidActual={user?.uid ?? ''} />

          <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto">
            {optOuts.length === 0 && (
              <p className="text-[12px] text-text-subtle italic">Nadie en opt-out aún.</p>
            )}
            {optOuts.map((o) => (
              <div
                key={o.id}
                className="flex items-start justify-between gap-2 border border-slate-100 rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-mono text-text-strong">{o.cedula}</p>
                  {o.motivo && (
                    <p className="text-[11px] text-text-muted mt-0.5 truncate">{o.motivo}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteDoc(doc(db, 'referidos_optouts', o.id))}
                  className="text-text-subtle hover:text-danger-600 shrink-0"
                  title="Quitar de la lista de opt-out"
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function NuevoOptOut({ uidActual }: { uidActual: string }) {
  const [cedula, setCedula] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const c = cedula.trim();
    if (!c) return;
    setErr(null);
    setGuardando(true);
    try {
      await setDoc(doc(db, 'referidos_optouts', c), {
        cedula: c,
        motivo: motivo.trim() || null,
        registrado_por_uid: uidActual,
        registrado_en: serverTimestamp(),
        creado_en: serverTimestamp(),
        creado_por: uidActual,
        actualizado_en: serverTimestamp(),
        actualizado_por: uidActual,
      });
      setCedula('');
      setMotivo('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={agregar} className="space-y-2">
      <input
        value={cedula}
        onChange={(e) => setCedula(e.target.value)}
        placeholder="Cédula"
        className={inputClass}
      />
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (opcional)"
        className={inputClass}
      />
      {err && <p className="text-[11px] text-danger-700">{err}</p>}
      <Button
        type="submit"
        variant="neutral-secondary"
        loading={guardando}
        disabled={guardando || !cedula.trim()}
        size="small"
      >
        Agregar opt-out
      </Button>
    </form>
  );
}

function Field({
  label,
  children,
  small,
}: {
  label: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <label className="block">
      <span
        className={cn(
          'block font-medium text-text-strong mb-1.5',
          small ? 'text-[11px]' : 'text-[13px]',
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
