import { describe, expect, it } from 'vitest';
import { diasDeLaTira } from '@/lib/fechas';
import { mascaraDeBordes, pasoDeSemana } from '@/lib/fila-deslizable';

describe('fila deslizable', () => {
  it('el degradado va solo en el borde que todavía tiene más', () => {
    expect(mascaraDeBordes({ antes: false, despues: false })).toBeUndefined();
    expect(mascaraDeBordes({ antes: false, despues: true })).toBe('linear-gradient(to right, black, black, black calc(100% - 2rem), transparent)');
    expect(mascaraDeBordes({ antes: true, despues: false })).toBe('linear-gradient(to right, transparent, black 2rem, black, black)');
    expect(mascaraDeBordes({ antes: true, despues: true })).toBe('linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent)');
  });

  it('"Semana siguiente" mueve 7 días, o lo que se ve si caben menos', () => {
    // 64 px por día (56 + 8 de separación).
    expect(pasoDeSemana(64, 1000)).toBe(448);
    expect(pasoDeSemana(64, 300)).toBe(256);
    // Nunca menos de un día.
    expect(pasoDeSemana(64, 40)).toBe(64);
  });
});

describe('días de la tira', () => {
  it('desde hoy, los días pedidos', () => {
    const dias = diasDeLaTira('2026-11-12', '2026-11-10', 42);
    expect(dias).toHaveLength(42);
    expect(dias[0]).toBe('2026-11-10');
    expect(dias.at(-1)).toBe('2026-12-21');
  });

  it('el último día que cabe todavía empieza en hoy', () => {
    expect(diasDeLaTira('2026-11-23', '2026-11-10', 14)[0]).toBe('2026-11-10');
  });

  it('un día elegido fuera de la tira (antes o después) la hace empezar en él', () => {
    expect(diasDeLaTira('2026-11-24', '2026-11-10', 14)[0]).toBe('2026-11-24');
    expect(diasDeLaTira('2026-11-01', '2026-11-10', 14)[0]).toBe('2026-11-01');
  });
});
