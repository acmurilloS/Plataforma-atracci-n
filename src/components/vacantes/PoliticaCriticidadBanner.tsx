import { Flame, AlertTriangle, Leaf, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { politicaParaCriticidad, pasosOpcionalesParaCriticidad } from '../../schemas';
import type { Criticidad } from '../../schemas';

interface Props {
  criticidad: Criticidad;
  compacto?: boolean;
}

/**
 * Banner que comunica al analista qué política de flujo aplica a la vacante.
 *
 * En Alta: tono "ojo, esto es crítico, todo el flujo aplica".
 * En Baja: tono "flujo simplificado, puedes saltar pasos".
 * En Media: intermedio.
 *
 * Pedido por Cristina: que sea visible para que el equipo distinga sin
 * pensar a qué velocidad/profundidad va cada vacante.
 */
export function PoliticaCriticidadBanner({ criticidad, compacto = false }: Props) {
  const politica = politicaParaCriticidad(criticidad);
  const opcionales = pasosOpcionalesParaCriticidad(criticidad);
  const [expandido, setExpandido] = useState(false);

  const estilos = {
    rojo: {
      caja: 'border-red-300 bg-red-50',
      icono: 'text-red-700',
      titulo: 'text-red-900',
      descripcion: 'text-red-800',
    },
    ambar: {
      caja: 'border-amber-300 bg-amber-50',
      icono: 'text-amber-700',
      titulo: 'text-amber-900',
      descripcion: 'text-amber-800',
    },
    verde: {
      caja: 'border-emerald-300 bg-emerald-50',
      icono: 'text-emerald-700',
      titulo: 'text-emerald-900',
      descripcion: 'text-emerald-800',
    },
  }[politica.color];

  const Icono = politica.color === 'rojo' ? Flame : politica.color === 'ambar' ? AlertTriangle : Leaf;

  if (compacto) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${estilos.caja} ${estilos.titulo}`}
      >
        <Icono size={12} className={estilos.icono} />
        {politica.etiqueta}
      </span>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${estilos.caja}`}>
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full text-left flex items-start justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <Icono size={20} className={`${estilos.icono} mt-0.5`} />
          <div>
            <p className={`font-semibold text-sm ${estilos.titulo}`}>
              {politica.etiqueta} · criticidad {politica.nivel}
            </p>
            <p className={`text-xs mt-1 ${estilos.descripcion}`}>{politica.descripcion}</p>
          </div>
        </div>
        {expandido ? (
          <ChevronUp size={16} className={estilos.icono} />
        ) : (
          <ChevronDown size={16} className={estilos.icono} />
        )}
      </button>

      {expandido && (
        <div className={`mt-3 pt-3 border-t border-current/20 text-xs ${estilos.descripcion} space-y-2`}>
          <div className="grid grid-cols-2 gap-2">
            <Dato label="Mín. integrantes en terna" valor={String(politica.min_candidatos_terna)} />
            <Dato
              label="Sugerencia analista"
              valor={`${politica.candidatos_terna_sugeridos} integrantes`}
            />
            <Dato label="Mín. referencias" valor={String(politica.min_referencias)} />
            <Dato label="Meta ciclo total" valor={`${politica.meta_dias_habiles_total} días hábiles`} />
          </div>

          {opcionales.length > 0 ? (
            <div className="mt-2">
              <p className="font-semibold uppercase tracking-widest text-[10px] mb-1">
                Pasos opcionales en este flujo
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {opcionales.map((o) => (
                  <li key={o.paso}>
                    <span className="font-medium">{o.paso}:</span> {o.cuando}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] italic">
              Todos los pasos del flujograma son obligatorios. Pruebas, referencias, informe y
              debida diligencia se exigen antes de avanzar a terna.
            </p>
          )}

          <p className="text-[10px] opacity-70 mt-2">
            La matriz formal de criticidad por cargo está pendiente de GH (ATR-21). Hoy la
            criticidad la fija el líder al crear la vacante.
          </p>
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="font-semibold">{valor}</p>
    </div>
  );
}
