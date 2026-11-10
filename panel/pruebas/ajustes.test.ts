import { describe, expect, it } from 'vitest';
import {
  avisoDeCambioDeZona,
  corrimientoDeZona,
  efectoDeCancelaciones,
  efectoDeRecordatorio,
  leerSeccion,
  mensajeDelResultado,
  momentoDelRecordatorio,
  partesConCambios,
  resumenDeSeccion,
  seccionDelCampo,
  textoDeHoras,
  textoDeMinutos,
  valoresDeConfiguracion,
} from '@/lib/ajustes';

const h = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe('secciones de Ajustes', () => {
  it('?seccion= solo acepta las que existen', () => {
    expect(leerSeccion('recordatorios')).toBe('recordatorios');
    expect(leerSeccion('datos')).toBe('datos');
    for (const otra of [null, undefined, '', 'no-existe', 'Recordatorios']) expect(leerSeccion(otra)).toBeNull();
  });

  it('cada campo sabe su sección y su parte', () => {
    expect(seccionDelCampo('zonaHoraria')).toBe('datos');
    expect(seccionDelCampo('intervaloMinutos')).toBe('agenda');
    expect(seccionDelCampo('recordatorioNoAntesDe')).toBe('recordatorios');
    expect(partesConCambios([])).toEqual([]);
    expect(partesConCambios(['horasRecordatorio'])).toEqual(['reglas']);
    expect(partesConCambios(['horasRecordatorio', 'nombre', 'maxInasistencias'])).toEqual(['datos', 'reglas']);
  });

  it('las reglas pasan a texto como en los campos (sin límite = vacío)', () => {
    expect(valoresDeConfiguracion({ intervaloMinutos: 15, maxCitasActivasCliente: null } as never)).toEqual({ intervaloMinutos: '15', maxCitasActivasCliente: '' });
  });
});

describe('mensaje después de guardar', () => {
  it('todo bien: sin mensaje (basta el aviso breve)', () => {
    expect(mensajeDelResultado({ datos: { valores: {} }, reglas: { valores: {} } })).toBeNull();
    expect(mensajeDelResultado({ reglas: { valores: {} } })).toBeNull();
  });
  it('una parte falla: dice cuál quedó y cuál no', () => {
    expect(mensajeDelResultado({ datos: { valores: {} }, reglas: { error: 'Horario malo.' } })).toBe('Se guardaron los datos del negocio, pero no las reglas: Horario malo.');
    expect(mensajeDelResultado({ datos: { error: 'Nombre malo.' }, reglas: { valores: {} } })).toBe('Se guardaron las reglas, pero no los datos del negocio: Nombre malo.');
  });
  it('todo falla', () => {
    expect(mensajeDelResultado({ reglas: { error: 'Horario malo.' } })).toBe('No se guardó: Horario malo.');
    expect(mensajeDelResultado({ datos: { error: 'A.' }, reglas: { error: 'B.' } })).toBe('No se guardó: A. B.');
  });
});

describe('textos de tiempo', () => {
  it('horas y minutos', () => {
    expect(textoDeHoras(1)).toBe('1 hora');
    expect(textoDeHoras(36)).toBe('36 horas');
    expect(textoDeHoras(48)).toBe('2 días');
    expect(textoDeHoras(24)).toBe('1 día');
    expect(textoDeMinutos(45)).toBe('45 min');
    expect(textoDeMinutos(60)).toBe('1 hora');
    expect(textoDeMinutos(90)).toBe('1 h 30 min');
  });

  it('resúmenes de la lista del celular, y sin romperse a medio escribir', () => {
    expect(resumenDeSeccion('datos', { nombre: 'Barbería La 70', zonaHoraria: 'America/Argentina/Buenos_Aires' })).toBe('Barbería La 70 · Buenos Aires');
    expect(resumenDeSeccion('agenda', { intervaloMinutos: '15', anticipacionMaxDias: '30' })).toBe('Cada 15 min · hasta 30 días adelante');
    expect(resumenDeSeccion('cancelaciones', { horasLimiteCancelacion: '0', maxInasistencias: '1' })).toBe('Cancela hasta la hora de la cita · 1 inasistencia');
    expect(resumenDeSeccion('recordatorios', { horasRecordatorio: '11', recordatorioNoAntesDe: '07:00', recordatorioNoDespuesDe: '21:00' })).toBe('11 horas antes · de 7:00 a. m. a 9:00 p. m.');
    expect(resumenDeSeccion('por-aprobar', { horasEsperaAprobacion: '24' })).toBe('1 día para aprobar');
    expect(resumenDeSeccion('asistente', { horasModoHumano: '', horasAutocompletarCita: '2' })).toBe('cierra citas tras 2 horas');
    expect(resumenDeSeccion('asistente', { horasModoHumano: '2', horasAutocompletarCita: '24' })).toBe('Pausa de 2 horas · cierra citas tras 1 día');
    expect(resumenDeSeccion('agenda', { intervaloMinutos: '', anticipacionMaxDias: 'x' })).toBe('');
  });
});

