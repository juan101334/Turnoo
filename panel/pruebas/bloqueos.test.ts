import { describe, expect, it } from 'vitest';
import { citasQueSeCruzan, describirBloqueo, rangoDelBloqueo, type Bloqueo } from '@/lib/bloqueos';
import type { Cita, EstadoCita } from '@/lib/citas';

const BOGOTA = 'America/Bogota';
const formulario = { fechaDesde: '2026-11-10', horaDesde: '12:00', fechaHasta: '', horaHasta: '13:00', todoElDia: false };

describe('rango del bloqueo en la zona del negocio', () => {
  it('unas horas de un día', () => {
    expect(rangoDelBloqueo(formulario, BOGOTA)).toEqual({ inicio: '2026-11-10T12:00:00.000-05:00', fin: '2026-11-10T13:00:00.000-05:00' });
  });

  it('todo el día va de 00:00 a 00:00 del día siguiente; varios días, hasta el siguiente al último', () => {
    expect(rangoDelBloqueo({ ...formulario, todoElDia: true }, BOGOTA)).toEqual({
      inicio: '2026-11-10T00:00:00.000-05:00',
      fin: '2026-11-11T00:00:00.000-05:00',
    });
    expect(rangoDelBloqueo({ ...formulario, fechaHasta: '2026-11-12', todoElDia: true }, BOGOTA)).toEqual({
      inicio: '2026-11-10T00:00:00.000-05:00',
      fin: '2026-11-13T00:00:00.000-05:00',
    });
  });

  it('rechaza lo que no cuadra, con un mensaje claro', () => {
    expect(rangoDelBloqueo({ ...formulario, fechaDesde: '' }, BOGOTA)).toEqual({ error: 'Elige el día en que empieza.' });
    expect(rangoDelBloqueo({ ...formulario, horaHasta: '' }, BOGOTA)).toHaveProperty('error');
    expect(rangoDelBloqueo({ ...formulario, horaHasta: '11:00' }, BOGOTA)).toEqual({ error: 'El bloqueo debe terminar después de empezar.' });
    expect(rangoDelBloqueo({ ...formulario, horaDesde: '25:00' }, BOGOTA)).toHaveProperty('error');
  });
});

describe('citas que se cruzan con un bloqueo', () => {
  const cita = (id: string, profesionalId: string, inicio: string, fin: string, estado: EstadoCita = 'pendiente') =>
    ({ id, profesionalId, inicio, fin, estado }) as Cita;
  const citas = [
    cita('dentro', 'b1', '2026-11-10T17:00:00Z', '2026-11-10T17:30:00Z'),
    cita('borde', 'b1', '2026-11-10T16:30:00Z', '2026-11-10T17:00:00Z'), // termina justo cuando empieza el bloqueo
    cita('otro-barbero', 'b2', '2026-11-10T17:00:00Z', '2026-11-10T17:30:00Z'),
    cita('cancelada', 'b1', '2026-11-10T17:15:00Z', '2026-11-10T17:45:00Z', 'cancelada'),
  ];
  const bloqueo: Bloqueo = { id: 'x', profesionalId: 'b1', inicio: '2026-11-10T17:00:00Z', fin: '2026-11-10T18:00:00Z', motivo: null };

  it('solo las activas del mismo barbero que se solapan', () => {
    expect(citasQueSeCruzan(bloqueo, citas).map((c) => c.id)).toEqual(['dentro']);
  });

  it('un cierre del negocio afecta a todos los barberos', () => {
    expect(citasQueSeCruzan({ ...bloqueo, profesionalId: null }, citas).map((c) => c.id)).toEqual(['dentro', 'otro-barbero']);
  });
});

describe('cómo se describe un bloqueo', () => {
  it('unas horas, un día completo y varios días', () => {
    expect(describirBloqueo({ inicio: '2026-11-10T17:00:00Z', fin: '2026-11-10T18:00:00Z' }, BOGOTA)).toMatch(/^martes 10 de noviembre · 12:00\sp\.\s?m\. a 1:00\sp\.\s?m\.$/);
    expect(describirBloqueo({ inicio: '2026-11-10T05:00:00Z', fin: '2026-11-11T05:00:00Z' }, BOGOTA)).toBe('martes 10 de noviembre · todo el día');
    expect(describirBloqueo({ inicio: '2026-11-10T05:00:00Z', fin: '2026-11-13T05:00:00Z' }, BOGOTA)).toBe('Del martes 10 de noviembre al jueves 12 de noviembre');
  });
});
