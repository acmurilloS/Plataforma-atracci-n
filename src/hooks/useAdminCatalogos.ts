import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type {
  CargoInput,
  EmpresaInput,
  SedeInput,
  UnidadInput,
} from '../schemas';

function uidActual(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error('No hay sesión activa.');
  return u;
}

function auditoriaNueva(uid: string) {
  return {
    creado_en: serverTimestamp(),
    creado_por: uid,
    actualizado_en: serverTimestamp(),
    actualizado_por: uid,
  };
}

function auditoriaUpdate(uid: string) {
  return {
    actualizado_en: serverTimestamp(),
    actualizado_por: uid,
  };
}

export function useAdminCatalogos() {
  async function crearEmpresa(input: EmpresaInput) {
    const uid = uidActual();
    await setDoc(doc(db, 'empresas', input.codigo), {
      id: input.codigo,
      ...input,
      ...auditoriaNueva(uid),
    });
  }
  async function actualizarEmpresa(id: string, patch: Partial<EmpresaInput>) {
    await updateDoc(doc(db, 'empresas', id), { ...patch, ...auditoriaUpdate(uidActual()) });
  }

  async function crearSede(input: SedeInput) {
    const uid = uidActual();
    await setDoc(doc(db, 'sedes', input.codigo), {
      id: input.codigo,
      ...input,
      ...auditoriaNueva(uid),
    });
  }
  async function actualizarSede(id: string, patch: Partial<SedeInput>) {
    await updateDoc(doc(db, 'sedes', id), { ...patch, ...auditoriaUpdate(uidActual()) });
  }

  async function crearUnidad(input: UnidadInput) {
    const uid = uidActual();
    const ref = await addDoc(collection(db, 'unidades'), {
      ...input,
      ...auditoriaNueva(uid),
    });
    await updateDoc(ref, { id: ref.id });
  }
  async function actualizarUnidad(id: string, patch: Partial<UnidadInput>) {
    await updateDoc(doc(db, 'unidades', id), { ...patch, ...auditoriaUpdate(uidActual()) });
  }

  async function crearCargo(input: CargoInput) {
    const uid = uidActual();
    const ref = await addDoc(collection(db, 'cargos_catalogo'), {
      ...input,
      ...auditoriaNueva(uid),
    });
    await updateDoc(ref, { id: ref.id });
  }
  async function actualizarCargo(id: string, patch: Partial<CargoInput>) {
    await updateDoc(doc(db, 'cargos_catalogo', id), { ...patch, ...auditoriaUpdate(uidActual()) });
  }

  return {
    crearEmpresa,
    actualizarEmpresa,
    crearSede,
    actualizarSede,
    crearUnidad,
    actualizarUnidad,
    crearCargo,
    actualizarCargo,
  };
}
