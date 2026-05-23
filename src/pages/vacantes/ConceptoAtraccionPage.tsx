import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import type {
  CandidatoConcepto,
  ConceptoAtraccionDoc,
  PostulacionDoc,
  VacanteDoc,
} from '../../schemas';
import { EquitelLogo } from '../../components/EquitelLogo';

export default function ConceptoAtraccionPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones', {
    filtros: id ? [['vacante_id', '==', id]] : [],
  });
  const { docs: conceptos } = useColeccion<ConceptoAtraccionDoc>('conceptos_atraccion', {
    filtros: id ? [['vacante_id', '==', id]] : [],
    limit: 1,
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil } = useAuth();

  const concepto = conceptos[0] ?? null;

  const [filas, setFilas] = useState<CandidatoConcepto[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Inicializar filas desde el concepto guardado, o desde candidatos avanzados
  useEffect(() => {
    if (concepto) {
      setFilas(concepto.candidatos);
      return;
    }
    // Auto-poblar con postulaciones avanzadas: en_terna o más allá
    const estadosAvanzados = new Set([
      'en_terna',
      'seleccionado_por_lider',
      'descartado_por_lider',
      'en_contratacion',
      'contratado',
      'entrevistado_analista',
      'referencias_validadas',
    ]);
    const auto: CandidatoConcepto[] = postulaciones
      .filter((p) => estadosAvanzados.has(p.estado))
      .map((p) => ({
        postulacion_id: p.id,
        nombre: p.candidato_nombre,
        ciudad: '',
        edad: '',
        formacion: '',
        experiencia: '',
        concepto: '',
      }));
    setFilas(auto);
  }, [concepto, postulaciones]);

  function actualizarFila(i: number, patch: Partial<CandidatoConcepto>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    setGuardado(false);
  }

  function agregarFila() {
    setFilas((prev) => [
      ...prev,
      { postulacion_id: '', nombre: '', ciudad: '', edad: '', formacion: '', experiencia: '', concepto: '' },
    ]);
    setGuardado(false);
  }

  function eliminarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
    setGuardado(false);
  }

  async function guardar() {
    if (!vacante || !user) return;
    setGuardando(true);
    setErr(null);
    try {
      const payload = {
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        empresa_codigo: vacante.empresa_codigo,
        empresa_nombre: vacante.empresa_nombre,
        unidad_id: vacante.unidad_id,
        unidad_nombre: vacante.unidad_nombre,
        sede_codigo: vacante.sede_codigo,
        sede_nombre: vacante.sede_nombre,
        cargo_id: vacante.cargo_id,
        cargo_nombre: vacante.cargo_nombre,
        analista_uid: vacante.analista_uid ?? user.uid,
        analista_nombre: vacante.analista_nombre ?? (perfil ? `${perfil.nombre} ${perfil.apellido}` : ''),
        fecha_concepto: Timestamp.now(),
        candidatos: filas,
      };
      if (concepto) {
        await actualizar('conceptos_atraccion', concepto.id, payload);
      } else {
        await crear('conceptos_atraccion', payload);
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setGuardando(false);
    }
  }

  function imprimir() {
    window.print();
  }

  if (!vacante) return <div className="px-6 py-10 text-sm text-navy-500">Cargando vacante…</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      {/* Acciones (no se imprimen) */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <Link to={`/vacantes/${vacante.id}`} className="text-xs text-navy-500 hover:text-navy-800">
            ← Volver a detalle
          </Link>
          <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">Pasos 11-12 · Analista</p>
          <h1 className="font-display text-3xl font-semibold text-navy-900">
            Concepto de Atracción y Desarrollo
          </h1>
          <p className="text-sm text-navy-600 mt-1">Formato VIDA-F-03 v0</p>
        </div>
        <div className="flex gap-2">
          {guardado && (
            <span className="inline-flex items-center text-xs text-emerald-600 font-semibold">
              ✓ Guardado
            </span>
          )}
          <button
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
          >
            <Save size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={imprimir}
            className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-cream-100"
          >
            <Printer size={14} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 print:hidden">
          {err}
        </div>
      )}

      {/* Hoja imprimible */}
      <div className="bg-white border border-navy-200 print:border-0 print:p-0 p-8 shadow-ambient print:shadow-none">
        {/* Cabecera oficial */}
        <header className="flex items-center justify-between gap-6 border border-navy-300 print:border-navy-900">
          <div className="flex items-center gap-4 px-4 py-3 border-r border-navy-300 print:border-navy-900">
            <EquitelLogo size={56} />
          </div>
          <div className="flex-1 text-center py-3 px-4">
            <p className="text-sm font-bold uppercase tracking-wide text-navy-900">Organización Equitel</p>
            <p className="text-sm font-bold uppercase tracking-wide text-navy-900">Cultura y Desarrollo</p>
            <p className="text-sm font-bold uppercase tracking-wide text-navy-900">
              Concepto de Atracción y Desarrollo
            </p>
          </div>
          <div className="border-l border-navy-300 print:border-navy-900 text-xs">
            <div className="flex border-b border-navy-300 print:border-navy-900">
              <span className="px-3 py-1.5 font-bold border-r border-navy-300 print:border-navy-900 w-24">CÓDIGO</span>
              <span className="px-3 py-1.5 w-24">VIDA-F-03</span>
            </div>
            <div className="flex border-b border-navy-300 print:border-navy-900">
              <span className="px-3 py-1.5 font-bold border-r border-navy-300 print:border-navy-900 w-24">VERSIÓN</span>
              <span className="px-3 py-1.5 w-24">0</span>
            </div>
            <div className="flex">
              <span className="px-3 py-1.5 font-bold border-r border-navy-300 print:border-navy-900 w-24">PÁGINA</span>
              <span className="px-3 py-1.5 w-24">1 DE 1</span>
            </div>
          </div>
        </header>

        {/* Datos de la vacante */}
        <div className="border-x border-b border-navy-300 print:border-navy-900">
          <DatoFila label="Consecutivo" valor={vacante.consecutivo} />
          <DatoFila label="Empresa" valor={vacante.empresa_nombre} />
          <DatoFila label="Unidad" valor={vacante.unidad_nombre} />
          <DatoFila label="Sede" valor={vacante.sede_nombre} />
          <DatoFila label="Fecha" valor={formatearFecha(new Date())} />
          <DatoFila label="Cargo" valor={vacante.cargo_nombre} />
          <DatoFila
            label="Analista"
            valor={vacante.analista_nombre ?? (perfil ? `${perfil.nombre} ${perfil.apellido}` : '—')}
          />
        </div>

        {/* Tabla de candidatos */}
        <table className="w-full border-collapse border border-navy-300 print:border-navy-900 mt-0 text-xs">
          <thead className="bg-navy-100 print:bg-white">
            <tr>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 text-left font-bold w-[18%]">
                Nombre del candidato
              </th>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 text-left font-bold w-[10%]">Ciudad</th>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 text-left font-bold w-[6%]">Edad</th>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 text-left font-bold w-[18%]">
                Formación
              </th>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 text-left font-bold w-[18%]">
                Experiencia
              </th>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 text-left font-bold w-[26%]">
                Concepto de atracción
              </th>
              <th className="border border-navy-300 print:border-navy-900 px-2 py-2 w-[4%] print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={7} className="border border-navy-300 print:border-navy-900 px-3 py-6 text-center text-navy-400 italic">
                  Sin candidatos. Click "+ Agregar" para llenar manualmente o asegúrate de tener candidatos en estado "en terna" o más allá.
                </td>
              </tr>
            )}
            {filas.map((f, i) => (
              <tr key={i}>
                <td className="border border-navy-300 print:border-navy-900 align-top">
                  <CeldaInput valor={f.nombre} onChange={(v) => actualizarFila(i, { nombre: v })} />
                </td>
                <td className="border border-navy-300 print:border-navy-900 align-top">
                  <CeldaInput valor={f.ciudad} onChange={(v) => actualizarFila(i, { ciudad: v })} />
                </td>
                <td className="border border-navy-300 print:border-navy-900 align-top">
                  <CeldaInput valor={f.edad} onChange={(v) => actualizarFila(i, { edad: v })} />
                </td>
                <td className="border border-navy-300 print:border-navy-900 align-top">
                  <CeldaTextarea valor={f.formacion} onChange={(v) => actualizarFila(i, { formacion: v })} />
                </td>
                <td className="border border-navy-300 print:border-navy-900 align-top">
                  <CeldaTextarea valor={f.experiencia} onChange={(v) => actualizarFila(i, { experiencia: v })} />
                </td>
                <td className="border border-navy-300 print:border-navy-900 align-top">
                  <CeldaTextarea valor={f.concepto} onChange={(v) => actualizarFila(i, { concepto: v })} />
                </td>
                <td className="border border-navy-300 print:border-navy-900 align-top text-center print:hidden">
                  <button
                    onClick={() => eliminarFila(i)}
                    className="text-red-600 hover:bg-red-50 p-1 rounded"
                    title="Eliminar fila"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end print:hidden">
        <button
          onClick={agregarFila}
          className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-cream-100"
        >
          <Plus size={14} /> Agregar fila
        </button>
      </div>
    </div>
  );
}

function DatoFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex border-t border-navy-300 print:border-navy-900 first:border-t-0">
      <div className="w-32 px-3 py-1.5 bg-navy-100 print:bg-white border-r border-navy-300 print:border-navy-900 font-bold text-xs">
        {label}
      </div>
      <div className="flex-1 px-3 py-1.5 text-xs">{valor || '—'}</div>
    </div>
  );
}

function CeldaInput({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-xs border-0 focus:bg-cream-50 focus:outline-none print:bg-transparent"
    />
  );
}

function CeldaTextarea({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full px-2 py-1.5 text-xs border-0 resize-none focus:bg-cream-50 focus:outline-none print:bg-transparent"
    />
  );
}