describe('línea "Con esto"', () => {
  it('cancelaciones, con singular y "hasta la hora de la cita"', () => {
    expect(efectoDeCancelaciones({ horasLimiteCancelacion: '2', maxInasistencias: '3', ventanaInasistenciasDias: '90' })).toBe(
      'Con esto: el cliente puede cancelar o cambiar su cita por WhatsApp hasta 2 horas antes. Si falta a más de 3 citas en 90 días, el asistente ya no le agenda solo.',
    );
    expect(efectoDeCancelaciones({ horasLimiteCancelacion: '0', maxInasistencias: '1', ventanaInasistenciasDias: '1' })).toBe(
      'Con esto: el cliente puede cancelar o cambiar su cita por WhatsApp hasta la hora de la cita. Si falta a más de 1 cita en 1 día, el asistente ya no le agenda solo.',
    );
    expect(efectoDeCancelaciones({ horasLimiteCancelacion: '', maxInasistencias: '1', ventanaInasistenciasDias: '1' })).toBeNull();
  });

  it('recordatorio: misma regla que el backend (al borde más cercano del horario permitido)', () => {
    const [desde, hasta] = [h('07:00'), h('21:00')];
    // Dentro del horario: tal cual.
    expect(momentoDelRecordatorio(h('16:00'), 2, desde, hasta)).toBe(h('14:00'));
    // 9:00 − 11 h = 22:00 del día anterior: el cierre (21:00) está más cerca que la apertura del día.
    expect(momentoDelRecordatorio(h('09:00'), 11, desde, hasta)).toBe(h('21:00') - 24 * 60);
    // 16:00 − 11 h = 5:00: la apertura (7:00) está más cerca que el cierre de la víspera.
    expect(momentoDelRecordatorio(h('16:00'), 11, desde, hasta)).toBe(h('07:00'));
    // 7:20 − 1 h = 6:20: la apertura (7:00) ya no alcanza (límite 6:50); queda la víspera a las 21:00.
    expect(momentoDelRecordatorio(h('07:20'), 1, desde, hasta)).toBe(h('21:00') - 24 * 60);
    // Dos días antes.
    expect(momentoDelRecordatorio(h('09:00'), 48, desde, hasta)).toBe(h('09:00') - 2 * 24 * 60);
  });

  it('recordatorio: frase con dos citas de ejemplo; nada mientras falta un dato o el horario no cuadra', () => {
    expect(efectoDeRecordatorio({ horasRecordatorio: '11', recordatorioNoAntesDe: '07:00', recordatorioNoDespuesDe: '21:00' })).toBe(
      'Con esto: una cita de las 9:00 a. m. lo recibe el día anterior a las 9:00 p. m.; una cita de las 4:00 p. m. lo recibe el mismo día a las 7:00 a. m.',
    );
    expect(efectoDeRecordatorio({ horasRecordatorio: '48', recordatorioNoAntesDe: '07:00', recordatorioNoDespuesDe: '21:00' })).toBe(
      'Con esto: una cita de las 9:00 a. m. lo recibe 2 días antes a las 9:00 a. m.; una cita de las 4:00 p. m. lo recibe 2 días antes a las 4:00 p. m.',
    );
    expect(efectoDeRecordatorio({ horasRecordatorio: '', recordatorioNoAntesDe: '07:00', recordatorioNoDespuesDe: '21:00' })).toBeNull();
    expect(efectoDeRecordatorio({ horasRecordatorio: '11', recordatorioNoAntesDe: '21:00', recordatorioNoDespuesDe: '07:00' })).toBeNull();
  });
});

describe('cambio de zona horaria', () => {
  const ahora = new Date('2026-11-09T15:00:00Z');
  it('cuánto se corren las horas que se muestran', () => {
    expect(corrimientoDeZona('America/Bogota', 'America/Mexico_City', ahora)).toBe(-60);
    expect(corrimientoDeZona('America/Bogota', 'America/Caracas', ahora)).toBe(60);
    expect(corrimientoDeZona('America/Bogota', 'America/Lima', ahora)).toBe(0);
    expect(corrimientoDeZona('America/Bogota', 'Asia/Kolkata', ahora)).toBe(630);
  });

  it('el aviso dice antes o después con un ejemplo; misma hora, sin aviso', () => {
    expect(avisoDeCambioDeZona(-60)).toContain('se verán 1 h antes (la de las 10:00 a. m. pasa a las 9:00 a. m.)');
    expect(avisoDeCambioDeZona(60)).toContain('se verán 1 h después (la de las 10:00 a. m. pasa a las 11:00 a. m.)');
    expect(avisoDeCambioDeZona(630)).toContain('se verán 10 h 30 min después (la de las 10:00 a. m. pasa a las 8:30 p. m.)');
    expect(avisoDeCambioDeZona(-120)).toContain('se verán 2 h antes');
    expect(avisoDeCambioDeZona(0)).toBeNull();
  });
});
