import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FolderOpen,
  Send,
  Sparkles,
} from 'lucide-react';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';
import { Button, Card, Pill, type PillTono } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * CarpetasPage · sistema brand.
 *
 * Pasos 18-19 del flujograma:
 *  - Analista arma la carpeta digital del candidato apto médico.
 *  - GH la recibe, observa o aprueba.
 *  - Al aprobar: vacante a `cerrada` + tickets de conexión finales (paso 20).
 */

interface CarpetaDoc {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  vacante_id: string;
  estado: string;
  checklist: {
    hoja_vida: boolean;
    cedula: boolean;
    titulos: boolean;
    referencias_verificadas: boolean;
    concepto_medico: boolean;
    documentos_adicionales_completos: boolean;
  };
  documentos_ids: string[];
  entregada_en: Timestamp | null;
  aprobada_en: Timestamp | null;
  observaciones_gh: string | null;
  [k: string]: unknown;
}

interface PostApta {
  id: string;
  candidato_nombre: string;
  vacante_id: string;
  estado: string;
  [k: string]: unknown;
}

const ESTADO_TONO: Record<string, PillTono> = {
  armando: 'neutral',
  lista: 'info',
  entregada_gh: 'warning',
  observada: 'warning',
  aprobada: 'success',
};

const CHECKLIST_LABEL: Record<keyof CarpetaDoc['checklist'], string> = {
  hoja_vida: 'Hoja de vida',
  cedula: 'Cédula',
  titulos: 'Títulos académicos',
  referencias_verificadas: 'Referencias verificadas',
  concepto_medico: 'Concepto médico',
  documentos_adicionales_completos: 'Documentos adicionales',
};

