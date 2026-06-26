import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Check, FileDown, Plus, Printer, Save, Send, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
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
import { Button, Pill } from '../../components/brand';

/**
 * ConceptoAtraccionPage · sistema brand (controles) + hoja oficial.
 *
 * El header/controles usan el lenguaje brand. La hoja imprimible mantiene
 * el formato oficial VIDA-F-03 con bordes negros para que se vea como
 * documento corporativo cuando se exporta a PDF o se imprime.
 */
/** Estados donde el candidato ya es relevante para la terna/concepto. */
const ESTADOS_AVANZADOS = new Set([
  'en_terna',
  'seleccionado_por_lider',
  'en_examenes_medicos',
  'descartado_por_lider',
  'en_contratacion',
  'contratado',
  'entrevistado_analista',
  'referencias_validadas',
]);

/** Campos del informe que usamos para pre-llenar el Concepto. */
interface InformeMin {
  id: string;
  postulacion_id: string;
  resumen_ejecutivo?: string;
  trayectoria?: string;
  version?: number;
  [k: string]: unknown;
}

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
  // Informes de los candidatos de esta vacante. Sirven para auto-llenar el
  // Concepto sin volver a digitar lo que ya se escribió en el Informe (paso 11).
  const { docs: informes } = useColeccion<InformeMin>('informes', {
    filtros: id ? [['vacante_id', '==', id]] : [],
  });
  const { crear, actualizar } = useMutacion();
  const { user, perfil, rol } = useAuth();

  const concepto = conceptos[0] ?? null;
  // El líder llega aquí desde la notificación "Concepto listo": ve la hoja en
  // modo solo-lectura (sin editar/guardar/enviar), solo para revisar e imprimir.
  const esLider = rol === 'lider';

  const [filas, setFilas] = useState<CandidatoConcepto[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [enviandoLider, setEnviandoLider] = useState(false);
  const [enviadoLider, setEnviadoLider] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Arma las filas del Concepto desde los Informes + datos del candidato:
  //   · experiencia ← informe.trayectoria (paso 11)
  //   · concepto    ← informe.resumen_ejecutivo (paso 11)
  //   · ciudad/formación ← candidato (ciudad_residencia / especialidad_tecnica)
  // Así el analista no vuelve a digitar lo que ya escribió en el Informe.
  const armarDesdeInformes = useCallback(async (): Promise<CandidatoConcepto[]> => {
    const terna = postulaciones.filter((p) => ESTADOS_AVANZADOS.has(p.estado));

    // Último informe (mayor versión) por postulación.
    const informePorPost = new Map<string, InformeMin>();
    for (const inf of informes) {
      const prev = informePorPost.get(inf.postulacion_id);
      if (!prev || (inf.version ?? 0) > (prev.version ?? 0)) {
        informePorPost.set(inf.postulacion_id, inf);
      }
    }

    // Traer los candidatos de la terna (para ciudad y especialidad).
    const candCache = new Map<string, Record<string, unknown>>();
    await Promise.all(
      terna.map(async (p) => {
        if (!p.candidato_id || candCache.has(p.candidato_id)) return;
        try {
          const snap = await getDoc(doc(db, 'candidatos', p.candidato_id));
          if (snap.exists()) candCache.set(p.candidato_id, snap.data() as Record<string, unknown>);
        } catch {
          /* candidato no accesible → se deja vacío */
        }
      }),
    );

    return terna.map((p) => {
      const inf = informePorPost.get(p.id);
      const cand = p.candidato_id ? candCache.get(p.candidato_id) : null;
      return {
        postulacion_id: p.id,
        nombre: p.candidato_nombre,
        ciudad: (cand?.ciudad_residencia as string) ?? '',
        edad: '',
        formacion: (cand?.especialidad_tecnica as string) ?? '',
        experiencia: inf?.trayectoria ?? '',
        concepto: inf?.resumen_ejecutivo ?? '',
      };
    });
  }, [postulaciones, informes]);

  useEffect(() => {
    if (concepto) {
      setFilas(concepto.candidatos);
      return;
    }
    // Primera vez (sin Concepto guardado): pre-llenar desde los Informes.
    let cancelado = false;
    armarDesdeInformes().then((rows) => {
      if (!cancelado) setFilas(rows);
    });
    return () => {
      cancelado = true;
    };
  }, [concepto, armarDesdeInformes]);

  async function traerDeInformes() {
    const hayContenido = filas.some((f) => f.concepto || f.experiencia || f.ciudad);
    if (
      hayContenido &&
      !window.confirm(
        'Esto vuelve a llenar la tabla con los datos de los Informes y el candidato. ' +
          'Se reemplaza lo que esté escrito. ¿Continuar?',
      )
    ) {
      return;
    }
    const rows = await armarDesdeInformes();
    setFilas(rows);
    setGuardado(false);
  }

  function actualizarFila(i: number, patch: Partial<CandidatoConcepto>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    setGuardado(false);
  }

  function agregarFila() {
    setFilas((prev) => [
      ...prev,
      {
        postulacion_id: '',
        nombre: '',
        ciudad: '',
        edad: '',
        formacion: '',
        experiencia: '',
        concepto: '',
      },
    ]);
    setGuardado(false);
  }

  function eliminarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
    setGuardado(false);
  }

  async function guardar(): Promise<boolean> {
    if (!vacante || !user) return false;
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
        analista_nombre:
          vacante.analista_nombre ?? (perfil ? `${perfil.nombre} ${perfil.apellido}` : ''),
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
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar.');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Guarda el concepto y le avisa al líder de la vacante que ya puede revisarlo.
   * La notificación cae en su campana y, vía onNotificacionCreate, también le
   * llega por correo con un botón que lo lleva directo a este cuadro.
   */
  async function enviarAlLider() {
    if (!vacante || !user) return;
    if (!vacante.lider_uid) {
      setErr('Esta vacante no tiene un líder asignado, así que no hay a quién enviarle el concepto.');
      return;
    }
    // Guarda anti-doble-envío: si ya se le envió el concepto al líder, confirmar.
    const yaEnviado = (vacante as unknown as Record<string, unknown>).concepto_enviado_lider_en;
    if (yaEnviado && !window.confirm('Ya le enviaste el concepto a este líder. ¿Reenviar?')) {
      return;
    }
    setEnviandoLider(true);
    setErr(null);
    // Guardamos primero para que el líder abra exactamente lo que está en pantalla.
    const ok = await guardar();
    if (!ok) {
      setEnviandoLider(false);
      return;
    }
    try {
      const analista = perfil ? `${perfil.nombre} ${perfil.apellido}` : 'El equipo de Atracción';
      const nombres = filas.map((f) => f.nombre).filter(Boolean);
      const lista = nombres.length > 0 ? `: ${nombres.join(', ')}` : '';
      await crear('notificaciones', {
        destinatario_uid: vacante.lider_uid,
        tipo: 'concepto_listo',
        titulo: 'Concepto de atracción listo para tu revisión',
        mensaje: `${analista} te compartió el concepto de atracción de ${vacante.cargo_nombre} (${vacante.consecutivo}) con ${nombres.length} integrante(s) finalista(s)${lista}. Ábrelo para revisarlo desde la plataforma.`,
        link: `/vacantes/${vacante.id}/concepto-atraccion`,
        leida: false,
        leida_en: null,
      });
      await actualizar('vacantes', vacante.id, { concepto_enviado_lider_en: Timestamp.now() });
      setEnviadoLider(true);
      setTimeout(() => setEnviadoLider(false), 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos enviar el concepto al líder.');
    } finally {
      setEnviandoLider(false);
    }
  }

  function imprimir() {
    window.print();
  }

  if (!vacante)
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">
        Cargando vacante…
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      {/* Controles (no se imprimen) */}
      <div className="print:hidden">
        <Link
          to={`/vacantes/${vacante.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Volver al detalle
        </Link>
        <div className="mt-6 flex items-start justify-between flex-wrap gap-6">
          <div>
            <Pill tono="brand" dot>
              {esLider ? 'Revisión · Líder' : 'Pasos 11 – 12 · Analista'}
            </Pill>
            <h1
              className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
              style={{ textWrap: 'balance' }}
            >
              Concepto de Atracción y Desarrollo
            </h1>
            <p className="mt-3 text-[14px] text-text-muted leading-[1.55] max-w-xl">
              {esLider
                ? 'Concepto de atracción de los integrantes finalistas, preparado por el equipo de Atracción. Revísalo y, si lo necesitas, expórtalo a PDF.'
                : 'Formato oficial VIDA-F-03 v0. La tabla se llena sola con lo que escribiste en los Informes (paso 11); ajusta lo que falte, guarda, envíaselo al líder o expórtalo a PDF.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {guardado && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
                <Check size={13} strokeWidth={2} />
                Guardado
              </span>
            )}
            {enviadoLider && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
                <Check size={13} strokeWidth={2} />
                Enviado al líder
              </span>
            )}
            {!esLider && (
              <>
                <Button
                  onClick={traerDeInformes}
                  variant="neutral-secondary"
                  icon={<FileDown size={13} strokeWidth={1.75} />}
                >
                  Traer de los informes
                </Button>
                <Button
                  onClick={guardar}
                  disabled={guardando || enviandoLider}
                  loading={guardando}
                  variant="neutral-secondary"
                  icon={<Save size={13} strokeWidth={1.75} />}
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button
                  onClick={enviarAlLider}
                  disabled={enviandoLider || guardando}
                  loading={enviandoLider}
                  variant="brand-primary"
                  icon={<Send size={13} strokeWidth={1.75} />}
                >
                  {enviandoLider ? 'Enviando…' : 'Enviar al líder'}
                </Button>
              </>
            )}
            <Button
              onClick={imprimir}
              variant="neutral-secondary"
              icon={<Printer size={13} strokeWidth={1.75} />}
            >
              Imprimir / PDF
            </Button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 print:hidden">
          {err}
        </div>
      )}

      {/* Hoja oficial imprimible · mantiene formato VIDA-F-03 */}
      <div className="bg-white border border-slate-300 print:border-0 print:p-0 p-8 shadow-brand-card print:shadow-none">
        <header className="flex items-center justify-between gap-6 border border-text-strong">
          <div className="flex items-center gap-4 px-4 py-3 border-r border-text-strong">
            <EquitelLogo size={56} />
          </div>
          <div className="flex-1 text-center py-3 px-4">
            <p className="text-[13px] font-bold uppercase tracking-wide text-text-strong">
              Organización Equitel
            </p>
            <p className="text-[13px] font-bold uppercase tracking-wide text-text-strong">
              Cultura y Desarrollo
            </p>
            <p className="text-[13px] font-bold uppercase tracking-wide text-text-strong">
              Concepto de Atracción y Desarrollo
            </p>
          </div>
          <div className="border-l border-text-strong text-[11px] tabular-nums">
            <div className="flex border-b border-text-strong">
              <span className="px-3 py-1.5 font-bold border-r border-text-strong w-24">
                CÓDIGO
              </span>
              <span className="px-3 py-1.5 w-24">VIDA-F-03</span>
            </div>
            <div className="flex border-b border-text-strong">
              <span className="px-3 py-1.5 font-bold border-r border-text-strong w-24">
                VERSIÓN
              </span>
              <span className="px-3 py-1.5 w-24">0</span>
            </div>
            <div className="flex">
              <span className="px-3 py-1.5 font-bold border-r border-text-strong w-24">
                PÁGINA
              </span>
              <span className="px-3 py-1.5 w-24">1 DE 1</span>
            </div>
          </div>
        </header>

        <div className="border-x border-b border-text-strong">
          <DatoFila label="Consecutivo" valor={vacante.consecutivo} />
          <DatoFila label="Empresa" valor={vacante.empresa_nombre} />
          <DatoFila label="Unidad" valor={vacante.unidad_nombre} />
          <DatoFila label="Sede" valor={vacante.sede_nombre} />
          <DatoFila label="Fecha" valor={formatearFecha(new Date())} />
          <DatoFila label="Cargo" valor={vacante.cargo_nombre} />
          <DatoFila
            label="Analista"
            valor={
              vacante.analista_nombre ??
              (perfil ? `${perfil.nombre} ${perfil.apellido}` : '—')
            }
          />
        </div>

        <table className="w-full border-collapse border border-text-strong mt-0 text-[11px]">
          <thead className="bg-slate-100 print:bg-white">
            <tr>
              <th className="border border-text-strong px-2 py-2 text-left font-bold w-[18%]">
                Nombre del integrante
              </th>
              <th className="border border-text-strong px-2 py-2 text-left font-bold w-[10%]">
                Ciudad
              </th>
              <th className="border border-text-strong px-2 py-2 text-left font-bold w-[6%]">
                Edad
              </th>
              <th className="border border-text-strong px-2 py-2 text-left font-bold w-[18%]">
                Formación
              </th>
              <th className="border border-text-strong px-2 py-2 text-left font-bold w-[18%]">
                Experiencia
              </th>
              <th className="border border-text-strong px-2 py-2 text-left font-bold w-[26%]">
                Concepto de atracción
              </th>
              <th className="border border-text-strong px-2 py-2 w-[4%] print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="border border-text-strong px-3 py-6 text-center text-text-subtle italic"
                >
                  Sin integrantes. Click "+ Agregar" para llenar manualmente o asegúrate de tener
                  integrantes en estado "en terna" o más allá.
                </td>
              </tr>
            )}
            {filas.map((f, i) => (
              <tr key={i}>
                <td className="border border-text-strong align-top">
                  <CeldaInput
                    valor={f.nombre}
                    onChange={(v) => actualizarFila(i, { nombre: v })}
                    soloLectura={esLider}
                  />
                </td>
                <td className="border border-text-strong align-top">
                  <CeldaInput
                    valor={f.ciudad}
                    onChange={(v) => actualizarFila(i, { ciudad: v })}
                    soloLectura={esLider}
                  />
                </td>
                <td className="border border-text-strong align-top">
                  <CeldaInput
                    valor={f.edad}
                    onChange={(v) => actualizarFila(i, { edad: v })}
                    soloLectura={esLider}
                  />
                </td>
                <td className="border border-text-strong align-top">
                  <CeldaTextarea
                    valor={f.formacion}
                    onChange={(v) => actualizarFila(i, { formacion: v })}
                    soloLectura={esLider}
                  />
                </td>
                <td className="border border-text-strong align-top">
                  <CeldaTextarea
                    valor={f.experiencia}
                    onChange={(v) => actualizarFila(i, { experiencia: v })}
                    soloLectura={esLider}
                  />
                </td>
                <td className="border border-text-strong align-top">
                  <CeldaTextarea
                    valor={f.concepto}
                    onChange={(v) => actualizarFila(i, { concepto: v })}
                    soloLectura={esLider}
                  />
                </td>
                <td className="border border-text-strong align-top text-center print:hidden">
                  {!esLider && (
                    <button
                      onClick={() => eliminarFila(i)}
                      className="text-danger-700 hover:bg-danger-50 p-1 rounded transition-colors"
                      title="Eliminar fila"
                    >
                      <Trash2 size={12} strokeWidth={1.75} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!esLider && (
        <div className="flex justify-end print:hidden">
          <Button
            onClick={agregarFila}
            variant="neutral-secondary"
            icon={<Plus size={13} strokeWidth={1.75} />}
          >
            Agregar fila
          </Button>
        </div>
      )}
    </div>
  );
}

function DatoFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex border-t border-text-strong first:border-t-0">
      <div className="w-32 px-3 py-1.5 bg-slate-100 print:bg-white border-r border-text-strong font-bold text-[11px] uppercase tracking-wide">
        {label}
      </div>
      <div className="flex-1 px-3 py-1.5 text-[12px]">{valor || '—'}</div>
    </div>
  );
}

function CeldaInput({
  valor,
  onChange,
  soloLectura,
}: {
  valor: string;
  onChange: (v: string) => void;
  soloLectura?: boolean;
}) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      readOnly={soloLectura}
      className="w-full px-2 py-1.5 text-[11px] border-0 focus:bg-brand-50/40 focus:outline-none print:bg-transparent read-only:cursor-default read-only:focus:bg-transparent"
    />
  );
}

function CeldaTextarea({
  valor,
  onChange,
  soloLectura,
}: {
  valor: string;
  onChange: (v: string) => void;
  soloLectura?: boolean;
}) {
  return (
    <textarea
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      readOnly={soloLectura}
      className="w-full px-2 py-1.5 text-[11px] border-0 resize-none focus:bg-brand-50/40 focus:outline-none print:bg-transparent read-only:cursor-default read-only:focus:bg-transparent"
    />
  );
}
