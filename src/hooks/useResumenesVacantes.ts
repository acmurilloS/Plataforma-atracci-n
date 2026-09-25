import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useColeccion } from './useColeccion';
import type { ResumenVacanteDoc, RolUsuario } from '../schemas';

/**
 * useResumenesVacantes · resumen de candidatos en curso por vacante
 * (`vacantes_resumen/{vacanteId}`, lo mantiene el servidor — BUG B, 10-sep).
 *
 * Con él la tarjeta pinta la fase REAL (`faseTarjeta`) sin leer postulaciones,
 * que apoyo, talentos y gerente no pueden leer (firestore.rules `leeCandidato`).
 * La forma de leerlo sigue las reglas de la colección:
 *  - analista / coordinador / admin / apoyo / talentos → `list` de la colección
 *    completa (una sola suscripción; tope 1000).
 *  - líder / gerente → no tienen `list` (verían vacantes ajenas): un `onSnapshot`
 *    por cada vacante que ya pudieron leer (tope 200).
 *  - resto de roles → vacío, sin montar nada.
 *
 * Sin doc (vacante nueva o aún sin calcular) o si falla la lectura, esa vacante
 * no trae resumen y la fase cae al estado de la vacante.
 */

const ROLES_LISTA: ReadonlySet<RolUsuario> = new Set<RolUsuario>([
  'analista',
  'coordinador',
  'admin',
  'apoyo',
  'talentos',
]);
// gh: Diego (C&D) es líder solicitante de sus propias vacantes y las ve en
// "Mis vacantes"; la regla de vacantes_resumen ya le permite el get (reu 16-sep).
const ROLES_POR_DOC: ReadonlySet<RolUsuario> = new Set<RolUsuario>(['lider', 'gerente', 'gh']);

const TOPE_LISTA = 1000;
const TOPE_DOCS = 200;
/** Agrupa la ráfaga de snapshots de la primera carga en un solo render. */
const VENTANA_MS = 30;

/** Mapa vacío compartido (identidad estable entre renders). Solo lectura. */
const VACIO: Map<string, ResumenVacanteDoc> = new Map();

interface ResultadoResumenes {
  porVacante: Map<string, ResumenVacanteDoc>;
  cargando: boolean;
}

export function useResumenesVacantes(vacanteIds: string[]): ResultadoResumenes {
  const { rol } = useAuth();
  const modoLista = !!rol && ROLES_LISTA.has(rol);
  const modoDoc = !!rol && ROLES_POR_DOC.has(rol);

  // ── Roles con `list`: la colección entera ──────────────────────────────────
  const { docs, cargando: cargandoLista } = useColeccion<ResumenVacanteDoc>('vacantes_resumen', {
    limit: TOPE_LISTA,
    habilitado: modoLista,
  });
  const deLista = useMemo(() => new Map(docs.map((d) => [d.id, d] as const)), [docs]);

  // ── Líder / gerente: un doc por vacante ────────────────────────────────────
  // Clave estable ante re-renders: ids únicos (el tope respeta el orden recibido,
  // p. ej. las más recientes primero) y luego ordenados.
  const clave = modoDoc
    ? Array.from(new Set(vacanteIds.filter(Boolean))).slice(0, TOPE_DOCS).sort().join('|')
    : '';

  const [porDoc, setPorDoc] = useState<ResultadoResumenes>({ porVacante: VACIO, cargando: false });
  // Último mapa publicado: al sumar/quitar una vacante las demás no se "apagan".
  const ultimo = useRef<Map<string, ResumenVacanteDoc>>(VACIO);

  useEffect(() => {
    if (!clave) {
      ultimo.current = VACIO;
      setPorDoc({ porVacante: VACIO, cargando: false });
      return;
    }
    const ids = clave.split('|');
    const acumulado = new Map<string, ResumenVacanteDoc>();
    for (const id of ids) {
      const previo = ultimo.current.get(id);
      if (previo) acumulado.set(id, previo);
    }
    const pendientes = new Set(ids);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let avisado = false;

    const publicar = () => {
      timer = undefined;
      const mapa = new Map(acumulado);
      ultimo.current = mapa;
      setPorDoc({ porVacante: mapa, cargando: pendientes.size > 0 });
    };
    const programar = () => {
      if (timer === undefined) timer = setTimeout(publicar, VENTANA_MS);
    };

    setPorDoc((prev) => ({ porVacante: prev.porVacante, cargando: true }));

    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, 'vacantes_resumen', id),
        (snap) => {
          // Sin doc = sin resumen todavía (no es un error): la fase cae al estado.
          if (snap.exists()) {
            acumulado.set(id, { ...(snap.data() as Omit<ResumenVacanteDoc, 'id'>), id: snap.id });
          } else {
            acumulado.delete(id);
          }
          pendientes.delete(id);
          programar();
        },
        (err) => {
          // Un solo aviso por tanda, no uno por vacante.
          if (!avisado) {
            avisado = true;
            console.warn('[useResumenesVacantes] no se pudo leer el resumen:', err.code);
          }
          acumulado.delete(id);
          pendientes.delete(id);
          programar();
        },
      ),
    );

    return () => {
      unsubs.forEach((u) => u());
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [clave]);

  if (modoLista) return { porVacante: deLista, cargando: cargandoLista };
  if (modoDoc) return porDoc;
  return { porVacante: VACIO, cargando: false };
}
