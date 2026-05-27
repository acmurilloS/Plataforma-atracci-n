import { useState, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Briefcase, Plus, X } from 'lucide-react';
import { Modal } from '../ui';
import { Button, Pill } from '../brand';
import { useMutacion } from '../../hooks/useMutacion';
import { cn } from '../../utils/cn';
import type { CargoDoc } from '../../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreado: (cargo: CargoDoc) => void;
  /** Si el líder ya tipeó algo en el buscador, lo pre-llenamos. */
  nombreSugerido?: string;
}

const CATEGORIAS = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'operativo', label: 'Operativo' },
  { value: 'liderazgo', label: 'Liderazgo' },
] as const;

const CRITICIDADES = [
  {
    value: 'Alta',
    label: 'Alta',
    descripcion: 'Técnico / comercial / director · flujo completo',
    tono: 'danger' as const,
  },
  {
    value: 'Media',
    label: 'Media',
    descripcion: 'Roles intermedios · flujo estándar',
    tono: 'warning' as const,
  },
  {
    value: 'Baja',
    label: 'Baja',
    descripcion: 'Admin / operativo · flujo simplificado',
    tono: 'success' as const,
  },
] as const;

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

/**
 * CrearCargoModal · permite al líder crear un cargo nuevo desde el form
 * de nueva vacante cuando el catálogo no lo contiene. Pide solo las
 * variables que Atracción necesita para arrancar el flujo:
 *
 *  - Nombre + categoría + criticidad sugerida (obligatorias)
 *  - Banda salarial mín/max (opcional, GH refina después)
 *  - Herramientas sugeridas (para disparar tickets de IT/compras/etc.)
 *
 * Maribel después afina banda/criticidad y agrega requisitos (licencia,
 * moto, tarjeta profesional, pruebas) desde /admin/catalogos.
 */
