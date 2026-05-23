import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CargoDoc, EmpresaDoc, SedeDoc, UnidadDoc } from '../schemas';

export function useEmpresas() {
  const [empresas, setEmpresas] = useState<EmpresaDoc[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'empresas'), where('activo', '==', true), orderBy('nombre'));
    return onSnapshot(
      q,
      (snap) => {
        setEmpresas(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmpresaDoc, 'id'>) })),
        );
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

export function useUnidadesDeSede(sedeCodigo: string | null | undefined) {
  const [unidades, setUnidades] = useState<UnidadDoc[]>([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (!sedeCodigo) {
      setUnidades([]);
      return;
    }
    setCargando(true);
    const q = query(
      collection(db, 'unidades'),
      where('sede_codigo', '==', sedeCodigo),
      where('activo', '==', true),
      orderBy('nombre'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setUnidades(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UnidadDoc, 'id'>) })),
        );
        setCargando(false);
      },
      () => setCargando(false),
    );
  }, [sedeCodigo]);
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
