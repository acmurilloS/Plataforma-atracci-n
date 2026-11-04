import { useCallback, useEffect, useState } from 'react';

/**
 * Estado que sobrevive a una RECARGA de la página (sessionStorage), para los
 * formularios largos del portal del integrante (reu Karen 04-nov: Edwin llenaba
 * la Debida Diligencia en el celular, "la plataforma se reinicia por completo" y
 * perdía todo). En el celular la página se recarga sola: arrastrar hacia abajo,
 * cambiar de app y volver, el navegador que descarta la pestaña…
 *
 * sessionStorage (no localStorage) a propósito: son datos personales del
 * candidato (cónyuge, finanzas) y se borran al cerrar la pestaña; nunca quedan en
 * un computador compartido. Si el almacenamiento no está disponible (modo
 * privado, bloqueado) funciona como un useState normal.
 *
 * Objetos: lo guardado se mezcla sobre el valor inicial, así un campo nuevo del
 * formulario no queda `undefined` con un borrador viejo.
 */
export function useBorradorSesion<T>(
  clave: string | null,
  inicial: T,
): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const [valor, setValor] = useState<T>(() => leer(clave, inicial));

  useEffect(() => {
    if (!clave) return;
    try {
      sessionStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento: solo memoria */
    }
  }, [clave, valor]);

  const borrar = useCallback(() => {
    if (!clave) return;
    try {
      sessionStorage.removeItem(clave);
    } catch {
      /* nada que borrar */
    }
  }, [clave]);

  return [valor, setValor, borrar];
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function leer<T>(clave: string | null, inicial: T): T {
  if (!clave) return inicial;
  try {
    const raw = sessionStorage.getItem(clave);
    if (!raw) return inicial;
    const guardado = JSON.parse(raw) as unknown;
    if (Array.isArray(inicial)) return (Array.isArray(guardado) ? guardado : inicial) as T;
    if (esObjetoPlano(inicial)) {
      return (esObjetoPlano(guardado) ? { ...inicial, ...guardado } : inicial) as T;
    }
    return (typeof guardado === typeof inicial ? guardado : inicial) as T;
  } catch {
    return inicial;
  }
}
