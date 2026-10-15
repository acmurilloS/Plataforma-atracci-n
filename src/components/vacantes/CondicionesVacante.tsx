import { Pill, type PillTono } from '../brand';
import { formatearCOP } from '../../utils/moneda';
import { textoRodamiento } from '../../utils/rodamiento';
import { textoComisiones } from '../../utils/comisiones';
import { desgloseGarantizado } from '../../utils/garantizado';
import { motivosAval } from '../../utils/avalSolicitud';
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

  // Sin tipo de contrato = solicitud de antes del 19-ago, cuando el formulario no
  // lo pedía (reu 08-oct: Diego las veía "sin contrato"). Coordinación lo completa
  // desde "Editar condiciones".
  const contrato = v.tipo_contrato ? (
    `${v.tipo_contrato === 'temporal' ? 'Temporal' : 'Indefinido'}${
      v.tiempo_contrato?.trim() ? ` · ${v.tiempo_contrato.trim()}` : ''
    }`
  ) : (
    <span
      className="text-warning-700"
      title="Solicitud anterior al 19-ago, cuando el formulario aún no pedía el tipo de contrato. Coordinación puede completarlo en «Editar condiciones»."
    >
      Sin registrar
    </span>
  );

  // Garantizado desglosado (reu 08-oct): total = básico + no prestacional.
  const desglose = desgloseGarantizado(v);
  const obsGarantizado = v.garantizado_texto?.trim() ?? '';
  const garantizado = desglose ? (
    <div className="space-y-0.5">
      <p>
        Total mes <span className="tabular-nums">{formatearCOP(desglose.total)}</span>
        {desglose.duracion ? ` · ${desglose.duracion}` : ''}
      </p>
      <p className="text-[12px] font-normal text-text-muted">
        Básico <span className="tabular-nums">{formatearCOP(desglose.basico)}</span> + no
        prestacional{' '}
        <span className="tabular-nums font-medium text-text-strong">
          {formatearCOP(desglose.diferencia)}
        </span>
      </p>
      {obsGarantizado && <p className="text-[12px] font-normal text-text-body">{obsGarantizado}</p>}
    </div>
  ) : (
    obsGarantizado || 'No aplica'
  );

  // Reemplazo (reu 08-oct): cargo de quien sale y si cambia algo frente a él.
  const motivos = motivosAval(v);
  const cambiaCargo = motivos.includes('cambio_cargo');
  const cambianCondiciones = motivos.includes('cambio_condiciones');
  const tieneDatosReemplazo = !!v.reemplaza_a_cargo_id || v.reemplazo_mismas_condiciones != null;
  const reemplazaA = [v.reemplaza_a_nombre?.trim() || 'Sin registrar', v.reemplaza_a_cargo_nombre?.trim()]
    .filter(Boolean)
    .join(' · ');

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
      {/* Tipo · presupuesto/indicadores · medición · bolsa · concepto (reu 16-sep). */}
      <Dato
        variante={variante}
        label="Comisiones"
        valor={textoComisiones(v)}
        ancho="md:col-span-2"
        preserveBreaks
      />
      <Dato
        variante={variante}
        label="Garantizado"
        valor={garantizado}
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
            <Dato variante={variante} label="Reemplaza a" valor={reemplazaA} />
          )}
          {v.tipo_solicitud === 'reemplazo_indefinido' && tieneDatosReemplazo && (
            <Dato
              variante={variante}
              label="Frente a quien sale"
              valor={
                cambiaCargo || cambianCondiciones ? (
                  <Pill tono="warning" dot>
                    <span className="whitespace-nowrap">
                      {[cambiaCargo && 'Cambia el cargo', cambianCondiciones && 'Cambian condiciones']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Pill>
                ) : (
                  'Mismo cargo y condiciones'
                )
              }
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
