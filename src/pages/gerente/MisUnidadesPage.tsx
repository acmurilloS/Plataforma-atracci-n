import { useMemo } from 'react';
import { Building2, FolderOpen } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { useUnidadesDeSede, useFestivosTodos } from '../../hooks/useCatalogos';
import { useResumenesVacantes } from '../../hooks/useResumenesVacantes';
import type { VacanteDoc } from '../../schemas';
import { Card, Pill } from '../../components/brand';
import { VacanteCard } from '../../components/VacanteCard';
import { EncabezadoPagina } from '../../components/ui/EncabezadoPagina';

/**
 * MisUnidadesPage · /mis-unidades (rol 'gerente', reu Karen jul-2026).
 *
 * Vista de SOLO LECTURA para un gerente por área: ve únicamente las vacantes de
 * SUS unidades (el conjunto vive en `perfil.unidades_gerente`, IDs del catálogo).
 * El filtro va por `unidad_id in [...]` (id estable) — nunca por el nombre, que
 * no está normalizado. La frontera real la ponen las reglas de Firestore (el
 * mismo conjunto viaja en el claim `unidades_gerente`).
 *
 * La fase de cada tarjeta es la REAL (candidatos en curso): el gerente no lee
 * postulaciones, así que la toma del resumen que mantiene el servidor.
 */
export default function MisUnidadesPage() {
  const { perfil } = useAuth();
  // IDs de unidad asignadas (Firestore 'in' admite máx 30; un gerente tiene pocas).
  const unidades = useMemo(() => (perfil?.unidades_gerente ?? []).slice(0, 30), [perfil]);
  const { unidades: catalogo } = useUnidadesDeSede();
  const festivos = useFestivosTodos();

  const nombresUnidades = useMemo(() => {
    const byId = new Map(catalogo.map((u) => [u.id, u.nombre]));
    return unidades.map((id) => byId.get(id) ?? id);
  }, [catalogo, unidades]);

  const { docs: vacantes, cargando } = useColeccion<VacanteDoc>('vacantes', {
    filtros: unidades.length > 0 ? [['unidad_id', 'in', unidades]] : [],
    habilitado: unidades.length > 0,
  });

  // Orden en cliente (evita exigir índice compuesto in + orderBy): más recientes primero.
  const ordenadas = useMemo(
    () =>
      [...vacantes].sort(
        (a, b) => (b.creado_en?.toMillis() ?? 0) - (a.creado_en?.toMillis() ?? 0),
      ),
    [vacantes],
  );
  const ids = useMemo(() => ordenadas.map((v) => v.id), [ordenadas]);
  const { porVacante: resumenes } = useResumenesVacantes(ids);

  const activas = ordenadas.filter(
    (v) => !['cerrada', 'desierta', 'cancelada'].includes(v.estado),
  );
  const cerradas = ordenadas.filter((v) =>
    ['cerrada', 'desierta', 'cancelada'].includes(v.estado),
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <EncabezadoPagina
        icono={<FolderOpen size={26} strokeWidth={1.6} />}
        tono="brand"
        eyebrow="Gerente"
        titulo="Vacantes de mis áreas"
        descripcion="Seguimiento de las vacantes de las unidades a tu cargo. Vista de solo lectura."
      />

      {/* Chips de las unidades a cargo */}
      {nombresUnidades.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            <Building2 size={13} strokeWidth={1.75} /> Tus unidades
          </span>
          {nombresUnidades.map((n) => (
            <Pill key={n} tono="neutral">
              {n}
            </Pill>
          ))}
        </div>
      )}

      {unidades.length === 0 && (
        <Card padding="lg" className="text-center">
          <p className="text-[14px] font-medium text-text-strong">Aún no tienes unidades asignadas</p>
          <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
            Pídele al equipo de Gestión Humana que te asigne las unidades a tu cargo para ver sus
            vacantes aquí.
          </p>
        </Card>
      )}

      {cargando && unidades.length > 0 && (
        <p className="text-[13px] text-text-muted">Cargando…</p>
      )}

      {!cargando && unidades.length > 0 && ordenadas.length === 0 && (
        <Card padding="lg" className="text-center">
          <p className="text-[14px] font-medium text-text-strong">No hay vacantes en tus unidades</p>
          <p className="text-[12px] text-text-muted mt-1">
            Cuando se abra una vacante en alguna de tus áreas, aparecerá aquí.
          </p>
        </Card>
      )}

      {activas.length > 0 && (
        <section className="space-y-3">
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            En curso · <span className="tabular-nums text-text-strong">{activas.length}</span>
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activas.map((v) => (
              <VacanteCard
                key={v.id}
                vacante={v}
                festivos={festivos}
                resumen={resumenes.get(v.id) ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {cerradas.length > 0 && (
        <section className="space-y-3">
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Cerradas · <span className="tabular-nums text-text-strong">{cerradas.length}</span>
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cerradas.map((v) => (
              <VacanteCard key={v.id} vacante={v} festivos={festivos} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
