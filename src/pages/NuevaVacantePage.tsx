import { Pill } from '../components/brand';
import { VacanteForm } from '../components/vacantes/VacanteForm';

/**
 * NuevaVacantePage · sistema brand.
 *
 * Wrapper con hero header hairline + meta breadcrumb pill + el form
 * en una sola columna ancha. El form maneja su propia estructura por
 * secciones.
 */
export default function NuevaVacantePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <div>
        <Pill tono="brand" dot>
          Paso 1 · Inicio / aval
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Nueva solicitud de vacante
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Completa la información del cargo, adjunta el aval firmado y propón
          una fecha de entrevista con el líder. GH revisará la solicitud antes
          de pasar al perfilamiento.
        </p>
      </div>
      <VacanteForm />
    </div>
  );
}
