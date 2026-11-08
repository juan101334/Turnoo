import { describe, expect, it } from 'vitest';
import { minutosRestantes, tiempoRestante } from '@/lib/tiempo-restante';

describe('minutosRestantes', () => {
  const ahora = Date.parse('2026-11-08T12:00:00Z');

  it('cuenta minutos enteros, redondeando hacia abajo', () => {
    expect(minutosRestantes('2026-11-08T12:30:59Z', ahora)).toBe(30);
    expect(minutosRestantes('2026-11-08T12:00:59Z', ahora)).toBe(0);
  });

  it('acepta la hora como número o como Date', () => {
    expect(minutosRestantes('2026-11-08T13:00:00Z', new Date(ahora))).toBe(60);
  });

  it('es negativo cuando ya pasó', () => {
    expect(minutosRestantes('2026-11-08T11:58:00Z', ahora)).toBe(-2);
    expect(tiempoRestante('2026-11-08T11:58:00Z', ahora)).toBe('vencido');
  });
});
