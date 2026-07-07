import { FilePlus2 } from 'lucide-react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
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
      <EncabezadoPagina
        icono={<FilePlus2 size={26} strokeWidth={1.6} />}
        tono="brand"
        eyebrow="Paso 1 · Inicio / aval"
        titulo="Nueva solicitud de vacante"
        descripcion="Completa la información del cargo, adjunta el aval firmado y propón una fecha de entrevista con el líder. GH revisará la solicitud antes de pasar al perfilamiento."
      />
      <VacanteForm />
    </div>
  );
}
