import { DateTime } from 'luxon';
import type { Horario } from './administracion';
import type { Bloqueo } from './bloqueos';
import type { Cita, EstadoCita } from './citas';

/**
 * Cálculos de la vista de un día: dónde cae cada cosa, qué está libre y quién sigue.
 * Todo se mide en minutos desde las 00:00 del día en la zona del NEGOCIO, así la grilla del
 * escritorio y la lista del celular usan las mismas cuentas. Sin llamadas al backend.
 */

/** Un tramo del día en minutos: [inicio, fin). */
export interface Tramo {
  inicio: number;
  fin: number;
}

export const MINUTOS_DEL_DIA = 24 * 60;

/** Un hueco más corto que esto no se ofrece: no cabe ningún servicio. */
export const HUECO_MINIMO = 15;

/** Las citas canceladas no ocupan la agenda; las demás sí, aunque ya hayan pasado. */
export const ocupaLaAgenda = (estado: EstadoCita) => estado !== 'cancelada';

/** Minutos de `instante` contados desde las 00:00 de `fecha` en `zona` (puede ser negativo o pasar de 1440). */
export function minutosDesdeElInicio(instante: string | Date, fecha: string, zona: string): number {
  const inicioDelDia = DateTime.fromISO(fecha, { zone: zona }).startOf('day');
  const momento = typeof instante === 'string' ? DateTime.fromISO(instante) : DateTime.fromJSDate(instante);
  return Math.round(momento.diff(inicioDelDia, 'minutes').minutes);
}

/** El mismo tramo, recortado a las 24 horas del día; null si queda fuera. */
export function recortarAlDia({ inicio, fin }: Tramo): Tramo | null {
  const a = Math.max(0, inicio);
  const b = Math.min(MINUTOS_DEL_DIA, fin);
  return b > a ? { inicio: a, fin: b } : null;
}

/** 'HH:MM' o 'HH:MM:SS' a minutos del día. */
export function minutosDeHora(hora: string): number {
  const [h = '0', m = '0'] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

/** 1 = lunes ... 7 = domingo, como el backend. */
export function diaDeLaSemana(fecha: string): number {
  return DateTime.fromISO(fecha).weekday;
}

/** Los rangos de trabajo de ese día de la semana, en orden. */
export function rangosDeTrabajo(horarios: Pick<Horario, 'diaSemana' | 'horaInicio' | 'horaFin'>[], fecha: string): Tramo[] {
  const dia = diaDeLaSemana(fecha);
  return horarios
    .filter((h) => h.diaSemana === dia)
    .map((h) => ({ inicio: minutosDeHora(h.horaInicio), fin: minutosDeHora(h.horaFin) }))
    .filter((t) => t.fin > t.inicio)
    .sort((a, b) => a.inicio - b.inicio);
}

/** Lo que queda de `libres` al quitarle `ocupados`. */
export function restar(libres: Tramo[], ocupados: Tramo[]): Tramo[] {
  let resultado = libres.map((t) => ({ ...t }));
  for (const o of ocupados) {
    resultado = resultado.flatMap((t) => {
      if (o.fin <= t.inicio || o.inicio >= t.fin) return [t];
      const partes: Tramo[] = [];
      if (o.inicio > t.inicio) partes.push({ inicio: t.inicio, fin: o.inicio });
      if (o.fin < t.fin) partes.push({ inicio: o.fin, fin: t.fin });
      return partes;
    });
  }
  return resultado;
}

/** Tramo de una cita o un bloqueo dentro del día (recortado). */
export function tramoDe(cosa: { inicio: string; fin: string }, fecha: string, zona: string): Tramo | null {
  return recortarAlDia({ inicio: minutosDesdeElInicio(cosa.inicio, fecha, zona), fin: minutosDesdeElInicio(cosa.fin, fecha, zona) });
}

/** Los bloqueos que tocan a un barbero: los suyos y los de todo el negocio. */
export const bloqueosDe = (bloqueos: Bloqueo[], profesionalId: string) =>
  bloqueos.filter((b) => b.profesionalId === null || b.profesionalId === profesionalId);

/**
 * Huecos libres de un barbero en un día: su horario menos las citas que ocupan la agenda y los
 * bloqueos. `desde` (minutos) corta lo que ya pasó: en el día de hoy no se ofrece el pasado.
 */
export function huecosLibres({
  trabajo,
  citas,
  bloqueos,
  fecha,
  zona,
  desde = 0,
  minimo = HUECO_MINIMO,
}: {
  trabajo: Tramo[];
  citas: Pick<Cita, 'inicio' | 'fin' | 'estado'>[];
  bloqueos: Pick<Bloqueo, 'inicio' | 'fin'>[];
  fecha: string;
  zona: string;
  desde?: number;
  minimo?: number;
}): Tramo[] {
  const ocupados = [
    ...citas.filter((c) => ocupaLaAgenda(c.estado)).map((c) => tramoDe(c, fecha, zona)),
    ...bloqueos.map((b) => tramoDe(b, fecha, zona)),
    { inicio: 0, fin: desde },
  ].filter((t): t is Tramo => t !== null && t.fin > t.inicio);
  return restar(trabajo, ocupados).filter((t) => t.fin - t.inicio >= minimo);
}

/** Desde cuándo se ofrecen huecos hoy: el próximo múltiplo de 5 minutos. */
export function desdeAhora(fecha: string, zona: string, ahora: Date): number {
  const minutos = minutosDesdeElInicio(ahora, fecha, zona);
  return Math.ceil(minutos / 5) * 5;
}

/**
 * Horas que muestra la grilla del escritorio: desde la primera hora con trabajo, cita o bloqueo
 * hasta la última, en horas enteras. Sin nada, de 8:00 a 18:00.
 */
export function rangoDeLaGrilla(tramos: Tramo[]): Tramo {
  if (tramos.length === 0) return { inicio: 8 * 60, fin: 18 * 60 };
  const inicio = Math.floor(Math.min(...tramos.map((t) => t.inicio)) / 60) * 60;
  const fin = Math.ceil(Math.max(...tramos.map((t) => t.fin)) / 60) * 60;
  return { inicio, fin: Math.max(fin, inicio + 60) };
}

/** Duración de una cita en minutos. */
export const duracionMinutos = (cita: Pick<Cita, 'inicio' | 'fin'>) => Math.round((Date.parse(cita.fin) - Date.parse(cita.inicio)) / 60_000);

/** '50 min', '1 h' o '1 h 20 min'. */
export function duracionLegible(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Estados en los que una cita todavía va a pasar (o está pasando). */
const POR_ATENDER: EstadoCita[] = ['pendiente', 'confirmada'];

/**
 * La que está pasando o la próxima, para el bloque "Sigue" del día de hoy. Una cita en curso
 * (empezó y no ha terminado) gana sobre la siguiente: es la que el barbero tiene enfrente.
 */
export function quienSigue<T extends Pick<Cita, 'inicio' | 'fin' | 'estado'>>(citas: T[], ahora: Date): { cita: T; enCurso: boolean } | null {
  const t = ahora.getTime();
  const candidatas = citas.filter((c) => POR_ATENDER.includes(c.estado) && Date.parse(c.fin) > t).sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const primera = candidatas[0];
  if (!primera) return null;
  return { cita: primera, enCurso: Date.parse(primera.inicio) <= t };
}

/** Instante ISO de un minuto del día (para enlazar una hora libre). */
export function instanteDe(fecha: string, minutos: number, zona: string): string {
  return DateTime.fromISO(fecha, { zone: zona }).startOf('day').plus({ minutes: minutos }).toISO()!;
}
