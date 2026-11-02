import { DateTime } from 'luxon';

/**
 * ÚNICO lugar donde se hacen cuentas de fechas y zonas horarias.
 *
 * En la base de datos y en el código los instantes van en UTC (Date). La hora
 * "de pared" del negocio (por ejemplo 08:00 en Bogotá) solo existe aquí:
 * se convierte con la zona horaria de cada negocio (negocios.zona_horaria).
 *
 * Las fechas locales se escriben 'AAAA-MM-DD' y las horas 'HH:MM' o 'HH:MM:SS'.
 */

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function local(instante: Date, zona: string): DateTime {
  return DateTime.fromJSDate(instante, { zone: zona }).setLocale('en-US');
}

/** ¿Es una fecha 'AAAA-MM-DD' que existe en el calendario? */
export function esFechaLocal(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    FORMATO_FECHA.test(valor) &&
    DateTime.fromISO(valor, { zone: 'utc' }).isValid
  );
}

/** ¿Es una zona horaria conocida (por ejemplo 'America/Bogota')? */
export function esZonaHoraria(valor: unknown): valor is string {
  return typeof valor === 'string' && DateTime.now().setZone(valor).isValid;
}

/** Instante UTC en que ocurre `hora` del día local `fecha`. '24:00' es la medianoche siguiente. */
export function instanteLocal(fecha: string, hora: string, zona: string): Date {
  const inicioDelDia = DateTime.fromISO(fecha, { zone: zona });
  const [h = '0', m = '0', s = '0'] = hora.split(':');
  const resultado =
    Number(h) === 24
      ? inicioDelDia.plus({ days: 1 })
      : inicioDelDia.set({ hour: Number(h), minute: Number(m), second: Number(s) });
  if (!resultado.isValid) {
    throw new Error(`Fecha u hora inválida: ${fecha} ${hora} (${zona})`);
  }
  return resultado.toJSDate();
}

/** Instante UTC en que empieza el día local `fecha` (00:00 hora del negocio). */
export function inicioDelDia(fecha: string, zona: string): Date {
  return instanteLocal(fecha, '00:00', zona);
}

/** Día de la semana de una fecha local: 1 = lunes ... 7 = domingo (igual que horarios_trabajo). */
export function diaSemanaIso(fecha: string, zona: string): number {
  return DateTime.fromISO(fecha, { zone: zona }).weekday;
}

export function sumarDias(fecha: string, dias: number): string {
  return DateTime.fromISO(fecha, { zone: 'utc' }).plus({ days: dias }).toFormat('yyyy-MM-dd');
}

/** Todas las fechas entre `desde` y `hasta`, ambas incluidas. Vacío si hasta < desde. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    fechas.push(fecha);
  }
  return fechas;
}

/** 'AAAA-MM-DD' del día local en que cae el instante. */
export function fechaLocal(instante: Date, zona: string): string {
  return local(instante, zona).toFormat('yyyy-MM-dd');
}

/** 'HH:mm' (24 horas) hora local del instante. */
export function horaLocal(instante: Date, zona: string): string {
  return local(instante, zona).toFormat('HH:mm');
}

/**
 * Sube el instante al siguiente múltiplo de `intervaloMinutos` según el reloj
 * local (con intervalo 15: 08:00, 08:15, 08:30...). Si ya está alineado, no cambia.
 */
export function redondearArriba(instante: Date, intervaloMinutos: number, zona: string): Date {
  const l = local(instante, zona);
  const msDelDia = ((l.hour * 60 + l.minute) * 60 + l.second) * 1000 + l.millisecond;
  const rejilla = intervaloMinutos * 60_000;
  const resto = msDelDia % rejilla;
  return resto === 0 ? instante : new Date(instante.getTime() + (rejilla - resto));
}

/** Instante `minutos` después de `instante` (negativo = antes). */
export function sumarMinutos(instante: Date, minutos: number): Date {
  return new Date(instante.getTime() + minutos * 60_000);
}

export function minutosEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 60_000);
}

/** 'AAAA-MM-01' del mes local en que cae el instante (el `periodo` de uso_mensual). */
export function primerDiaDelMes(instante: Date, zona: string): string {
  return local(instante, zona).startOf('month').toFormat('yyyy-MM-dd');
}
