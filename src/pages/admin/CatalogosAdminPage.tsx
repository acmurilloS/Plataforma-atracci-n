import { useState } from 'react';
import { Building2, MapPin, Layers, Briefcase, Database, Users2 } from 'lucide-react';
import { EmpresasTab } from '../../components/admin/EmpresasTab';
import { SedesTab } from '../../components/admin/SedesTab';
import { UnidadesTab } from '../../components/admin/UnidadesTab';
import { CargosTab } from '../../components/admin/CargosTab';
import { SeedTab } from '../../components/admin/SeedTab';
import { ReferidosTab } from '../../components/admin/ReferidosTab';
import { Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * CatalogosAdminPage · sistema brand.
 *
 * 5 tabs (empresas, sedes, unidades, cargos, seed) con underline brand-600
 * y icono dedicado por tab para escaneo rápido.
 */

const TABS = [
  { key: 'empresas', label: 'Empresas', icono: Building2 },
  { key: 'sedes', label: 'Sedes', icono: MapPin },
  { key: 'unidades', label: 'Unidades', icono: Layers },
  { key: 'cargos', label: 'Cargos', icono: Briefcase },
  { key: 'referidos', label: 'Referidos', icono: Users2 },
  { key: 'seed', label: 'Seed', icono: Database },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function CatalogosAdminPage() {
  const [tab, setTab] = useState<Tab>('empresas');

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      {/* Hero */}
      <div>
        <Pill tono="brand" dot>
          Admin · catálogos
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Catálogos
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          Administra empresas, sedes, unidades y cargos del holding. Los cambios se reflejan en
          vivo en los formularios de creación de vacante.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const Ico = t.icono;
          const activo = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors -mb-px shrink-0',
                activo
                  ? 'text-brand-700 border-b-2 border-brand-600'
                  : 'text-text-muted border-b-2 border-transparent hover:text-text-strong',
              )}
            >
              <Ico size={14} strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === 'empresas' && <EmpresasTab />}
        {tab === 'sedes' && <SedesTab />}
        {tab === 'unidades' && <UnidadesTab />}
        {tab === 'cargos' && <CargosTab />}
        {tab === 'referidos' && <ReferidosTab />}
        {tab === 'seed' && <SeedTab />}
      </div>
    </div>
  );
}
