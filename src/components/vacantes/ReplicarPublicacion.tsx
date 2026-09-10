import { useMemo, useState } from 'react';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { Check, Layers } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { Button, Card, Pill, type PillTono } from '../brand';
import type { VacanteDoc } from '../../schemas';

/**
 * ReplicarPublicacion · reu Karen 09-sep. Cuando se abren varias vacantes IGUALES
 * (mismo cargo, empresa y sede — p. ej. 5 técnicos en Medellín), la analista
 * publica un solo aviso (Magneto) pero las demás quedaban sin publicación
 * registrada y "sin actividad". Este bloque copia los canales publicados de esta
 * vacante a sus hermanas activas con un clic.
 *
 * - El link propio de Equitel NO se copia tal cual: cada hermana recibe el suyo
 *   (`/carreras/{id}`), igual que al usar "Copiar link" en ella.
 * - No duplica: si la hermana ya tiene ese canal con esa URL publicado, se salta.
 * - Una hermana en `lista_para_publicar` pasa a `publicada` (como al publicar a mano).
 * - La analista solo ve las hermanas que puede editar (sin analista o asignadas a
 *   ella), por las reglas de `vacantes`; coordinación/admin ven todas.
 * - Procesos migrados traen la CIUDAD real solo en el consecutivo editado a mano
 *   (p. ej. CU-QUB-1239 con sede Medellín). Por eso solo vienen marcadas las
 *   hermanas con la misma ciudad en el consecutivo; las demás se muestran como
 *   "otra ciudad" y la analista decide si las incluye.
 */

export interface PublicacionMin {
  id: string;
  canal: string;
  canal_detalle: string | null;
  url_externa: string | null;
  estado: string;
}

const ESTADOS_DESTINO = ['lista_para_publicar', 'publicada', 'en_proceso'];
const ROLES = ['analista', 'coordinador', 'admin'];

const ESTADO_TONO: Record<string, PillTono> = {
  lista_para_publicar: 'brand',
  publicada: 'warning',
  en_proceso: 'info',
};

/** Código de ciudad del consecutivo ("CU-MED-1223" → "MED"); '' si no se puede leer. */
function ciudadDeConsecutivo(consecutivo: string | undefined): string {
  return (consecutivo ?? '').split('-')[1]?.trim().toUpperCase() ?? '';
}

