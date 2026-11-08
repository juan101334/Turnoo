import { DateTime } from 'luxon';

/**
 * Fechas y horas en la zona del NEGOCIO, no en la del navegador ni la del servidor: "hoy" es el
 * día de la barbería, aunque el dueño abra el panel de viaje en otro país.
 * Las fechas locales van como 'AAAA-MM-DD'; los instantes, en ISO con zona.
 */

const LOCALE = 'es-CO';
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaValida(texto: string | undefined | null): texto is string {
  return typeof texto === 'string' && FORMATO_FECHA.test(texto) && DateTime.fromISO(texto).isValid;
}

export function hoyEn(zona: string, ahora: Date = new Date()): string {
  return DateTime.fromJSDate(ahora).setZone(zona).toISODate()!;
}

export function sumarDias(fecha: string, dias: number): string {
  return DateTime.fromISO(fecha).plus({ days: dias }).toISODate()!;
}

/** Desde las 00:00 del día hasta las 00:00 del siguiente, en la zona del negocio (el backend excluye "hasta"). */
export function limitesDelDia(fecha: string, zona: string): { desde: string; hasta: string } {
  const inicio = DateTime.fromISO(fecha, { zone: zona }).startOf('day');
  return { desde: inicio.toISO()!, hasta: inicio.plus({ days: 1 }).toISO()! };
}

/** 'Hoy', 'Mañana' o 'Ayer'; si no, null. */
export function diaRelativo(fecha: string, hoy: string): string | null {
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, 1)) return 'Mañana';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  return null;
}

/** 'sábado 8 de noviembre'. */
export function fechaLarga(fecha: string): string {
  return DateTime.fromISO(fecha).setLocale(LOCALE).toFormat("cccc d 'de' LLLL");
}

/** Para la tira de días: { semana: 'sáb', dia: '8' }. */
export function partesDelDia(fecha: string): { semana: string; dia: string } {
  const d = DateTime.fromISO(fecha).setLocale(LOCALE);
  return { semana: d.toFormat('ccc').replace('.', ''), dia: String(d.day) };
}

/** '3:30 p. m.' en la zona del negocio. */
export function horaLocal(instante: string | Date, zona: string): string {
  const d = typeof instante === 'string' ? DateTime.fromISO(instante) : DateTime.fromJSDate(instante);
  return d.setZone(zona).setLocale(LOCALE).toLocaleString(DateTime.TIME_SIMPLE);
}

/** Fecha local (AAAA-MM-DD) de un instante, en la zona del negocio. */
export function fechaDe(instante: string | Date, zona: string): string {
  const d = typeof instante === 'string' ? DateTime.fromISO(instante) : DateTime.fromJSDate(instante);
  return d.setZone(zona).toISODate()!;
}

// Sin luxon: también lo usa la cuenta regresiva, que corre en el navegador.
export { minutosRestantes, tiempoRestante } from './tiempo-restante';

/** Hora del día (0 a 23) de un instante, en la zona del negocio. */
export function horaDelDia(instante: string | Date, zona: string): number {
  const d = typeof instante === 'string' ? DateTime.fromISO(instante) : DateTime.fromJSDate(instante);
  return d.setZone(zona).hour;
}
