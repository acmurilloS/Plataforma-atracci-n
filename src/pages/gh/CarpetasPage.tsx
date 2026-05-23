import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useAuth } from '../../hooks/useAuth';
import { formatearFecha } from '../../utils/fechas';

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

  async function actualizarChecklist(c: CarpetaDoc, campo: keyof CarpetaDoc['checklist'], valor: boolean) {
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
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold-700">Pasos 18-19 · Analista + GH</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">Carpetas digitales</h1>
        <p className="text-sm text-navy-600 mt-1">
          Organiza los documentos del candidato y entrega la carpeta a GH.
        </p>
      </div>

      {postSinCarpeta.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="font-semibold text-blue-900 mb-2">
            Candidatos aptos sin carpeta ({postSinCarpeta.length})
          </h2>
          <ul className="text-sm space-y-1">
            {postSinCarpeta.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.candidato_nombre}</span>
                <button
                  onClick={() => crearCarpeta(p)}
                  disabled={procesando === p.id}
                  className="text-xs text-blue-700 hover:underline"
                >
                  Armar carpeta →
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}

      <div className="space-y-3">
        {carpetas.map((c) => {
          const completos = Object.values(c.checklist).filter(Boolean).length;
          const total = Object.keys(c.checklist).length;
          return (
            <div key={c.id} className="rounded-xl border border-navy-100 bg-white p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <Link to={`/postulaciones/${c.postulacion_id}`} className="hover:underline">
                    <h3 className="font-display text-lg font-semibold text-navy-900">
                      Postulación {c.postulacion_id.slice(0, 8)}
                    </h3>
                  </Link>
                  <p className="text-xs text-navy-600">
                    {completos}/{total} items · {c.estado}
                    {c.entregada_en && ` · entregada ${formatearFecha(c.entregada_en.toDate())}`}
                  </p>
                </div>
                <span className="rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-xs">{c.estado}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {(Object.keys(c.checklist) as Array<keyof CarpetaDoc['checklist']>).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.checklist[k]}
                      disabled={c.estado === 'aprobada' || c.estado === 'entregada_gh'}
                      onChange={(e) => actualizarChecklist(c, k, e.target.checked)}
                    />
                    <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
              {c.observaciones_gh && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  GH observó: {c.observaciones_gh}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                {c.estado === 'armando' && (
                  <button
                    onClick={() => actualizar('carpetas_digitales', c.id, { estado: 'lista' })}
                    className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-cream-100"
                  >
                    Marcar lista
                  </button>
                )}
                {c.estado === 'lista' && (
                  <button
                    onClick={() => entregar(c)}
                    className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800"
                  >
                    Entregar a GH (paso 19)
                  </button>
                )}
                {c.estado === 'entregada_gh' && (
                  <>
                    <button
                      onClick={(e) => observar(c, e)}
                      className="rounded-md border border-amber-300 text-amber-700 px-3 py-1.5 text-xs font-medium hover:bg-amber-50"
                    >
                      Observar
                    </button>
                    <button
                      onClick={() => aprobar(c)}
                      className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
                    >
                      Aprobar y disparar tickets (paso 20)
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
