import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Building2, MapPin, Search, Send } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearCOP } from '../../utils/moneda';
import { postularComoInterno } from '../../utils/postularComoInterno';
import type { VacanteDoc } from '../../schemas';
import { Modal } from '../../components/ui';
import { PoliticaCriticidadBanner } from '../../components/vacantes/PoliticaCriticidadBanner';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * VacantesAbiertasPage · sistema brand.
 *
 * Movilidad cross-empresa del holding. Cualquier empleado logueado ve el
 * listado de vacantes publicadas / en proceso y puede postularse con un
 * formulario corto. Cubre lo último que faltaba antes de descontinuar el
 * módulo de personas de Ciesa.
 */

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

const textareaClass = inputClass + ' resize-none leading-relaxed';

export default function VacantesAbiertasPage() {
  const { perfil, user } = useAuth();

  const { docs: publicadas } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'publicada']],
  });
  const { docs: enProceso } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'en_proceso']],
  });
  const abiertas = useMemo(
    () =>
      [...publicadas, ...enProceso].sort((a, b) =>
        a.cargo_nombre.localeCompare(b.cargo_nombre),
      ),
    [publicadas, enProceso],
  );

  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [vacanteAPostular, setVacanteAPostular] = useState<VacanteDoc | null>(null);
  const [resultado, setResultado] = useState<{
    tipo: 'ok' | 'error';
    msg: string;
    consecutivo?: string;
  } | null>(null);

  const empresasUnicas = useMemo(
    () => Array.from(new Set(abiertas.map((v) => v.empresa_codigo))).sort(),
    [abiertas],
  );

  const filtradas = abiertas.filter((v) => {
    if (filtroEmpresa && v.empresa_codigo !== filtroEmpresa) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const txt = `${v.cargo_nombre} ${v.empresa_nombre} ${v.sede_nombre} ${v.unidad_nombre}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  if (!perfil || !user) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 text-text-muted text-sm">
        Cargando perfil…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Movilidad interna
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Vacantes abiertas en el holding
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-3xl">
          Postúlate a una vacante de cualquiera de las 4 empresas del holding. Tu candidatura
          queda marcada como interna y va por el mismo flujo que las externas — pero el
          analista la ve identificada.
        </p>
      </div>

      {resultado && (
        <div
          className={cn(
            'rounded-md border px-3.5 py-2.5 text-[13px]',
            resultado.tipo === 'ok'
              ? 'border-success-500/30 bg-success-50/60 text-success-700'
              : 'border-danger-500/20 bg-danger-50 text-danger-700',
          )}
        >
          {resultado.msg}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[240px] relative">
          <Search
            size={14}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cargo, sede o unidad…"
            className={cn(inputClass, 'pl-9')}
          />
        </div>
        <select
          value={filtroEmpresa}
          onChange={(e) => setFiltroEmpresa(e.target.value)}
          className={cn(inputClass, 'md:w-auto')}
        >
          <option value="">Todas las empresas</option>
          {empresasUnicas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="w-12 h-12 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
            <Briefcase size={20} strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-medium text-text-strong">
            {abiertas.length === 0
              ? 'No hay vacantes recibiendo postulaciones'
              : 'Ninguna vacante cumple los filtros'}
          </p>
          <p className="text-[12px] text-text-muted mt-1">
            {abiertas.length === 0
              ? 'Pronto verás aquí las nuevas oportunidades del holding.'
              : 'Ajusta los filtros para ver más opciones.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtradas.map((v) => {
          const esVacanteLiderada = v.lider_uid === user.uid;
          return (
            <Card key={v.id} clickable={!esVacanteLiderada} padding="md" className="flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-text-subtle font-mono">
                    {v.consecutivo}
                  </p>
                  <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.012em] text-text-strong">
                    {v.cargo_nombre}
                  </h3>
                </div>
                <PoliticaCriticidadBanner criticidad={v.criticidad} compacto />
              </div>

              <div className="space-y-1.5 text-[12px] text-text-body">
                <p className="flex items-center gap-1.5">
                  <Building2 size={12} strokeWidth={1.5} className="text-text-subtle" />
                  {v.empresa_nombre}
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin size={12} strokeWidth={1.5} className="text-text-subtle" />
                  {v.sede_nombre} · {v.unidad_nombre}
                </p>
                <p className="flex items-center gap-1.5 tabular-nums">
                  <Briefcase size={12} strokeWidth={1.5} className="text-text-subtle" />
                  {formatearCOP(v.salario_base)}
                  {v.comisiones_texto && (
                    <span className="text-text-subtle"> + comisiones</span>
                  )}
                </p>
              </div>

              {esVacanteLiderada ? (
                <div className="mt-auto pt-4 border-t border-slate-100">
                  <p className="text-[11px] italic text-warning-700">
                    Esta es una vacante que tú abriste como líder. No puedes postularte
                    (conflicto de interés).
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 mt-auto pt-4">
                  <Link
                    to={`/vacantes/${v.id}`}
                    className="text-[12px] font-medium text-text-muted hover:text-text-strong hover:underline"
                  >
                    Ver detalle →
                  </Link>
                  <Button
                    variant="brand-primary"
                    size="medium"
                    onClick={() => {
                      setResultado(null);
                      setVacanteAPostular(v);
                    }}
                    icon={<Send size={13} strokeWidth={1.75} />}
                  >
                    Postularme
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {vacanteAPostular && (
        <ModalPostulacionInterna
          vacante={vacanteAPostular}
          onClose={() => setVacanteAPostular(null)}
          onResultado={(r) => {
            setResultado(r);
            setVacanteAPostular(null);
          }}
        />
      )}
    </div>
  );
}

interface ModalProps {
  vacante: VacanteDoc;
  onClose: () => void;
  onResultado: (r: { tipo: 'ok' | 'error'; msg: string; consecutivo?: string }) => void;
}

function ModalPostulacionInterna({ vacante, onClose, onResultado }: ModalProps) {
  const { perfil } = useAuth();
  const [especialidad, setEspecialidad] = useState('');
  const [anios, setAnios] = useState('');
  const [motivacion, setMotivacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function enviar() {
    if (!perfil) return;
    if (especialidad.trim().length < 3) {
      setErr('Cuéntanos brevemente tu especialidad principal.');
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      const aniosNum = anios ? parseInt(anios, 10) : null;
      await postularComoInterno({
        vacante,
        empleado: perfil,
        especialidad: especialidad.trim(),
        aniosExperiencia: aniosNum,
        motivacion: motivacion.trim(),
      });
      onResultado({
        tipo: 'ok',
        msg: `Postulación interna enviada a ${vacante.consecutivo} · ${vacante.cargo_nombre}. El analista revisará tu candidatura.`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos postularte.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Postulación interna · ${vacante.cargo_nombre}`}
      description={`${vacante.empresa_nombre} · ${vacante.sede_nombre} · ${vacante.consecutivo}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral-secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="brand-primary"
            onClick={enviar}
            disabled={enviando}
            loading={enviando}
            icon={<Send size={13} strokeWidth={1.75} />}
          >
            {enviando ? 'Enviando…' : 'Enviar postulación'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="block text-[13px] font-medium text-text-strong mb-1.5">
            Especialidad principal <span className="text-brand-600">*</span>
          </span>
          <input
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
            placeholder="ej. Comercial B2B, Backend Node.js, Contabilidad NIIF…"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-text-strong mb-1.5">
            Años de experiencia <span className="text-text-subtle font-normal">(opcional)</span>
          </span>
          <input
            type="number"
            min={0}
            max={50}
            value={anios}
            onChange={(e) => setAnios(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-text-strong mb-1.5">
            ¿Por qué te interesa? <span className="text-text-subtle font-normal">(opcional)</span>
          </span>
          <textarea
            value={motivacion}
            onChange={(e) => setMotivacion(e.target.value)}
            rows={3}
            placeholder="Brevemente: por qué este cargo encaja contigo."
            className={textareaClass}
          />
        </label>
        <p className="text-[11px] text-text-subtle italic">
          Tu candidatura aparece marcada como "interna" para el analista. El proceso es el mismo
          que para candidatos externos.
        </p>
        {err && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}
