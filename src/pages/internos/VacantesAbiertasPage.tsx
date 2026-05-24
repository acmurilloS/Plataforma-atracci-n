import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Building, MapPin, Send } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearCOP } from '../../utils/moneda';
import { postularComoInterno } from '../../utils/postularComoInterno';
import type { VacanteDoc } from '../../schemas';
import { Modal } from '../../components/ui';
import { PoliticaCriticidadBanner } from '../../components/vacantes/PoliticaCriticidadBanner';

/**
 * Vacantes abiertas para empleados internos (movilidad cross-empresa del holding).
 *
 * Cualquier empleado logueado puede ver el listado y postularse a una vacante
 * publicada o en proceso. Reemplaza el flujo de candidato interno que cubría
 * Ciesa antes de que se descontinuara su módulo de gestión de personas.
 */
export default function VacantesAbiertasPage() {
  const { perfil, user } = useAuth();

  // Filtramos sólo las que están recibiendo postulaciones.
  const { docs: publicadas } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'publicada']],
  });
  const { docs: enProceso } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['estado', '==', 'en_proceso']],
  });
  const abiertas = useMemo(
    () => [...publicadas, ...enProceso].sort((a, b) => a.cargo_nombre.localeCompare(b.cargo_nombre)),
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
    return <div className="px-6 py-10 text-sm text-navy-500">Cargando perfil…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold-700">Movilidad interna</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Vacantes abiertas en el holding
        </h1>
        <p className="text-sm text-navy-600 mt-1 max-w-3xl">
          Postúlate a una vacante de cualquiera de las 4 empresas del holding. Tu candidatura queda
          marcada como interna y va por el mismo flujo que las externas — pero el analista la ve
          identificada.
        </p>
      </div>

      {resultado && (
        <div
          className={`rounded-md border p-3 text-sm ${
            resultado.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {resultado.msg}
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-end">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cargo, sede o unidad…"
          className="flex-1 min-w-[240px] rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={filtroEmpresa}
          onChange={(e) => setFiltroEmpresa(e.target.value)}
          className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm"
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
        <div className="rounded-xl border border-navy-100 bg-white p-8 text-center text-sm text-navy-500">
          {abiertas.length === 0
            ? 'No hay vacantes recibiendo postulaciones en este momento.'
            : 'Ninguna vacante cumple los filtros actuales.'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtradas.map((v) => {
          const esVacanteLiderada = v.lider_uid === user.uid;
          return (
            <div
              key={v.id}
              className="rounded-xl border border-navy-100 bg-white p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-navy-400 font-mono">
                    {v.consecutivo}
                  </p>
                  <h3 className="font-display text-lg font-semibold text-navy-900">
                    {v.cargo_nombre}
                  </h3>
                </div>
                <PoliticaCriticidadBanner criticidad={v.criticidad} compacto />
              </div>

              <div className="space-y-1 text-xs text-navy-700">
                <p className="flex items-center gap-1.5">
                  <Building size={12} className="text-navy-400" />
                  {v.empresa_nombre}
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-navy-400" />
                  {v.sede_nombre} · {v.unidad_nombre}
                </p>
                <p className="flex items-center gap-1.5">
                  <Briefcase size={12} className="text-navy-400" />
                  {formatearCOP(v.salario_base)}
                  {v.comisiones_texto && ` + comisiones`}
                </p>
              </div>

              {esVacanteLiderada ? (
                <p className="text-[11px] italic text-amber-700 mt-auto">
                  Esta es una vacante que tú abriste como líder. No puedes postularte (conflicto de
                  interés).
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <Link
                    to={`/vacantes/${v.id}`}
                    className="text-xs text-navy-600 hover:text-navy-900 hover:underline"
                  >
                    Ver detalle →
                  </Link>
                  <button
                    onClick={() => {
                      setResultado(null);
                      setVacanteAPostular(v);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-gold-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-gold-800"
                  >
                    <Send size={12} />
                    Postularme
                  </button>
                </div>
              )}
            </div>
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
          <button
            onClick={onClose}
            disabled={enviando}
            className="rounded-md border border-navy-200 px-4 py-2 text-sm text-navy-700 hover:bg-cream-100"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando}
            className="rounded-md bg-gold-700 text-white px-4 py-2 text-sm font-semibold hover:bg-gold-800 disabled:bg-gold-300"
          >
            {enviando ? 'Enviando…' : 'Enviar postulación'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-navy-800">Especialidad principal *</span>
          <input
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
            placeholder="ej. Comercial B2B, Backend Node.js, Contabilidad NIIF…"
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-navy-800">Años de experiencia (opcional)</span>
          <input
            type="number"
            min={0}
            max={50}
            value={anios}
            onChange={(e) => setAnios(e.target.value)}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-navy-800">¿Por qué te interesa? (opcional)</span>
          <textarea
            value={motivacion}
            onChange={(e) => setMotivacion(e.target.value)}
            rows={3}
            placeholder="Brevemente: por qué este cargo encaja contigo."
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-[11px] text-navy-500 italic">
          Tu candidatura aparece marcada como "interna" para el analista. El proceso es el mismo
          que para candidatos externos.
        </p>
        {err && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}
