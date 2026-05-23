import { useCallback } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import type { VacanteDoc, VacanteInput } from '../schemas';

type ProgressHandler = (pct: number) => void;

function mensajeError(e: unknown): string {
  if (typeof e === 'object' && e && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    const mapa: Record<string, string> = {
      'storage/unauthorized': 'No tienes permisos para subir el aval. Contacta al administrador.',
      'storage/canceled': 'La subida del aval fue cancelada.',
      'storage/quota-exceeded': 'Se alcanzó el límite de almacenamiento.',
      'storage/retry-limit-exceeded': 'La red está inestable. Reintenta la subida.',
      'permission-denied': 'No tienes permisos para esta acción.',
      unavailable: 'Sin conexión al servidor. Revisa tu internet.',
      'not-found': 'No encontramos el recurso solicitado.',
    };
    return mapa[code] ?? `Ocurrió un error (${code}).`;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}

export interface ListarFiltros {
  empresa_codigo?: string;
  estado?: string;
  analista_uid?: string;
  lider_uid?: string;
}

export function useVacantes() {
  const subirAval = useCallback(
    (file: File, empresaCodigo: string, onProgress?: ProgressHandler): Promise<string> =>
      new Promise((resolve, reject) => {
        if (!empresaCodigo) {
          reject(new Error('Selecciona una empresa antes de subir el aval.'));
          return;
        }
        if (file.type !== 'application/pdf') {
          reject(new Error('Solo se aceptan archivos PDF.'));
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          reject(new Error('El PDF no puede superar 10 MB.'));
          return;
        }
        const ts = Date.now();
        const safeName = file.name.replace(/[^\w.-]+/g, '_');
        const path = `avales/${empresaCodigo}/${ts}_${safeName}`;
        const task = uploadBytesResumable(ref(storage, path), file, {
          contentType: 'application/pdf',
        });
        task.on(
          'state_changed',
          (snap) => {
            if (snap.totalBytes > 0) {
              onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100);
            }
          },
          (err) => reject(new Error(mensajeError(err))),
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref);
              resolve(url);
            } catch (err) {
              reject(new Error(mensajeError(err)));
            }
          },
        );
      }),
    [],
  );

  const crearVacante = useCallback(async (input: VacanteInput): Promise<{ id: string }> => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Debes iniciar sesión para crear una vacante.');
      if (!input.aval_url) throw new Error('El aval es obligatorio antes de crear la vacante.');
      const payload = {
        ...input,
        fecha_entrevista_propuesta: Timestamp.fromDate(input.fecha_entrevista_propuesta),
        fecha_entrevista_pactada: null,
        aval_aprobado_por: null,
        aval_aprobado_en: null,
        proceso_activo_id: null,
        analista_uid: null,
        analista_nombre: null,
        cerrada_en: null,
        razon_cierre: null,
        estado: 'borrador' as const,
        consecutivo: '',
        creado_en: serverTimestamp(),
        creado_por: uid,
        actualizado_en: serverTimestamp(),
        actualizado_por: uid,
      };
      const docRef = await addDoc(collection(db, 'vacantes'), payload);
      return { id: docRef.id };
    } catch (e) {
      throw new Error(mensajeError(e));
    }
  }, []);

  const obtenerVacante = useCallback(async (id: string): Promise<VacanteDoc | null> => {
    try {
      const snap = await getDoc(doc(db, 'vacantes', id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as Omit<VacanteDoc, 'id'>) };
    } catch (e) {
      throw new Error(mensajeError(e));
    }
  }, []);

  const listarVacantes = useCallback(
    async (filtros: ListarFiltros = {}): Promise<VacanteDoc[]> => {
      try {
        const constraints: QueryConstraint[] = [];
        if (filtros.empresa_codigo) constraints.push(where('empresa_codigo', '==', filtros.empresa_codigo));
        if (filtros.estado) constraints.push(where('estado', '==', filtros.estado));
        if (filtros.analista_uid) constraints.push(where('analista_uid', '==', filtros.analista_uid));
        if (filtros.lider_uid) constraints.push(where('lider_uid', '==', filtros.lider_uid));
        constraints.push(orderBy('creado_en', 'desc'));
        const snap = await getDocs(query(collection(db, 'vacantes'), ...constraints));
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VacanteDoc, 'id'>) }));
      } catch (e) {
        throw new Error(mensajeError(e));
      }
    },
    [],
  );

  const suscribirVacante = useCallback(
    (
      id: string,
      cb: (v: VacanteDoc) => void,
      onErr?: (msg: string) => void,
    ): Unsubscribe =>
      onSnapshot(
        doc(db, 'vacantes', id),
        (snap) => {
          if (!snap.exists()) return;
          cb({ id: snap.id, ...(snap.data() as Omit<VacanteDoc, 'id'>) });
        },
        (err) => {
          const msg = mensajeError(err);
          console.error('[useVacantes] suscribirVacante error:', err);
          onErr?.(msg);
        },
      ),
    [],
  );

  return { subirAval, crearVacante, obtenerVacante, listarVacantes, suscribirVacante };
}
