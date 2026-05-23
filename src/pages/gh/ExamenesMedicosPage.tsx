import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { formatearFecha } from '../../utils/fechas';

interface ExamenDoc {
  id: string;
  postulacion_id: string;
  candidato_id: string;
  vacante_id: string;
  solicitada_en: Timestamp;
  enviada_al_candidato_en: Timestamp | null;
  centro_medico: string | null;
  concepto_recibido_en: Timestamp | null;
  concepto_url: string | null;
  apto: boolean | null;
  recomendaciones: string | null;
  estado: string;
  [k: string]: unknown;
}

export default function ExamenesMedicosPage() {
  const { docs, cargando } = useColeccion<ExamenDoc>('examenes_medicos', {
    orden: ['solicitada_en', 'desc'],
  });
  const { actualizar } = useMutacion();
  const [procesando, setProcesando] = useState<string | null>(null);

  async function enviar(ex: ExamenDoc) {
    const centro = window.prompt('Centro médico:', 'Colsanitas') ?? 'Colsanitas';
    const url = window.prompt('URL de la orden médica:') ?? '';
    setProcesando(ex.id);
    await actualizar('examenes_medicos', ex.id, {
      centro_medico: centro,
      orden_url: url,
      enviada_al_candidato_en: Timestamp.now(),
      estado: 'enviada',
    });
    setProcesando(null);
  }

  async function registrarConcepto(ex: ExamenDoc) {
    const apto = window.confirm('¿Apto? OK = sí');
    const recomendaciones = window.prompt('Recomendaciones:') ?? '';
    const url = window.prompt('URL del concepto:') ?? '';
    setProcesando(ex.id);
    await actualizar('examenes_medicos', ex.id, {
      concepto_recibido_en: Timestamp.now(),
      concepto_url: url,
      apto,
      recomendaciones,
      estado: apto ? 'apto' : 'no_apto',
    });
    const ahora = Timestamp.now();
    await actualizar('postulaciones', ex.postulacion_id, {
      estado: apto ? 'en_contratacion' : 'descartado_examenes_medicos',
      ultima_transicion_estado: ahora,
      [`marcas.${apto ? 'apto_medico_en' : 'descartado_examenes_medicos_en'}`]: ahora,
    });
    if (apto) {
      await actualizar('vacantes', ex.vacante_id, { estado: 'en_contratacion' });
    }
    setProcesando(null);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold-700">Pasos 15-17 · GH</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">Exámenes médicos</h1>
        <p className="text-sm text-navy-600 mt-1">
          Orden, envío al candidato y registro del concepto médico.
        </p>
      </div>

      {cargando && <p className="text-sm text-navy-500">Cargando…</p>}
      {!cargando && docs.length === 0 && (
        <p className="text-sm text-navy-500">Sin exámenes pendientes.</p>
      )}

      <div className="space-y-3">
        {docs.map((ex) => (
          <div key={ex.id} className="rounded-xl border border-navy-100 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-navy-500">examen {ex.id.slice(0, 8)}</p>
                <h3 className="font-display text-lg font-semibold text-navy-900">
                  <Link to={`/postulaciones/${ex.postulacion_id}`} className="hover:underline">
                    Candidato de postulación {ex.postulacion_id.slice(0, 8)}
                  </Link>
                </h3>
                <p className="text-xs text-navy-600 mt-1">
                  Solicitada {formatearFecha(ex.solicitada_en.toDate())}
                  {ex.enviada_al_candidato_en &&
                    ` · enviada ${formatearFecha(ex.enviada_al_candidato_en.toDate())}`}
                  {ex.centro_medico && ` · ${ex.centro_medico}`}
                </p>
              </div>
              <span className="rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-xs">
                {ex.estado}
              </span>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              {ex.estado === 'solicitada' && (
                <button
                  onClick={() => enviar(ex)}
                  disabled={procesando === ex.id}
                  className="rounded-md border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-cream-100"
                >
                  Enviar al candidato (paso 16)
                </button>
              )}
              {ex.estado === 'enviada' && (
                <button
                  onClick={() => registrarConcepto(ex)}
                  disabled={procesando === ex.id}
                  className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-navy-800"
                >
                  Registrar concepto (paso 17)
                </button>
              )}
              {(ex.estado === 'apto' || ex.estado === 'no_apto') && ex.concepto_url && (
                <a
                  href={ex.concepto_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gold-700 hover:underline"
                >
                  Ver concepto ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
