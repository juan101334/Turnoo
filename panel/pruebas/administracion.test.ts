import { describe, expect, it } from 'vitest';
import {
  accionesDeUsuario,
  cambiosDeConfiguracion,
  GRUPOS_DE_CONFIGURACION,
  horaLegible,
  horariosPorDia,
  leerEntero,
  leerPesos,
  mensajeConEnlace,
  nombreDelDia,
  type Configuracion,
} from '@/lib/administracion';

describe('horario semanal', () => {
  it('nombra los días como el backend: 1 lunes, 7 domingo', () => {
    expect(nombreDelDia(1)).toBe('Lunes');
    expect(nombreDelDia(7)).toBe('Domingo');
    expect(nombreDelDia(8)).toBe('Día');
  });

  it('agrupa por día, en orden, con los rangos de la mañana a la noche', () => {
    const dias = horariosPorDia([
      { id: 'b', diaSemana: 1, horaInicio: '14:00', horaFin: '20:00' },
      { id: 'a', diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
      { id: 'c', diaSemana: 7, horaInicio: '09:00', horaFin: '13:00' },
    ]);
    expect(dias).toHaveLength(7);
    expect(dias[0]!.rangos.map((r) => r.id)).toEqual(['a', 'b']);
    expect(dias[1]!.rangos).toEqual([]);
    expect(dias[6]!.rangos.map((r) => r.id)).toEqual(['c']);
  });

  it('muestra la hora como la lee la gente', () => {
    expect(horaLegible('08:00')).toBe('8:00 a. m.');
    expect(horaLegible('12:30')).toBe('12:30 p. m.');
    expect(horaLegible('13:05')).toBe('1:05 p. m.');
    expect(horaLegible('00:00')).toBe('12:00 a. m.');
    expect(horaLegible('24:00')).toBe('12:00 a. m.');
  });
});

describe('números del formulario', () => {
  it('lee precios escritos de cualquier forma', () => {
    expect(leerPesos('25.000')).toBe(25000);
    expect(leerPesos('$25,000')).toBe(25000);
    expect(leerPesos('0')).toBe(0);
    expect(leerPesos('gratis')).toBeNull();
    expect(leerPesos('1234567890')).toBeNull();
  });

  it('lee enteros y rechaza decimales o texto', () => {
    expect(leerEntero(' 45 ')).toBe(45);
    expect(leerEntero('4.5')).toBeNull();
    expect(leerEntero('-1')).toBeNull();
    expect(leerEntero('')).toBeNull();
  });
});

describe('accionesDeUsuario', () => {
  const yo = 'yo';
  it('a un barbero activo: enlace de recuperación y desactivar', () => {
    expect(accionesDeUsuario({ id: 'x', rol: 'empleado', estado: 'activo' }, yo)).toEqual(['recuperacion', 'desactivar']);
  });

  it('a un barbero pendiente o desactivado: reenviar invitación (es la forma de reactivarlo)', () => {
    expect(accionesDeUsuario({ id: 'x', rol: 'empleado', estado: 'pendiente' }, yo)).toEqual(['reenviarInvitacion', 'desactivar']);
    expect(accionesDeUsuario({ id: 'x', rol: 'empleado', estado: 'desactivado' }, yo)).toEqual(['reenviarInvitacion']);
  });

  it('a otro dueño no se le generan enlaces; a uno mismo no se le desactiva', () => {
    expect(accionesDeUsuario({ id: 'x', rol: 'dueno', estado: 'activo' }, yo)).toEqual(['desactivar']);
    expect(accionesDeUsuario({ id: yo, rol: 'dueno', estado: 'activo' }, yo)).toEqual([]);
  });
});

it('el mensaje de WhatsApp lleva el enlace completo', () => {
  const m = mensajeConEnlace('invitacion', 'Barbería Sol', 'https://app.turnooapp.com/aceptar-invitacion#token=abc');
  expect(m).toContain('Barbería Sol');
  expect(m).toContain('https://app.turnooapp.com/aceptar-invitacion#token=abc');
});

describe('cambiosDeConfiguracion', () => {
  const actual: Configuracion = {
    intervaloMinutos: 15,
    anticipacionMinMinutos: 60,
    anticipacionMaxDias: 30,
    maxCitasActivasCliente: 2,
    horasLimiteCancelacion: 2,
    horasRecordatorio: 24,
    recordatorioNoAntesDe: '08:00',
    recordatorioNoDespuesDe: '20:00',
    maxInasistencias: 3,
    ventanaInasistenciasDias: 90,
    horasEsperaAprobacion: 4,
    aprobacionMinutosAntesCita: 60,
    horasModoHumano: 12,
    horasAutocompletarCita: 24,
  };
  const formulario = (cambios: Partial<Record<keyof Configuracion, string>> = {}) => (clave: keyof Configuracion) =>
    cambios[clave] ?? (actual[clave] === null ? '' : String(actual[clave]));

  it('sin cambios no envía nada', () => {
    expect(cambiosDeConfiguracion(formulario(), actual)).toEqual({ cambios: {} });
  });

  it('envía solo lo que cambió, con su tipo', () => {
    expect(cambiosDeConfiguracion(formulario({ intervaloMinutos: '30', recordatorioNoAntesDe: '09:00' }), actual)).toEqual({
      cambios: { intervaloMinutos: 30, recordatorioNoAntesDe: '09:00' },
    });
  });

  it('vacío en "citas activas por cliente" es sin límite (null)', () => {
    expect(cambiosDeConfiguracion(formulario({ maxCitasActivasCliente: '' }), actual)).toEqual({ cambios: { maxCitasActivasCliente: null } });
  });

  it('vacío en un campo obligatorio o fuera de rango es un error con el nombre del campo', () => {
    expect(cambiosDeConfiguracion(formulario({ horasRecordatorio: '' }), actual)).toEqual({ error: 'Recordar la cita: escribe un número entre 1 y 168.' });
    expect(cambiosDeConfiguracion(formulario({ anticipacionMaxDias: '400' }), actual)).toEqual({ error: 'Agendar como máximo con: escribe un número entre 1 y 365.' });
    expect(cambiosDeConfiguracion(formulario({ intervaloMinutos: '7' }), actual)).toEqual({ error: 'Horas que se ofrecen cada: elige una de las opciones.' });
    expect(cambiosDeConfiguracion(formulario({ recordatorioNoDespuesDe: '25:00' }), actual)).toEqual({ error: 'Ni después de las: escribe una hora.' });
  });

  it('una sección mira solo sus campos: los de otras no se leen ni se envían', () => {
    const recordatorios = GRUPOS_DE_CONFIGURACION.find((g) => g.id === 'recordatorios')!.campos;
    // En el formulario de Recordatorios no vienen los demás campos: leerlos daría vacío.
    const soloRecordatorios = (clave: keyof Configuracion) =>
      recordatorios.some((c) => c.clave === clave) ? (clave === 'horasRecordatorio' ? '12' : String(actual[clave])) : '';
    expect(cambiosDeConfiguracion(soloRecordatorios, actual, recordatorios)).toEqual({ cambios: { horasRecordatorio: 12 } });
  });
});
