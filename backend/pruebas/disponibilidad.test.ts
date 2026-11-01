import { describe, expect, it } from 'vitest';
import { horaLocal, instanteLocal } from '../src/compartido/tiempo.js';
import { calcularHuecos, type EntradaDisponibilidad } from '../src/modulos/citas/disponibilidad.js';

/**
 * Pruebas del cálculo puro de disponibilidad (sin base de datos).
 * 2030-06-10 es lunes (dia_semana = 1). Zona: Bogotá (UTC-5, sin horario de verano).
 */

const ZONA = 'America/Bogota';
const LUNES = '2030-06-10';

const local = (hhmm: string, dia = LUNES) => instanteLocal(dia, hhmm, ZONA);
const rango = (inicio: string, fin: string) => ({ inicio: local(inicio), fin: local(fin) });

/** Horas 'HH:mm' desde `desde` hasta `hasta`, ambas incluidas, de `paso` en `paso` minutos. */
function cada(desde: string, hasta: string, paso = 15): string[] {
  const horas: string[] = [];
  const aMinutos = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  for (let m = aMinutos(desde); m <= aMinutos(hasta); m += paso) {
    horas.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return horas;
}

function entrada(cambios: Partial<EntradaDisponibilidad> = {}): EntradaDisponibilidad {
  return {
    zonaHoraria: ZONA,
    fechas: [LUNES],
    horarios: [{ diaSemana: 1, horaInicio: '08:00:00', horaFin: '12:00:00' }],
    ocupados: [],
    duracionMinutos: 30,
    intervaloMinutos: 15,
    ahora: new Date('2030-06-09T12:00:00Z'), // domingo 7 a. m. en Bogotá
    anticipacionMinMinutos: 0,
    anticipacionMaxDias: 30,
    ...cambios,
  };
}

const horas = (e: EntradaDisponibilidad) => calcularHuecos(e).map((h) => horaLocal(h.inicio, ZONA));

describe('calcularHuecos', () => {
  it('propone inicios cada 15 minutos mientras quepa la duración completa', () => {
    expect(horas(entrada())).toEqual(cada('08:00', '11:30'));
  });

  it('una duración mayor deja menos inicios al final del rango', () => {
    expect(horas(entrada({ duracionMinutos: 45 }))).toEqual(cada('08:00', '11:15'));
  });

  it('devuelve inicio y fin correctos en UTC', () => {
    const [primero] = calcularHuecos(entrada());
    expect(primero?.inicio.toISOString()).toBe('2030-06-10T13:00:00.000Z'); // 08:00 en Bogotá
    expect(primero?.fin.toISOString()).toBe('2030-06-10T13:30:00.000Z');
  });

  it('no devuelve nada si el barbero no trabaja ese día de la semana', () => {
    const e = entrada({ horarios: [{ diaSemana: 2, horaInicio: '08:00:00', horaFin: '12:00:00' }] });
    expect(horas(e)).toEqual([]);
  });

  it('con dos rangos en el día, el hueco del almuerzo no tiene horarios', () => {
    const e = entrada({
      horarios: [
        { diaSemana: 1, horaInicio: '08:00:00', horaFin: '12:00:00' },
        { diaSemana: 1, horaInicio: '14:00:00', horaFin: '19:00:00' },
      ],
    });
    expect(horas(e)).toEqual([...cada('08:00', '11:30'), ...cada('14:00', '18:30')]);
  });

  it('respeta una cita existente y vuelve a ofrecer horas cuando termina', () => {
    const e = entrada({ ocupados: [rango('09:00', '09:45')] });
    expect(horas(e)).toEqual([...cada('08:00', '08:30'), ...cada('09:45', '11:30')]);
  });

  it('un bloqueo de todo el día no deja horarios', () => {
    expect(horas(entrada({ ocupados: [rango('00:00', '23:59')] }))).toEqual([]);
  });

  it('alinea los inicios al reloj aunque la cita anterior termine a una hora "rara"', () => {
    const e = entrada({ ocupados: [rango('09:00', '09:50')] });
    const resultado = horas(e);
    expect(resultado).not.toContain('09:50');
    expect(resultado).toEqual([...cada('08:00', '08:30'), ...cada('10:00', '11:30')]);
  });

  it('con intervalo de 30 minutos solo ofrece :00 y :30', () => {
    expect(horas(entrada({ intervaloMinutos: 30 }))).toEqual(cada('08:00', '11:30', 30));
  });

  it('ofrece un hueco que mide justo lo que dura el servicio', () => {
    const e = entrada({
      horarios: [{ diaSemana: 1, horaInicio: '08:00:00', horaFin: '10:00:00' }],
      ocupados: [rango('08:30', '09:00')],
    });
    expect(horas(e)).toEqual(['08:00', '09:00', '09:15', '09:30']);
  });

  it('no ofrece un hueco más corto que el servicio', () => {
    const e = entrada({
      horarios: [{ diaSemana: 1, horaInicio: '08:00:00', horaFin: '09:00:00' }],
      ocupados: [rango('08:20', '08:45')],
      duracionMinutos: 30,
    });
    expect(horas(e)).toEqual([]);
  });

  it('une bloqueos y citas que se solapan entre sí', () => {
    const e = entrada({ ocupados: [rango('09:00', '10:00'), rango('09:30', '10:30'), rango('09:30', '10:30')] });
    expect(horas(e)).toEqual([...cada('08:00', '08:30'), ...cada('10:30', '11:30')]);
  });

  it('respeta la anticipación mínima', () => {
    const e = entrada({ ahora: local('08:00'), anticipacionMinMinutos: 60 });
    expect(horas(e)[0]).toBe('09:00');
  });

  it('descarta todo lo anterior a "ahora"', () => {
    const e = entrada({ ahora: local('10:00') });
    expect(horas(e)).toEqual(cada('10:00', '11:30'));
  });

  it('respeta la anticipación máxima en días', () => {
    const e = entrada({
      fechas: [LUNES, '2030-06-17'],
      horarios: [{ diaSemana: 1, horaInicio: '08:00:00', horaFin: '09:00:00' }],
      anticipacionMaxDias: 3,
    });
    const huecos = calcularHuecos(e);
    expect(huecos.length).toBeGreaterThan(0);
    expect(huecos.every((h) => h.inicio.toISOString().startsWith('2030-06-10'))).toBe(true);
  });

  it('calcula varios días y los devuelve en orden', () => {
    const e = entrada({
      fechas: [LUNES, '2030-06-17'],
      horarios: [{ diaSemana: 1, horaInicio: '08:00:00', horaFin: '08:30:00' }],
      anticipacionMaxDias: 30,
    });
    const inicios = calcularHuecos(e).map((h) => h.inicio.toISOString());
    expect(inicios).toEqual([...inicios].sort());
    expect(inicios).toHaveLength(2);
  });

  it('acepta un horario que termina a medianoche (24:00)', () => {
    const e = entrada({ horarios: [{ diaSemana: 1, horaInicio: '22:00:00', horaFin: '24:00:00' }] });
    expect(horas(e)).toEqual(cada('22:00', '23:30'));
  });
});
