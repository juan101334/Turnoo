/**
 * Cuánto falta para un instante. Va aparte de fechas.ts para no cargar luxon en el navegador:
 * la cuenta regresiva de las citas por aprobar lo usa del lado del cliente.
 */

/** Minutos enteros que faltan (negativo o cero si ya pasó). */
export function minutosRestantes(hasta: string | Date, ahora: Date | number = new Date()): number {
  const fin = typeof hasta === 'string' ? Date.parse(hasta) : hasta.getTime();
  const desde = typeof ahora === 'number' ? ahora : ahora.getTime();
  return Math.floor((fin - desde) / 60_000);
}

/** 'en 1 h 20 min', 'en 5 min' o 'vencido'. Para el tiempo que queda para aprobar una cita. */
export function tiempoRestante(hasta: string | Date, ahora: Date | number = new Date()): string {
  const minutos = minutosRestantes(hasta, ahora);
  if (minutos <= 0) return 'vencido';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `en ${resto} min`;
  return resto === 0 ? `en ${horas} h` : `en ${horas} h ${resto} min`;
}
