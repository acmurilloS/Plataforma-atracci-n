import type { Timestamp } from 'firebase/firestore';

export interface ContadorDoc {
  id: string;
  empresa_codigo: string;
  sede_codigo: string;
  anio: number;
  ultimo_numero: number;
  creado_en: Timestamp | null;
  actualizado_en: Timestamp | null;
}

export function idContador(empresaCodigo: string, sedeCodigo: string, anio: number): string {
  return `${empresaCodigo}_${sedeCodigo}_${anio}`;
}

export function formatearConsecutivo(
  empresaCodigo: string,
  sedeCodigo: string,
  anio: number,
  numero: number,
): string {
  return `${empresaCodigo}-${sedeCodigo}-${anio}-${String(numero).padStart(4, '0')}`;
}