export default function CarpetasPage() {
  const { docs: carpetas, cargando } = useColeccion<CarpetaDoc>('carpetas_digitales', {
    orden: ['creado_en', 'desc'],
  });
  const { docs: postulacionesAptas } = useColeccion<PostApta>('postulaciones', {
    filtros: [['estado', '==', 'apto_medico']],
  });
  const { crear, actualizar } = useMutacion();
  const { user } = useAuth();
  const [procesando, setProcesando] = useState<string | null>(null);

  async function crearCarpeta(p: PostApta) {
    setProcesando(p.id);
    await crear('carpetas_digitales', {
      postulacion_id: p.id,
      candidato_id: '',
      vacante_id: p.vacante_id,
      estado: 'armando',
      checklist: {
        hoja_vida: false,
        cedula: false,
        titulos: false,
        referencias_verificadas: false,
        concepto_medico: true,
        documentos_adicionales_completos: false,
      },
      documentos_ids: [],
      entregada_en: null,
      entregada_a_uid: null,
      observaciones_gh: null,
      aprobada_en: null,
    });
    setProcesando(null);
  }

  async function actualizarChecklist(
    c: CarpetaDoc,
    campo: keyof CarpetaDoc['checklist'],
    valor: boolean,
  ) {
    await actualizar('carpetas_digitales', c.id, { [`checklist.${campo}`]: valor });
  }

  async function entregar(c: CarpetaDoc) {
    await actualizar('carpetas_digitales', c.id, {
      estado: 'entregada_gh',
      entregada_en: Timestamp.now(),
      entregada_a_uid: user?.uid ?? null,
    });
    await actualizar('postulaciones', c.postulacion_id, {
      estado: 'carpeta_entregada',
      'marcas.carpeta_entregada_en': Timestamp.now(),
    });
  }

  async function aprobar(c: CarpetaDoc) {
    await actualizar('carpetas_digitales', c.id, {
      estado: 'aprobada',
      aprobada_en: Timestamp.now(),
    });
    await actualizar('postulaciones', c.postulacion_id, {
      estado: 'ingresado',
      'marcas.ingresado_en': Timestamp.now(),
    });
    await actualizar('vacantes', c.vacante_id, {
      estado: 'cerrada',
      cerrada_en: Timestamp.now(),
    });
    // dispara tickets de conexión básicos para el paso 20
    const areas = ['it', 'compras', 'bodega', 'contabilidad', 'talentos'];
    for (const area of areas) {
      await crear('tickets_conexion', {
        postulacion_id: c.postulacion_id,
        candidato_id: c.candidato_id,
        candidato_nombre: '',
        vacante_id: c.vacante_id,
        vacante_consecutivo: '',
        cargo_nombre: '',
        area,
        sub_area_detalle: null,
        tipo_disparo: 'final',
        titulo: `Ingreso - ${area}`,
        descripcion: `Ticket automático al cierre de carpeta para el área ${area}.`,
        requisitos: {},
        estado: 'abierto',
        asignado_a_uid: null,
        asignado_a_nombre: null,
        bloqueado_motivo: null,
        ans_horas_habiles: 24,
        ans_expira_en: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        resuelto_en: null,
        evidencia_url: null,
      });
    }
  }

  async function observar(c: CarpetaDoc, e: FormEvent) {
    e.preventDefault();
    const obs = window.prompt('Observaciones a corregir:');
    if (!obs) return;
    await actualizar('carpetas_digitales', c.id, {
      estado: 'observada',
      observaciones_gh: obs,
    });
  }

  const postSinCarpeta = postulacionesAptas.filter(
    (p) => !carpetas.some((c) => c.postulacion_id === p.id),
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Pasos 18 – 19 · Analista + GH
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Carpetas digitales
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Organiza los documentos del candidato apto y entrega la carpeta a GH. Al aprobarse,
          la vacante cierra automáticamente y se disparan los tickets finales del paso 20.
        </p>
      </div>

      {/* Aptos sin carpeta · alerta */}
      {postSinCarpeta.length > 0 && (
        <Card padding="lg" className="border-info-500/30 bg-info-50/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-info-100 text-info-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[15px] font-semibold text-text-strong">
                  Candidatos aptos sin carpeta
                </h2>
                <Pill tono="info">
                  <span className="tabular-nums">{postSinCarpeta.length}</span>
                </Pill>
              </div>
              <p className="text-[12px] text-text-muted mt-1">
                Estos candidatos ya pasaron exámenes médicos. Arma su carpeta digital para
                avanzar al paso 19.
              </p>
              <ul className="mt-4 divide-y divide-info-500/15">
                {postSinCarpeta.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    <span className="text-[13px] font-medium text-text-strong">
                      {p.candidato_nombre}
                    </span>
                    <Button
                      onClick={() => crearCarpeta(p)}
                      disabled={procesando === p.id}
                      loading={procesando === p.id}
                      variant="brand-primary"
                      size="small"
                      icon={<FolderOpen size={11} strokeWidth={1.75} />}
                    >
                      Armar carpeta
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

      {!cargando && carpetas.length === 0 && postSinCarpeta.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <p className="text-[14px] font-medium text-text-strong">Sin carpetas en proceso</p>
          <p className="text-[12px] text-text-muted mt-1">
            Cuando aparezca un candidato apto médico, podrás armar su carpeta acá.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {carpetas.map((c) => {
          const completos = Object.values(c.checklist).filter(Boolean).length;
          const total = Object.keys(c.checklist).length;
          const porcentaje = Math.round((completos / total) * 100);
          const tono = ESTADO_TONO[c.estado] ?? 'neutral';
          const bloqueado = c.estado === 'aprobada' || c.estado === 'entregada_gh';

          return (
            <Card key={c.id} padding="lg">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/postulaciones/${c.postulacion_id}`}
                    className="group inline-block"
                  >
                    <h3 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong group-hover:text-brand-700 transition-colors">
                      Postulación {c.postulacion_id.slice(0, 8)}
                    </h3>
                  </Link>
                  <p className="text-[12px] text-text-muted mt-1 inline-flex items-center gap-2 flex-wrap">
                    <span className="tabular-nums font-medium text-text-body">
                      {completos}/{total}
                    </span>
                    <span>items</span>
                    {c.entregada_en && (
                      <>
                        <span className="text-text-subtle">·</span>
                        <span className="tabular-nums">
                          entregada {formatearFecha(c.entregada_en.toDate())}
                        </span>
                      </>
                    )}
                    {c.aprobada_en && (
                      <>
                        <span className="text-text-subtle">·</span>
                        <span className="tabular-nums text-success-700 font-medium">
                          aprobada {formatearFecha(c.aprobada_en.toDate())}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Pill tono={tono} dot>
                  {c.estado.replace(/_/g, ' ')}
                </Pill>
              </div>

              {/* Progreso checklist */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2 text-[12px]">
                  <span className="text-text-muted tabular-nums">
                    <span className="font-semibold text-text-strong">{completos}</span> de{' '}
                    {total} verificados
                  </span>
                  <span
                    className={cn(
                      'font-bold tabular-nums',
                      porcentaje === 100 ? 'text-success-700' : 'text-brand-700',
                    )}
                  >
                    {porcentaje}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-300 ease-cult',
                      porcentaje === 100 ? 'bg-success-500' : 'bg-brand-600',
                    )}
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {(Object.keys(c.checklist) as Array<keyof CarpetaDoc['checklist']>).map((k) => (
                  <label
                    key={k}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 border transition-colors',
                      c.checklist[k]
                        ? 'border-success-500/30 bg-success-50/40'
                        : 'border-slate-200 bg-white',
                      bloqueado && 'cursor-not-allowed opacity-70',
                      !bloqueado && 'cursor-pointer hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={c.checklist[k]}
                      disabled={bloqueado}
                      onChange={(e) => actualizarChecklist(c, k, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-success-600 focus:ring-success-300/40"
                    />
                    <span
                      className={cn(
                        'text-[13px]',
                        c.checklist[k] ? 'text-text-strong font-medium' : 'text-text-body',
                      )}
                    >
                      {CHECKLIST_LABEL[k]}
                    </span>
                  </label>
                ))}
              </div>

              {c.observaciones_gh && (
                <div className="mt-4 rounded-md border border-warning-500/30 bg-warning-50/40 px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-warning-700">
                    GH observó
                  </p>
                  <p className="text-[12px] text-warning-700 mt-1 italic">
                    {c.observaciones_gh}
                  </p>
                </div>
              )}

              <div className="flex gap-2 justify-end flex-wrap mt-5 pt-4 border-t border-slate-100">
                {c.estado === 'armando' && (
                  <Button
                    onClick={() => actualizar('carpetas_digitales', c.id, { estado: 'lista' })}
                    variant="neutral-secondary"
                    size="medium"
                    icon={<ClipboardCheck size={13} strokeWidth={1.75} />}
                  >
                    Marcar lista
                  </Button>
                )}
                {c.estado === 'lista' && (
                  <Button
                    onClick={() => entregar(c)}
                    variant="brand-primary"
                    size="medium"
                    icon={<Send size={13} strokeWidth={1.75} />}
                  >
                    Entregar a GH · paso 19
                  </Button>
                )}
                {c.estado === 'entregada_gh' && (
                  <>
                    <Button
                      onClick={(e) => observar(c, e)}
                      variant="destructive-secondary"
                      size="medium"
                      icon={<AlertTriangle size={13} strokeWidth={1.75} />}
                    >
                      Observar
                    </Button>
                    <Button
                      onClick={() => aprobar(c)}
                      variant="brand-primary"
                      size="medium"
                      icon={<Sparkles size={13} strokeWidth={1.75} />}
                    >
                      Aprobar y disparar tickets · paso 20
                    </Button>
                  </>
                )}
                {c.estado === 'aprobada' && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
                    <CheckCircle2 size={13} strokeWidth={1.75} />
                    Ingreso completo · vacante cerrada
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
