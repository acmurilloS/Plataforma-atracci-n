const formateador = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatearCOP(valor: number): string {
  return formateador.format(valor);
}

export function soloDigitos(entrada: string): string {
  return entrada.replace(/\D+/g, '');
}
