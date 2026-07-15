import { useState } from 'react';
import {
  Building2,
  MapPin,
  Layers,
  Briefcase,
  Database,
  Users2,
  Cloud,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { EmpresasTab } from '../../components/admin/EmpresasTab';
import { SedesTab } from '../../components/admin/SedesTab';
import { UnidadesTab } from '../../components/admin/UnidadesTab';
import { CargosTab } from '../../components/admin/CargosTab';
import { SeedTab } from '../../components/admin/SeedTab';
import { ReferidosTab } from '../../components/admin/ReferidosTab';
import { IntegracionesTab } from '../../components/admin/IntegracionesTab';
import { EncabezadoPagina } from '../../components/ui/EncabezadoPagina';
import { cn } from '../../utils/cn';

/**
 * CatalogosAdminPage · sistema brand.
 *
 * 7 tabs con underline brand-600 e icono dedicado por tab. Las pestañas de
 * datos del holding (empresas, sedes, unidades, cargos) las ve cualquiera con
 * acceso a esta página; Seed, Integraciones y Referidos son SOLO para admin
 * pleno (`soloAdmin`) — un usuario que entra por el permiso 'catalogos'
 * (p.ej. Karen coordinadora) no las ve.
 */

type Tab = 'empresas' | 'sedes' | 'unidades' | 'cargos' | 'referidos' | 'integraciones' | 'seed';

const TABS: { key: Tab; label: string; icono: LucideIcon; soloAdmin?: boolean }[] = [
  { key: 'empresas', label: 'Empresas', icono: Building2 },
  { key: 'sedes', label: 'Sedes', icono: MapPin },
  { key: 'unidades', label: 'Unidades', icono: Layers },
  { key: 'cargos', label: 'Cargos', icono: Briefcase },
  { key: 'referidos', label: 'Referidos', icono: Users2, soloAdmin: true },
  { key: 'integraciones', label: 'Integraciones', icono: Cloud, soloAdmin: true },
  { key: 'seed', label: 'Seed', icono: Database, soloAdmin: true },
];

export default function CatalogosAdminPage() {
  const { rol } = useAuth();
  const esAdmin = rol === 'admin';
  const tabsVisibles = TABS.filter((t) => esAdmin || !t.soloAdmin);
  const [tab, setTab] = useState<Tab>('empresas');

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      <EncabezadoPagina
        icono={<Layers size={26} strokeWidth={1.6} />}
        tono="brand"
        eyebrow="Admin · catálogos"
        titulo="Catálogos"
        descripcion="Administra empresas, sedes, unidades y cargos del holding. Los cambios se reflejan en vivo en los formularios de creación de vacante."
      />

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {tabsVisibles.map((t) => {
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
        {/* Solo admin pleno — el permiso 'catalogos' no da acceso a estas. */}
        {tab === 'referidos' && esAdmin && <ReferidosTab />}
        {tab === 'integraciones' && esAdmin && <IntegracionesTab />}
        {tab === 'seed' && esAdmin && <SeedTab />}
      </div>
    </div>
  );
}
