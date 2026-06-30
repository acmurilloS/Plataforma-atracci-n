import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CargoDoc, EmpresaDoc, SedeDoc, UnidadDoc } from '../schemas';

export function useEmpresas() {
  const [empresas, setEmpresas] = useState<EmpresaDoc[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    // Ordenar por nombre sin filtrar activo en server: empresas son pocas (~10
    // máx por holding), filtrar en cliente evita necesidad de índice compuesto.
    const q = query(collection(db, 'empresas'), orderBy('nombre'));
    return onSnapshot(
      q,
      (snap) => {
        const todas = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<EmpresaDoc, 'id'>) }),
        );
        setEmpresas(todas.filter((e) => e.activo !== false));
        setCargando(false);
      },
      () => setCargando(false),
    );
  }, []);
  return { empresas, cargando };
}

export function useSedesDeEmpresa(empresaCodigo: string | null | undefined) {
  const [sedes, setSedes] = useState<SedeDoc[]>([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (!empresaCodigo) {
      setSedes([]);
      return;
    }
    setCargando(true);
    const q = query(
      collection(db, 'sedes'),
      where('empresa_codigo', '==', empresaCodigo),
      where('activo', '==', true),
      orderBy('nombre'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSedes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SedeDoc, 'id'>) })));
        setCargando(false);
      },
      () => setCargando(false),
    );
  }, [empresaCodigo]);
  return { sedes, cargando };
}

export function useUnidadesDeSede(_sedeCodigo?: string | null | undefined) {
  // Las unidades son áreas del HOLDING (globales), no de una sede puntual
  // (reu 26-jun: la lista oficial es transversal — ADM, gerencias, IG, LAP…).
  // Se devuelven TODAS las activas para cualquier vacante; el parámetro de sede
  // se conserva por compatibilidad de las llamadas pero se ignora.
  const [unidades, setUnidades] = useState<UnidadDoc[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    setCargando(true);
    const q = query(collection(db, 'unidades'), where('activo', '==', true));
    return onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UnidadDoc, 'id'>) }));
        arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        setUnidades(arr);
        setCargando(false);
      },
      () => setCargando(false),
    );
  }, []);
  return { unidades, cargando };
}

export function useCargos() {
  const [cargos, setCargos] = useState<CargoDoc[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    const q = query(
      collection(db, 'cargos_catalogo'),
      where('activo', '==', true),
      orderBy('nombre'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setCargos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CargoDoc, 'id'>) })));
        setCargando(false);
      },
      () => setCargando(false),
    );
  }, []);
  return { cargos, cargando };
}

export function useFestivosAnio(anio: number) {
  const [festivos, setFestivos] = useState<Set<string>>(new Set());
  useEffect(() => {
    const q = query(collection(db, 'festivos'), where('anio', '==', anio));
    return onSnapshot(q, (snap) => {
      const s = new Set<string>();
      snap.docs.forEach((d) => s.add(d.id));
      setFestivos(s);
    });
  }, [anio]);
  return festivos;
}

/**
 * Festivos colombianos COMPLETOS (toda la colección, sin filtrar por año). La
 * colección es chica (~18 docs/año) → cargarla entera evita que el cómputo de
 * días hábiles cuente como hábil un festivo de un año fuera de una ventana fija
 * (afectaría el ANS de vacantes/ternas con histórico de otros años). El id de
 * cada doc es 'yyyy-MM-dd'.
 */
export function useFestivosTodos() {
  const [festivos, setFestivos] = useState<Set<string>>(new Set());
  useEffect(() => {
    return onSnapshot(collection(db, 'festivos'), (snap) => {
      const s = new Set<string>();
      snap.docs.forEach((d) => s.add(d.id));
      setFestivos(s);
    });
  }, []);
  return festivos;
}
