import { useState } from 'react';
import { EmpresasTab } from '../../components/admin/EmpresasTab';
import { SedesTab } from '../../components/admin/SedesTab';
import { UnidadesTab } from '../../components/admin/UnidadesTab';
import { CargosTab } from '../../components/admin/CargosTab';
import { SeedTab } from '../../components/admin/SeedTab';
import { cn } from '../../utils/cn';

const TABS = ['empresas', 'sedes', 'unidades', 'cargos', 'seed'] as const;
type Tab = (typeof TABS)[number];

export default function CatalogosAdminPage() {
  const [tab, setTab] = useState<Tab>('empresas');
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-navy-900">Catálogos</h1>
      <p className="text-sm text-navy-600 mt-1">
        Administra empresas, sedes, unidades y cargos del holding. Los cambios se reflejan en vivo
        en los formularios.
      </p>
      <div className="mt-6 border-b border-navy-100 flex gap-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'pb-3 text-sm font-medium capitalize transition',
              tab === t
                ? 'text-navy-900 border-b-2 border-gold-500'
                : 'text-navy-500 hover:text-navy-800',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'empresas' && <EmpresasTab />}
        {tab === 'sedes' && <SedesTab />}
        {tab === 'unidades' && <UnidadesTab />}
        {tab === 'cargos' && <CargosTab />}
        {tab === 'seed' && <SeedTab />}
      </div>
    </div>
  );
}
