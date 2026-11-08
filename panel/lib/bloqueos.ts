import { DateTime } from 'luxon';
import type { Cita, EstadoCita } from './citas';
import { esFechaValida, fechaDe, fechaLarga, horaLocal, sumarDias } from './fechas';

/**
 * Bloqueos (almuerzo, permisos, cierres) tal como los devuelve el backend, y lo que el panel
 * calcula de ellos. Un bloqueo no cambia las citas que ya existen: el backend las devuelve como
 * "afectadas" y el negocio decide qué hacer con cada una.
 */

export interface Bloqueo {
  id: string;
  /** null = todo el negocio (festivo o cierre). */
  profesionalId: string | null;
  inicio: string;
  fin: string;
  motivo: string | null;
}

export interface CitaAfectada {
  id: string;
  profesionalId: string;
  inicio: string;
  fin: string;
  estado: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
}

export interface FormularioDeBloqueo {
  fechaDesde: string;
  horaDesde: string;
  fechaHasta: string;
  horaHasta: string;
  todoElDia: boolean;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Del formulario a instantes ISO en la zona del negocio. "Todo el día" va de las 00:00 del
 * primer día a las 00:00 del día siguiente al último. Devuelve un texto si algo no cuadra.
 */
export function rangoDelBloqueo(f: FormularioDeBloqueo, zona: string): { inicio: string; fin: string } | { error: string } {
  if (!esFechaValida(f.fechaDesde)) return { error: 'Elige el día en que empieza.' };
  const fechaHasta = f.fechaHasta || f.fechaDesde;
  if (!esFechaValida(fechaHasta)) return { error: 'La fecha de fin no es válida.' };

  let inicio: DateTime;
  let fin: DateTime;
  if (f.todoElDia) {
    inicio = DateTime.fromISO(f.fechaDesde, { zone: zona }).startOf('day');
    fin = DateTime.fromISO(sumarDias(fechaHasta, 1), { zone: zona }).startOf('day');
  } else {
    if (!HORA.test(f.horaDesde) || !HORA.test(f.horaHasta)) return { error: 'Escribe la hora de inicio y la de fin, o marca "Todo el día".' };
    inicio = DateTime.fromISO(`${f.fechaDesde}T${f.horaDesde}`, { zone: zona });
    fin = DateTime.fromISO(`${fechaHasta}T${f.horaHasta}`, { zone: zona });
  }
  if (fin <= inicio) return { error: 'El bloqueo debe terminar después de empezar.' };
  return { inicio: inicio.toISO()!, fin: fin.toISO()! };
}

const ACTIVAS: EstadoCita[] = ['por_aprobar', 'pendiente', 'confirmada'];

/** Citas activas que se cruzan con el bloqueo: del mismo barbero, o de todos si es del negocio. */
export function citasQueSeCruzan(bloqueo: Bloqueo, citas: Cita[]): Cita[] {
  const desde = Date.parse(bloqueo.inicio);
  const hasta = Date.parse(bloqueo.fin);
  return citas.filter(
    (c) =>
      ACTIVAS.includes(c.estado) &&
      (bloqueo.profesionalId === null || c.profesionalId === bloqueo.profesionalId) &&
      Date.parse(c.inicio) < hasta &&
      Date.parse(c.fin) > desde,
  );
}

/** ¿Ocupa días completos (de 00:00 a 00:00) en la zona del negocio? */
function diasCompletos(b: Pick<Bloqueo, 'inicio' | 'fin'>, zona: string): boolean {
  const esMedianoche = (iso: string) => {
    const d = DateTime.fromISO(iso).setZone(zona);
    return d.hour === 0 && d.minute === 0;
  };
  return esMedianoche(b.inicio) && esMedianoche(b.fin);
}

/** 'Martes 10 de noviembre · 12:00 p. m. a 1:00 p. m.', 'Martes 10 de noviembre · todo el día' o un rango de días. */
export function describirBloqueo(b: Pick<Bloqueo, 'inicio' | 'fin'>, zona: string): string {
  const desde = fechaDe(b.inicio, zona);
  if (diasCompletos(b, zona)) {
    const ultimo = sumarDias(fechaDe(b.fin, zona), -1);
    return ultimo === desde ? `${fechaLarga(desde)} · todo el día` : `Del ${fechaLarga(desde)} al ${fechaLarga(ultimo)}`;
  }
  const hasta = fechaDe(b.fin, zona);
  if (hasta === desde) return `${fechaLarga(desde)} · ${horaLocal(b.inicio, zona)} a ${horaLocal(b.fin, zona)}`;
  return `Del ${fechaLarga(desde)}, ${horaLocal(b.inicio, zona)}, al ${fechaLarga(hasta)}, ${horaLocal(b.fin, zona)}`;
}
