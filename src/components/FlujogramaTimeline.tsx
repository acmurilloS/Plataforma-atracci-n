import { Link } from 'react-router-dom';
import { Badge, type BadgeVariant } from './ui';
import { cn } from '../utils/cn';
import type { VacanteDoc } from '../schemas';

interface PasoDef {
  numero: number;
  titulo: string;
  fase: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  rol: string;
  descripcion: string;
  rutaRelativa?: string;
  estadosCubiertos?: string[];
}

const PASOS: PasoDef[] = [
  {
    numero: 1,
    titulo: 'Solicitud de vacante',
    fase: 'A',
    rol: 'líder',
    descripcion: 'El líder abre la solicitud desde /vacantes/nueva.',
    estadosCubiertos: ['borrador', 'aprobada'],
  },
  {
    numero: 2,
    titulo: 'Revisión de aval y condiciones',
    fase: 'A',
    rol: 'gh',
    descripcion: 'GH revisa aval y salario en /aprobaciones-aval.',
    rutaRelativa: '/aprobaciones-aval',
    estadosCubiertos: ['borrador', 'aprobada'],
  },
  {
    numero: 3,
    titulo: 'Perfilamiento del cargo',
    fase: 'B',
    rol: 'analista + líder',
    descripcion: 'Analista captura criterios y pacta fecha de entrevista con líder.',
    rutaRelativa: ':id/perfilamiento',
    estadosCubiertos: ['aprobada', 'lista_para_publicar'],
  },
  {
    numero: 4,
    titulo: 'Publicación y divulgación',
    fase: 'B',
    rol: 'analista',
    descripcion: 'Analista activa la landing Equitel y publica en canales externos.',
    rutaRelativa: ':id/publicacion',
    estadosCubiertos: ['lista_para_publicar', 'publicada'],
  },
  {
    numero: 5,
    titulo: 'Reclutamiento de hojas de vida',
    fase: 'B',
    rol: 'analista',
    descripcion: 'Llegan CVs por la landing, Magneto, caja, referidos. Se listan candidatos.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['publicada', 'en_proceso'],
  },
  {
    numero: 6,
    titulo: 'Preentrevista',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Por cada candidato: cambia su estado a pre_entrevistado tras WhatsApp o llamada.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso'],
  },
  {
    numero: 7,
    titulo: 'Envío de pruebas psicológicas',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Abre el candidato en /postulaciones/:id → tab Pruebas → Enviar.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso'],
  },
  {
    numero: 8,
    titulo: 'Entrevista con analista',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Abre el candidato → tab Entrevistas → Agenda tipo "analista" y registra feedback.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso'],
  },
  {
    numero: 9,
    titulo: 'Validación de referencias',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Abre el candidato → tab Referencias → registra 2-3 y marca verificadas.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso'],
  },
  {
    numero: 10,
    titulo: 'Solicitud de documentos',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Abre el candidato → tab Documentos → carga HV, cédula, títulos, pase judicial.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso'],
  },
  {
    numero: 11,
    titulo: 'Realización del informe',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Abre el candidato → tab Informe → escribe resumen y recomendación.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso'],
  },
  {
    numero: 12,
    titulo: 'Envío del informe al líder',
    fase: 'C',
    rol: 'analista',
    descripcion: 'Desde el tab Informe → botón "Enviar al líder". Pasa a terna automáticamente.',
    rutaRelativa: ':id/postulaciones',
    estadosCubiertos: ['en_proceso', 'terna_enviada'],
  },
  {
    numero: 13,
    titulo: 'Citación a entrevista con el líder',
    fase: 'D',
    rol: 'analista + líder',
    descripcion: 'En el candidato → tab Entrevistas → Agenda tipo "líder" con la fecha del paso 3.',
    rutaRelativa: ':id/terna',
    estadosCubiertos: ['terna_enviada'],
  },
  {
    numero: 14,
    titulo: 'Feedback líder – analista (decisión)',
    fase: 'D',
    rol: 'líder',
    descripcion: 'En /terna el líder decide. Aprobar dispara exámenes médicos (paso 15).',
    rutaRelativa: ':id/terna',
    estadosCubiertos: ['terna_enviada', 'seleccionado'],
  },
  {
    numero: 15,
    titulo: 'Solicitud de exámenes médicos',
    fase: 'E',
    rol: 'gh',
    descripcion: 'Se crea automáticamente al aprobar al candidato. GH la ve en /examenes-medicos.',
    rutaRelativa: '/examenes-medicos',
    estadosCubiertos: ['seleccionado', 'en_contratacion'],
  },
  {
    numero: 16,
    titulo: 'Envío de exámenes al candidato',
    fase: 'E',
    rol: 'gh',
    descripcion: 'GH registra centro médico y la URL de la orden; notifica al candidato.',
    rutaRelativa: '/examenes-medicos',
    estadosCubiertos: ['en_contratacion'],
  },
  {
    numero: 17,
    titulo: 'Solicitud de concepto médico',
    fase: 'E',
    rol: 'gh',
    descripcion: 'Laboratorio envía concepto. GH lo registra como apto / no apto + recomendaciones.',
    rutaRelativa: '/examenes-medicos',
    estadosCubiertos: ['en_contratacion'],
  },
  {
    numero: 18,
    titulo: 'Organización de documentos',
    fase: 'E',
    rol: 'analista',
    descripcion: 'En /carpetas arma la carpeta digital con checklist de 6 items.',
    rutaRelativa: '/carpetas',
    estadosCubiertos: ['en_contratacion'],
  },
  {
    numero: 19,
    titulo: 'Entrega de carpeta',
    fase: 'E',
    rol: 'analista → gh',
    descripcion: 'Analista marca "Entregar a GH". GH revisa y aprueba (o pide correcciones).',
    rutaRelativa: '/carpetas',
    estadosCubiertos: ['en_contratacion'],
  },
  {
    numero: 20,
    titulo: 'Solicitud de procesos de conexión',
    fase: 'F',
    rol: 'analista + apoyo',
    descripcion: 'Al aprobar la carpeta se crean 5 tickets automáticos. Apoyo los resuelve en /tickets.',
    rutaRelativa: '/tickets',
    estadosCubiertos: ['en_contratacion', 'cerrada'],
  },
];