export function CrearCargoModal({ open, onClose, onCreado, nombreSugerido }: Props) {
  const { crear } = useMutacion();
  const [nombre, setNombre] = useState(nombreSugerido ?? '');
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]['value']>('comercial');
  const [criticidad, setCriticidad] = useState<'Alta' | 'Media' | 'Baja'>('Media');
  const [bandaMin, setBandaMin] = useState('');
  const [bandaMax, setBandaMax] = useState('');
  const [computador, setComputador] = useState(true);
  const [office, setOffice] = useState(true);
  const [celularPlanDatos, setCelularPlanDatos] = useState(false);
  const [labroides, setLabroides] = useState(false);
  const [dotacion, setDotacion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setNombre('');
    setCategoria('comercial');
    setCriticidad('Media');
    setBandaMin('');
    setBandaMax('');
    setComputador(true);
    setOffice(true);
    setCelularPlanDatos(false);
    setLabroides(false);
    setDotacion(false);
    setErr(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const nombreTrim = nombre.trim();
    if (nombreTrim.length < 3) {
      setErr('El nombre del cargo debe tener al menos 3 caracteres.');
      return;
    }
    const min = bandaMin.trim() === '' ? null : Number(bandaMin);
    const max = bandaMax.trim() === '' ? null : Number(bandaMax);
    if (min !== null && (isNaN(min) || min < 0)) {
      setErr('Banda mínima inválida.');
      return;
    }
    if (max !== null && (isNaN(max) || max < 0)) {
      setErr('Banda máxima inválida.');
      return;
    }
    if (min !== null && max !== null && min > max) {
      setErr('La banda mínima no puede ser mayor que la máxima.');
      return;
    }

    setEnviando(true);
    try {
      const data = {
        nombre: nombreTrim,
        categoria,
        criticidad_sugerida: criticidad,
        banda_min: min,
        banda_max: max,
        requiere_licencia: false,
        requiere_moto: false,
        requiere_tarjeta_profesional: false,
        requiere_titulo_profesional: false,
        pruebas_sugeridas: [],
        herramientas_sugeridas: {
          computador,
          office,
          celular_plan_datos: celularPlanDatos,
          labroides,
          dotacion,
        },
        activo: true,
      };
      const id = await crear('cargos_catalogo', data);
      // Devolvemos un CargoDoc "optimista" con los campos esenciales.
      // El onSnapshot del padre (useCargos) refrescará con la versión
      // canónica del server en milisegundos.
      const ahora = Timestamp.now();
      const cargoCompleto: CargoDoc = {
        id,
        ...data,
        creado_en: ahora,
        creado_por: 'optimistic',
        actualizado_en: ahora,
        actualizado_por: 'optimistic',
      };
      onCreado(cargoCompleto);
      reset();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos crear el cargo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear cargo nuevo"
      description="No encontraste tu cargo en el catálogo. Llena estos datos y se crea al vuelo — Maribel (GH) puede refinar la banda salarial y criticidad después."
      size="lg"
      footer={
        <>
          <Button variant="neutral-secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="brand-primary"
            onClick={(e) => onSubmit(e as unknown as FormEvent)}
            loading={enviando}
            disabled={enviando}
            icon={<Plus size={13} strokeWidth={1.75} />}
          >
            {enviando ? 'Creando…' : 'Crear cargo'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Nombre */}
        <Field label="Nombre del cargo" required>
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Coordinador comercial regional Antioquia"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Categoría */}
          <Field label="Categoría" required>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as typeof categoria)}
              className={inputClass}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Criticidad */}
          <Field label="Criticidad sugerida" required>
            <select
              value={criticidad}
              onChange={(e) => setCriticidad(e.target.value as typeof criticidad)}
              className={inputClass}
            >
              {CRITICIDADES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} · {c.descripcion}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Banda salarial */}
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              Banda salarial (COP)
              <Pill tono="neutral">opcional · GH refina después</Pill>
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              step="100000"
              value={bandaMin}
              onChange={(e) => setBandaMin(e.target.value)}
              placeholder="Mínimo"
              className={cn(inputClass, 'tabular-nums')}
            />
            <input
              type="number"
              min="0"
              step="100000"
              value={bandaMax}
              onChange={(e) => setBandaMax(e.target.value)}
              placeholder="Máximo"
              className={cn(inputClass, 'tabular-nums')}
            />
          </div>
        </Field>

        {/* Herramientas */}
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              Herramientas que necesitará
              <Pill tono="info">para tickets de ingreso</Pill>
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <Check
              label="Computador"
              checked={computador}
              onChange={setComputador}
            />
            <Check label="Office / Suite ofimática" checked={office} onChange={setOffice} />
            <Check
              label="Celular + plan de datos"
              checked={celularPlanDatos}
              onChange={setCelularPlanDatos}
            />
            <Check
              label="Labroides (contabilidad)"
              checked={labroides}
              onChange={setLabroides}
            />
            <Check label="Dotación / uniforme" checked={dotacion} onChange={setDotacion} />
          </div>
        </Field>

        {err && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2 text-[12px] text-danger-700 inline-flex items-start gap-2">
            <X size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            {err}
          </div>
        )}

        <div className="rounded-md border border-brand-200 bg-brand-50/40 px-3.5 py-2.5">
          <p className="text-[11px] text-brand-700 leading-[1.55] inline-flex items-start gap-2">
            <Briefcase size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>
              Este cargo queda disponible para todas las vacantes futuras del holding. Si te
              equivocas en algo, Maribel puede ajustarlo desde Catálogos.
            </span>
          </p>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1.5">
        {label}
        {required && <span className="text-danger-700 ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer text-[13px] transition-colors',
        checked
          ? 'border-brand-300 bg-brand-50/50 text-text-strong font-medium'
          : 'border-slate-200 hover:bg-slate-50 text-text-body',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-300/40"
      />
      {label}
    </label>
  );
}
