import { PageHeader } from '../components/ui';
import { VacanteForm } from '../components/vacantes/VacanteForm';

export default function NuevaVacantePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <PageHeader
          eyebrow="Paso 1 · Inicio / aval"
          titulo="Nueva solicitud de vacante"
          descripcion="Completa la información del cargo, adjunta el aval firmado y propón una fecha de entrevista con el líder."
        />
      </div>
      <VacanteForm />
    </div>
  );
}