export function ReplicarPublicacion({
  vacante,
  publicaciones,
}: {
  vacante: VacanteDoc;
  publicaciones: PublicacionMin[];
}) {
  const { rol, user } = useAuth();
  const { crear, actualizar } = useMutacion();
  const puede = ROLES.includes(rol ?? '');

  const { docs: mismoCargo } = useColeccion<VacanteDoc>('vacantes', {
    filtros: [['cargo_id', '==', vacante.cargo_id]],
    limit: 200,
    habilitado: puede && !!vacante.cargo_id,
  });

  const hermanas = useMemo(() => {
    const ciudad = ciudadDeConsecutivo(vacante.consecutivo);
    return mismoCargo
      .filter(
        (v) =>
          v.id !== vacante.id &&
          v.empresa_codigo === vacante.empresa_codigo &&
          v.sede_codigo === vacante.sede_codigo &&
          ESTADOS_DESTINO.includes(v.estado) &&
          (rol !== 'analista' || !v.analista_uid || v.analista_uid === user?.uid),
      )
      .map((v) => {
        const otra = ciudadDeConsecutivo(v.consecutivo);
        return { v, otraCiudad: !!ciudad && !!otra && otra !== ciudad };
      })
      .sort((a, b) => (a.v.consecutivo ?? '').localeCompare(b.v.consecutivo ?? ''));
  }, [mismoCargo, vacante, rol, user]);

  const aReplicar = publicaciones.filter((p) => p.estado === 'publicada');

  // Marcado por defecto = misma ciudad; aquí solo se guardan los cambios de la analista.
  const [cambios, setCambios] = useState<Map<string, boolean>>(new Map());
  const [replicando, setReplicando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!puede || hermanas.length === 0) return null;

  const marcada = (h: { v: VacanteDoc; otraCiudad: boolean }) => cambios.get(h.v.id) ?? !h.otraCiudad;
  const seleccion = hermanas.filter(marcada).map((h) => h.v);

  const alternar = (h: { v: VacanteDoc; otraCiudad: boolean }) =>
    setCambios((prev) => new Map(prev).set(h.v.id, !marcada(h)));

  async function replicar() {
    if (seleccion.length === 0 || aReplicar.length === 0) return;
    const lista = seleccion.map((v) => v.consecutivo).join(', ');
    if (
      !window.confirm(
        `¿Replicar ${aReplicar.length} canal(es) en ${seleccion.length} vacante(s)?\n\n${lista}`,
      )
    )
      return;
    setReplicando(true);
    setErr(null);
    setResultado(null);
    let creadas = 0;
    let yaEstaban = 0;
    let vacantesTocadas = 0;
    try {
      for (const h of seleccion) {
        const snap = await getDocs(
          query(collection(db, 'publicaciones'), where('vacante_id', '==', h.id)),
        );
        const existentes = snap.docs.map(
          (d) => d.data() as { canal?: string; url_externa?: string | null; estado?: string },
        );
        let nuevas = 0;
        for (const p of aReplicar) {
          const url =
            p.canal === 'equitel_reclutamiento'
              ? `${window.location.origin}/carreras/${h.id}`
              : p.url_externa;
          const repetida = existentes.some(
            (e) =>
              e.estado === 'publicada' &&
              e.canal === p.canal &&
              (e.url_externa ?? null) === (url ?? null),
          );
          if (repetida) {
            yaEstaban += 1;
            continue;
          }
          await crear('publicaciones', {
            vacante_id: h.id,
            vacante_consecutivo: h.consecutivo,
            proceso_id: h.proceso_activo_id,
            canal: p.canal,
            canal_detalle: p.canal_detalle ?? null,
            url_externa: url ?? null,
            id_externo: null,
            pieza_grafica_url: null,
            estado: 'publicada',
            publicada_en: Timestamp.now(),
            retirada_en: null,
            postulaciones_recibidas: 0,
            replicada_desde_vacante_id: vacante.id,
            replicada_desde_consecutivo: vacante.consecutivo,
          });
          creadas += 1;
          nuevas += 1;
        }
        if (nuevas > 0) vacantesTocadas += 1;
        // Igual que al publicar a mano: si estaba lista para publicar, queda publicada.
        if (h.estado === 'lista_para_publicar') {
          await actualizar('vacantes', h.id, { estado: 'publicada' });
        }
      }
      setResultado(
        `Listo: ${creadas} ${creadas === 1 ? 'publicación nueva' : 'publicaciones nuevas'} en ` +
          `${vacantesTocadas} ${vacantesTocadas === 1 ? 'vacante' : 'vacantes'}` +
          (yaEstaban ? ` · ${yaEstaban} ya estaban registradas` : '') +
          '.',
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos replicar la publicación.');
    } finally {
      setReplicando(false);
    }
  }

  return (
    <Card padding="lg">
      <div className="flex items-center gap-2 mb-2">
        <Layers size={14} strokeWidth={1.75} className="text-text-muted" />
        <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
          Replicar en vacantes iguales
        </p>
      </div>
      <p className="text-[12px] text-text-muted leading-[1.55]">
        {hermanas.length === 1 ? 'Hay 1 vacante activa' : `Hay ${hermanas.length} vacantes activas`} de{' '}
        <span className="font-semibold text-text-body">{vacante.cargo_nombre}</span> en{' '}
        {vacante.sede_nombre}. Replica en ellas los canales publicados de esta vacante con un clic; el
        link propio de Equitel se crea con el de cada vacante.
      </p>

      <ul className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
        {hermanas.map((h) => (
          <li key={h.v.id}>
            <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50/60">
              <input
                type="checkbox"
                checked={marcada(h)}
                onChange={() => alternar(h)}
                className="h-4 w-4 accent-brand-600"
              />
              <span className="font-mono text-[12px] text-text-strong">{h.v.consecutivo}</span>
              <Pill tono={ESTADO_TONO[h.v.estado] ?? 'neutral'} dot>
                {h.v.estado.replace(/_/g, ' ')}
              </Pill>
              {h.otraCiudad && <Pill tono="neutral">otra ciudad</Pill>}
              <span className="ml-auto text-[11px] text-text-subtle truncate">
                {h.v.analista_nombre ?? 'Sin analista'}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {aReplicar.length === 0 && (
        <p className="mt-3 text-[12px] text-warning-700">
          Primero publica esta vacante en al menos un canal; luego podrás replicarlo.
        </p>
      )}
      {err && (
        <div className="mt-3 rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}
      {resultado && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-success-700 font-medium">
          <Check size={13} strokeWidth={2} />
          {resultado}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          variant="brand-primary"
          onClick={replicar}
          disabled={replicando || seleccion.length === 0 || aReplicar.length === 0}
          loading={replicando}
          icon={<Layers size={14} strokeWidth={1.75} />}
        >
          {`Replicar ${aReplicar.length} ${aReplicar.length === 1 ? 'canal' : 'canales'} en ${
            seleccion.length
          } ${seleccion.length === 1 ? 'vacante' : 'vacantes'}`}
        </Button>
      </div>
    </Card>
  );
}
