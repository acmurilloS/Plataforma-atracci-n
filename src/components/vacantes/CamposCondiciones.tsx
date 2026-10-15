import type { ReactNode } from 'react';
import { formatearCOP, soloDigitos } from '../../utils/moneda';
import { RODAMIENTO_FIJOS, RODAMIENTO_OPCIONES } from '../../utils/rodamiento';
import {
  COMISION_TIPOS,
  COMISION_TIPO_LABEL,
  etiquetaBaseComision,
  type ComisionTipo,
} from '../../utils/comisiones';
import type { CondicionesForm } from '../../utils/condicionesForm';

/**
 * Campos de CONDICIONES de una vacante ya creada: salario, comisiones,
 * garantizado, rodamiento, horario y contrato. Los usan "Editar condiciones"
 * (coordinación) y "Corregir y reenviar" (el líder tras una devolución de GH,
 * reu 08-oct). Controlado: el padre guarda el estado (`condicionesDesdeVacante`)
 * y valida con `validarCondiciones` (src/utils/condicionesForm.ts).
 */

const campoClass =
  'mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 disabled:bg-slate-50';

interface Props {
  form: CondicionesForm;
  onChange: (cambio: Partial<CondicionesForm>) => void;
  disabled?: boolean;
}

function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">{children}</span>
  );
}

export function CamposCondiciones({ form, onChange, disabled }: Props) {
  const hayComision = form.comision_tipo !== '' && form.comision_tipo !== 'ninguna';

  return (
    <div className="space-y-3.5">
      <label className="block">
        <Etiqueta>Salario base</Etiqueta>
        <input
          inputMode="numeric"
          value={form.salario_base ? formatearCOP(Number(form.salario_base)) : ''}
          onChange={(e) => onChange({ salario_base: soloDigitos(e.target.value) })}
          disabled={disabled}
          placeholder="$ 0"
          className={campoClass}
        />
      </label>

      <label className="block">
        <Etiqueta>Comisiones</Etiqueta>
        <select
          value={form.comision_tipo}
          onChange={(e) => onChange({ comision_tipo: e.target.value as ComisionTipo | '' })}
          disabled={disabled}
          className={campoClass}
        >
          {form.comision_tipo === '' && <option value="">Sin clasificar (vacante anterior)</option>}
          {COMISION_TIPOS.map((t) => (
            <option key={t} value={t}>
              {COMISION_TIPO_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      {form.comision_tipo !== 'ninguna' && (
        <>
          {hayComision && (
            <>
              <label className="block">
                <Etiqueta>{etiquetaBaseComision(form.comision_tipo as ComisionTipo)}</Etiqueta>
                <textarea
                  value={form.comision_base}
                  onChange={(e) => onChange({ comision_base: e.target.value })}
                  disabled={disabled}
                  rows={2}
                  placeholder="Cuál presupuesto o cuáles indicadores"
                  className={`${campoClass} resize-none`}
                />
              </label>
              <label className="block">
                <Etiqueta>Cómo se mide y se paga</Etiqueta>
                <textarea
                  value={form.comision_medicion}
                  onChange={(e) => onChange({ comision_medicion: e.target.value })}
                  disabled={disabled}
                  rows={2}
                  placeholder="% sobre lo vendido, periodicidad, tabla por rangos…"
                  className={`${campoClass} resize-none`}
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.comision_aplica_bolsa}
                  onChange={(e) => onChange({ comision_aplica_bolsa: e.target.checked })}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
                />
                <span className="text-[13px] text-text-strong">Aplica bolsa</span>
              </label>
              {form.comision_aplica_bolsa && (
                <input
                  value={form.comision_bolsa_detalle}
                  onChange={(e) => onChange({ comision_bolsa_detalle: e.target.value })}
                  disabled={disabled}
                  placeholder="Detalle de la bolsa"
                  className={campoClass}
                />
              )}
            </>
          )}
          <label className="block">
            <Etiqueta>Concepto para el candidato</Etiqueta>
            <input
              value={form.comisiones_texto}
              onChange={(e) => onChange({ comisiones_texto: e.target.value })}
              disabled={disabled}
              placeholder="Ej.: 3% sobre ventas · vacío = No aplica"
              className={campoClass}
            />
          </label>
        </>
      )}

      <label className="block">
        <Etiqueta>Garantizado</Etiqueta>
        <textarea
          value={form.garantizado_texto}
          onChange={(e) => onChange({ garantizado_texto: e.target.value })}
          disabled={disabled}
          rows={2}
          placeholder="Monto, duración y condiciones · vacío = No aplica"
          className={`${campoClass} resize-none`}
        />
      </label>

      <label className="block">
        <Etiqueta>Auxilio de rodamiento</Etiqueta>
        <select
          value={
            form.rodamiento_otro
              ? '__otro__'
              : RODAMIENTO_FIJOS.has(form.rodamiento_valor)
                ? form.rodamiento_valor
                : ''
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__otro__') onChange({ rodamiento_otro: true, rodamiento_valor: '' });
            else onChange({ rodamiento_otro: false, rodamiento_valor: v });
          }}
          disabled={disabled}
          className={campoClass}
        >
          <option value="">Selecciona…</option>
          {RODAMIENTO_OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
          <option value="__otro__">Otro valor…</option>
        </select>
        {form.rodamiento_otro && (
          <input
            value={form.rodamiento_valor}
            onChange={(e) => onChange({ rodamiento_valor: e.target.value })}
            disabled={disabled}
            placeholder="Escribe el valor del rodamiento"
            className={`${campoClass} mt-2`}
          />
        )}
      </label>

      <label className="block">
        <Etiqueta>Horario laboral</Etiqueta>
        <input
          value={form.horario_laboral}
          onChange={(e) => onChange({ horario_laboral: e.target.value })}
          disabled={disabled}
          placeholder="L–V 8:00–17:00"
          className={campoClass}
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <Etiqueta>Tipo de contrato</Etiqueta>
          <select
            value={form.tipo_contrato}
            onChange={(e) =>
              onChange({ tipo_contrato: e.target.value as CondicionesForm['tipo_contrato'] })
            }
            disabled={disabled}
            className={campoClass}
          >
            {form.tipo_contrato === '' && <option value="">Sin registrar (vacante anterior)</option>}
            <option value="indefinido">Indefinido</option>
            <option value="temporal">Temporal</option>
          </select>
        </label>
        {form.tipo_contrato === 'temporal' && (
          <label className="block">
            <Etiqueta>Tiempo del contrato</Etiqueta>
            <input
              value={form.tiempo_contrato}
              onChange={(e) => onChange({ tiempo_contrato: e.target.value })}
              disabled={disabled}
              placeholder="6 meses / 1 año"
              className={campoClass}
            />
          </label>
        )}
      </div>
    </div>
  );
}
