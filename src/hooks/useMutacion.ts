import { useCallback } from 'react';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

function uidActual(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error('No hay sesión activa.');
  return u;
}

export function useMutacion() {
  const crear = useCallback(
    async <T extends Record<string, unknown>>(coleccion: string, data: T): Promise<string> => {
      const uid = uidActual();
      // Generamos el id en cliente para escribir con setDoc en UNA sola
      // operación. addDoc + updateDoc(id) rompía en colecciones inmutables
      // como `decisiones` (allow update: if false) que rechazan el segundo
      // updateDoc del id.
      const ref = doc(collection(db, coleccion));
      await setDoc(ref, {
        id: ref.id,
        ...data,
        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
      return ref.id;
    },
    [],
  );

  const actualizar = useCallback(
    async (coleccion: string, id: string, patch: Record<string, unknown>): Promise<void> => {
      const uid = uidActual();
      await updateDoc(doc(db, coleccion, id), {
        ...patch,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
    },
    [],
  );

  const setConId = useCallback(
    async <T extends Record<string, unknown>>(
      coleccion: string,
      id: string,
      data: T,
    ): Promise<void> => {
      const uid = uidActual();
      await setDoc(doc(db, coleccion, id), {
        id,
        ...data,
        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      });
    },
    [],
  );

  return { crear, actualizar, setConId };
}
