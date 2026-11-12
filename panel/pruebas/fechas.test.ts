import { describe, expect, it } from 'vitest';
import { diaRelativo, esFechaValida, fechaDe, fechaLarga, finDelDia, horaLocal, hoyEn, limitesDelDia, sumarDias, tiempoRestante } from '@/lib/fechas';

const BOGOTA = 'America/Bogota';

describe('fechas en la zona del negocio', () => {
  it('"hoy" es el día del negocio, no el de UTC', () => {
    // 03:00 UTC del 9 de noviembre = 22:00 del 8 en Bogotá.
    expect(hoyEn(BOGOTA, new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-08');
    expect(hoyEn('UTC', new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-09');
  });

  it('los límites del día van de 00:00 a 00:00 del día siguiente, con la zona', () => {
    expect(limitesDelDia('2026-11-08', BOGOTA)).toEqual({ desde: '2026-11-08T00:00:00.000-05:00', hasta: '2026-11-09T00:00:00.000-05:00' });
  });

  it('hora y fecha local de un instante', () => {
    expect(horaLocal('2026-11-08T20:30:00Z', BOGOTA)).toMatch(/^3:30\sp\.\s?m\.$/);
    expect(fechaDe('2026-11-09T03:00:00Z', BOGOTA)).toBe('2026-11-08');
    expect(fechaLarga('2026-11-08')).toBe('domingo 8 de noviembre');
  });

  it('días relativos y suma de días', () => {
    expect(diaRelativo('2026-11-08', '2026-11-08')).toBe('Hoy');
    expect(diaRelativo('2026-11-09', '2026-11-08')).toBe('Mañana');
    expect(diaRelativo('2026-11-07', '2026-11-08')).toBe('Ayer');
    expect(diaRelativo('2026-11-12', '2026-11-08')).toBeNull();
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('solo acepta fechas AAAA-MM-DD que existen', () => {
    expect(esFechaValida('2026-11-08')).toBe(true);
    for (const mala of ['2026-02-30', '08-11-2026', '2026-11-8', '', undefined, null, '2026-11-08T00:00']) expect(esFechaValida(mala)).toBe(false);
  });

  it('tiempo que queda para aprobar', () => {
    const ahora = new Date('2026-11-08T12:00:00Z');
    expect(tiempoRestante('2026-11-08T13:20:00Z', ahora)).toBe('en 1 h 20 min');
    expect(tiempoRestante('2026-11-08T14:00:00Z', ahora)).toBe('en 2 h');
    expect(tiempoRestante('2026-11-08T12:05:30Z', ahora)).toBe('en 5 min');
    expect(tiempoRestante('2026-11-08T12:00:00Z', ahora)).toBe('vencido');
  });
});

describe('fin del día', () => {
  it('es el último instante del día en la zona del negocio, no en UTC', () => {
    const fin = finDelDia('2026-12-10', 'America/Bogota');
    expect(fin).toBe('2026-12-10T23:59:59.999-05:00');
    expect(fechaDe(fin, 'America/Bogota')).toBe('2026-12-10');
  });
});
