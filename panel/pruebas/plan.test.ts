import { describe, expect, it } from 'vitest';
import { medidor, nombreDelMes, reinicioDelMes } from '@/lib/plan';

describe('medidor', () => {
  it('sin límite no tiene porcentaje', () => {
    expect(medidor(7, null)).toEqual({ usado: 7, limite: null, porcentaje: null, nivel: 'normal' });
  });

  it('avisa desde el 80%, como el aviso de WhatsApp al dueño', () => {
    expect(medidor(39, 50).nivel).toBe('normal');
    expect(medidor(40, 50)).toEqual({ usado: 40, limite: 50, porcentaje: 80, nivel: 'alto' });
  });

  it('redondea hacia abajo: casi lleno no se muestra como 100%', () => {
    expect(medidor(199, 200)).toMatchObject({ porcentaje: 99, nivel: 'alto' });
  });

  it('lleno al llegar al límite, y la barra no pasa de 100 aunque se pase', () => {
    expect(medidor(50, 50)).toMatchObject({ porcentaje: 100, nivel: 'lleno' });
    expect(medidor(60, 50)).toMatchObject({ porcentaje: 100, nivel: 'lleno' });
  });
});

it('nombra el mes y la fecha en que se reinician los contadores', () => {
  expect(nombreDelMes('2026-11-01')).toBe('noviembre de 2026');
  expect(reinicioDelMes('2026-11-01')).toBe('1 de diciembre');
  expect(reinicioDelMes('2026-12-01')).toBe('1 de enero');
});