const FASE_LABEL: Record<PasoDef['fase'], string> = {
  A: 'Inicio / aval',
  B: 'Reclutamiento',
  C: 'Selección',
  D: 'Decisión',
  E: 'Ingreso',
  F: 'Vinculación',
};

const FASE_BADGE: Record<PasoDef['fase'], BadgeVariant> = {
  A: 'fase-a',
  B: 'fase-b',
  C: 'fase-c',
  D: 'fase-d',
  E: 'fase-e',
  F: 'fase-f',
};

interface Props {
  vacante?: VacanteDoc | null;
}

export function FlujogramaTimeline({ vacante }: Props) {
  function construirRuta(paso: PasoDef): string | null {
    if (!paso.rutaRelativa) return null;
    if (paso.rutaRelativa.startsWith('/')) return paso.rutaRelativa;
    if (!vacante) return null;
    return `/vacantes/${paso.rutaRelativa.replace(':id', vacante.id)}`;
  }

  function esPasoActivo(paso: PasoDef): boolean {
    if (!vacante) return false;
    return paso.estadosCubiertos?.includes(vacante.estado) ?? false;
  }

  function esPasoCompletado(paso: PasoDef): boolean {
    if (!vacante) return false;
    const orden = [
      'borrador',
      'aprobada',
      'lista_para_publicar',
      'publicada',
      'en_proceso',
      'terna_enviada',
      'seleccionado',
      'en_contratacion',
      'cerrada',
    ];
    const idxActual = orden.indexOf(vacante.estado);
    if (idxActual < 0) return false;
    const cubiertos = paso.estadosCubiertos ?? [];
    const idxUltimoCubierto = cubiertos
      .map((e) => orden.indexOf(e))
      .filter((n) => n >= 0)
      .reduce((max, n) => Math.max(max, n), -1);
    return idxActual > idxUltimoCubierto;
  }

  const grupos: Record<PasoDef['fase'], PasoDef[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
    E: [],
    F: [],
  };
  PASOS.forEach((p) => grupos[p.fase].push(p));

  return (
    <div className="space-y-5">
      {(Object.keys(grupos) as PasoDef['fase'][]).map((fase) => (
        <div key={fase}>
          <Badge variant={FASE_BADGE[fase]} size="md">
            Fase {fase} · {FASE_LABEL[fase]}
          </Badge>
          <ol className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            {grupos[fase].map((paso) => {
              const ruta = construirRuta(paso);
              const activo = esPasoActivo(paso);
              const completado = esPasoCompletado(paso);
              const contenido = (
                <div
                  className={cn(
                    'rounded-xl px-4 py-3 flex items-start gap-3 transition-all',
                    activo
                      ? 'bg-gold-50 shadow-ambient ring-1 ring-equitel-rojo-500/30'
                      : completado
                        ? 'bg-surface-lowest'
                        : 'bg-white ghost-border',
                    ruta && 'cursor-pointer hover:shadow-ambient hover:-translate-y-0.5',
                  )}
                >
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                      completado
                        ? 'bg-navy-900 text-white'
                        : activo
                          ? 'bg-equitel-rojo-600 text-white animate-pulse-ring'
                          : 'bg-navy-100 text-navy-600',
                    )}
                  >
                    {completado ? '✓' : paso.numero}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy-900">{paso.titulo}</p>
                    <p className="text-xs text-navy-600 mt-0.5 leading-snug">
                      {paso.descripcion}
                    </p>
                    <p className="text-[10px] text-navy-500 mt-1 uppercase tracking-wide font-semibold">
                      {paso.rol}
                      {ruta && ' · '}
                      {ruta && (
                        <span className="text-equitel-rojo-700 normal-case">abrir →</span>
                      )}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={paso.numero}>
                  {ruta ? <Link to={ruta}>{contenido}</Link> : contenido}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
