import { Pill, type PillTono } from '../brand';
import { formatearCOP } from '../../utils/moneda';
import { textoRodamiento } from '../../utils/rodamiento';
import { cn } from '../../utils/cn';
import { TIPO_SOLICITUD_LABEL, type VacanteDoc } from '../../schemas';

/**
 * CondicionesVacante · reu Karen 16-sep. Diego (Cultura y Desarrollo, rol gh)
 * valida las condiciones de cada solicitud y no veía el VALOR del rodamiento, a
 * quién reemplaza ni el garantizado: cada pantalla pintaba un subconjunto
 * distinto. Este bloque es la única fuente de "condiciones" y se usa en la
 * tarjeta de Aprobaciones (GH) y en el detalle de la vacante (coordinación).
 *
 * - `variante="tarjeta"`: cajas con fondo (Aprobaciones). `"plana"`: dt/dd sin
 *   caja, como el resto del detalle.
 * - `incluirTipoSolicitud`: tipo + "Reemplaza a" / duración. En el detalle ya
 *   van en "Empresa y cargo", así que ahí se omite.
 * - Filas: salario · banda · rodamiento · contrato | comisiones (½) · garantizado (½)
 *   | horario · tipo · reemplaza/duración. Comisiones y garantizado son textareas
 *   multilínea del líder: van anchos y con sus saltos de línea.
 */

interface Props {
  vacante: VacanteDoc;
  variante?: 'tarjeta' | 'plana';
  incluirTipoSolicitud?: boolean;
}

export function CondicionesVacante({ vacante: v, variante = 'tarjeta', incluirTipoSolicitud }: Props) {
  const bandaTono: PillTono = v.en_banda === null ? 'warning' : v.en_banda ? 'success' : 'danger';
  const bandaLabel =
    v.en_banda === null ? 'Sin banda definida' : v.en_banda ? 'En banda' : 'Fuera de banda';

  const contrato = v.tipo_contrato
    ? `${v.tipo_contrato === 'temporal' ? 'Temporal' : 'Indefinido'}${
        v.tiempo_contrato?.trim() ? ` · ${v.tiempo_contrato.trim()}` : ''
      }`
    : '—';

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
        variante === 'tarjeta' ? 'gap-3' : 'gap-x-6 gap-y-5',
      )}
    >
      <Dato variante={variante} label="Salario base" valor={formatearCOP(v.salario_base)} hero />
      <Dato
        variante={variante}
        label="Banda salarial"
        valor={
          <Pill tono={bandaTono} dot>
            <span className="whitespace-nowrap">{bandaLabel}</span>
          </Pill>
        }
      />
      <Dato variante={variante} label="Rodamiento" valor={textoRodamiento(v)} />
      <Dato variante={variante} label="Contrato" valor={contrato} />
      <Dato
        variante={variante}
        label="Comisiones"
        valor={v.comisiones_texto?.trim() || 'No aplica'}
        ancho="md:col-span-2"
        preserveBreaks
      />
      <Dato
        variante={variante}
        label="Garantizado"
        valor={v.garantizado_texto?.trim() || 'No aplica'}
        ancho="md:col-span-2"
        preserveBreaks
      />
      <Dato variante={variante} label="Horario" valor={v.horario_laboral?.trim() || '—'} />
      {incluirTipoSolicitud && (
        <>
          <Dato
            variante={variante}
            label="Tipo de solicitud"
            valor={TIPO_SOLICITUD_LABEL[v.tipo_solicitud] ?? v.tipo_solicitud}
          />
          {v.tipo_solicitud === 'reemplazo_indefinido' && (
            <Dato
              variante={variante}
              label="Reemplaza a"
              valor={v.reemplaza_a_nombre?.trim() || 'Sin registrar'}
            />
          )}
          {v.tipo_solicitud === 'necesidad_temporal' && (
            <Dato
              variante={variante}
              label="Duración estimada"
              valor={
                v.temporalidad_meses != null
                  ? `${v.temporalidad_meses} mes${v.temporalidad_meses === 1 ? '' : 'es'}`
                  : 'Sin registrar'
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function Dato({
  variante,
  label,
  valor,
  hero,
  ancho,
  preserveBreaks,
}: {
  variante: 'tarjeta' | 'plana';
  label: string;
  valor: React.ReactNode;
  hero?: boolean;
  ancho?: string;
  preserveBreaks?: boolean;
}) {
  return (
    <div
      className={cn(
        variante === 'tarjeta' && 'rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5',
        ancho,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-subtle">{label}</p>
      <div
        className={cn(
          'text-text-strong',
          variante === 'tarjeta' ? 'mt-1' : 'mt-1.5',
          hero
            ? variante === 'tarjeta'
              ? 'text-[18px] font-light tracking-[-0.02em] tabular-nums'
              : 'text-[22px] font-light tracking-[-0.02em] tabular-nums'
            : variante === 'tarjeta'
              ? 'text-[13px] font-medium'
              : 'text-[14px] font-medium',
          preserveBreaks && 'whitespace-pre-line break-words',
        )}
      >
        {valor}
      </div>
    </div>
  );
}
