import { describe, expect, it } from 'vitest';
import {
  faltaDetalle,
  haceDias,
  leerOrden,
  leerSerie,
  mesActual,
  mesElegido,
  mesVecino,
  minutosDeAudio,
  ordenar,
  porcentaje,
  seCobran,
  siguienteOrden,
  tokens,
  type ConsumoDeNegocio,
} from '@/lib/consumo';

const negocio = (nombre: string, cambios: Partial<ConsumoDeNegocio> = {}): ConsumoDeNegocio => ({
  negocioId: nombre,
  nombre,
  estado: 'activo',
  pruebaHasta: null,
  plan: null,
  conversacionesIa: 0,
  porcentajeIa: null,
  plantillas: 0,
  mensajesServicio: { total: 0, gratis: 0, cobrados: 0 },
  segundosAudio: 0,
  tokensEntrada: 0,
  tokensSalida: 0,
  citas: 0,
  citasPorEstado: { porAprobar: 0, pendientes: 0, confirmadas: 0, completadas: 0, canceladas: 0, noAsistio: 0 },
  canceladasPor: { cliente: 0, negocio: 0, sistema: 0 },
  porcentajeNoAsistio: null,
  porcentajeCancelacion: null,
  derivaciones: 0,
  fallos: { recordatorios: 0, avisos: 0, mensajes: 0 },
  fallosDeEnvio: 0,
  diasSinActividad: null,
  costo: null,
  margenCop: null,
  ...cambios,
});

describe('mes del panel de uso', () => {
  it('el mes actual es el de Bogotá, no el de UTC', () => {
    // 1 de diciembre a las 03:00 UTC todavía es 30 de noviembre en Bogotá.
    expect(mesActual(new Date('2026-12-01T03:00:00Z'))).toBe('2026-11');
  });

  it('un mes mal escrito o futuro se toma como el actual', () => {
    const ahora = new Date('2026-11-15T12:00:00Z');
    expect(mesElegido('2026-09', ahora)).toBe('2026-09');
    expect(mesElegido('2026-11', ahora)).toBe('2026-11');
    for (const raro of [undefined, '', '2026-13', '2026-9', 'noviembre', '2026-12', '2027-01', '../x']) {
      expect(mesElegido(raro, ahora), String(raro)).toBe('2026-11');
    }
  });

  it('el mes vecino cruza el año', () => {
    expect(mesVecino('2026-01', -1)).toBe('2025-12');
    expect(mesVecino('2026-12', 1)).toBe('2027-01');
  });
});

describe('orden de la tabla por negocio', () => {
  const lista = [
    negocio('Ébano', { porcentajeIa: 40, citas: 3 }),
    negocio('barbería Zeta', { porcentajeIa: 95, citas: 3 }),
    negocio('Alfa', { porcentajeIa: null, citas: 10 }),
  ];
  const nombres = (orden: Parameters<typeof ordenar>[1]) => ordenar(lista, orden).map((n) => n.nombre);

  it('por nombre no distingue tildes ni mayúsculas', () => {
    expect(nombres({ columna: 'nombre', direccion: 'asc' })).toEqual(['Alfa', 'barbería Zeta', 'Ébano']);
    expect(nombres({ columna: 'nombre', direccion: 'desc' })).toEqual(['Ébano', 'barbería Zeta', 'Alfa']);
  });

  it('los que no tienen dato van al final en los dos sentidos', () => {
    expect(nombres({ columna: 'ia', direccion: 'desc' })).toEqual(['barbería Zeta', 'Ébano', 'Alfa']);
    expect(nombres({ columna: 'ia', direccion: 'asc' })).toEqual(['Ébano', 'barbería Zeta', 'Alfa']);
  });

  it('los empates quedan por nombre', () => {
    expect(nombres({ columna: 'citas', direccion: 'desc' })).toEqual(['Alfa', 'barbería Zeta', 'Ébano']);
  });

  it('no cambia la lista que recibe', () => {
    ordenar(lista, { columna: 'citas', direccion: 'desc' });
    expect(lista[0]!.nombre).toBe('Ébano');
  });

  it('lee el orden de la URL y descarta columnas que no existen', () => {
    expect(leerOrden({})).toEqual({ columna: 'nombre', direccion: 'asc' });
    expect(leerOrden({ orden: 'ia' })).toEqual({ columna: 'ia', direccion: 'desc' });
    expect(leerOrden({ orden: 'ia', dir: 'asc' })).toEqual({ columna: 'ia', direccion: 'asc' });
    expect(leerOrden({ orden: 'constructor', dir: 'desc' })).toEqual({ columna: 'nombre', direccion: 'asc' });
    expect(leerOrden({ orden: 'citas', dir: 'x' })).toEqual({ columna: 'citas', direccion: 'desc' });
  });

  it('tocar la misma columna le da la vuelta; otra empieza por el mayor (el margen, por el menor)', () => {
    expect(siguienteOrden({ columna: 'ia', direccion: 'desc' }, 'ia')).toEqual({ columna: 'ia', direccion: 'asc' });
    expect(siguienteOrden({ columna: 'ia', direccion: 'desc' }, 'citas')).toEqual({ columna: 'citas', direccion: 'desc' });
    expect(siguienteOrden({ columna: 'ia', direccion: 'desc' }, 'margen')).toEqual({ columna: 'margen', direccion: 'asc' });
    expect(siguienteOrden({ columna: 'ia', direccion: 'desc' }, 'nombre')).toEqual({ columna: 'nombre', direccion: 'asc' });
  });
});

describe('formato', () => {
  it('tokens en corto', () => {
    expect(tokens(950)).toBe('950');
    expect(tokens(12_300)).toBe('12,3 mil');
    expect(tokens(1_500_000)).toBe('1,5 M');
  });

  it('audio en minutos, porcentajes y días', () => {
    expect(minutosDeAudio(0)).toBe('0 min');
    expect(minutosDeAudio(90)).toBe('1,5 min');
    expect(porcentaje(33.3)).toBe('33,3%');
    expect(porcentaje(80)).toBe('80%');
    expect(haceDias(null)).toBe('Nunca');
    expect(haceDias(0)).toBe('Hoy');
    expect(haceDias(1)).toBe('Hace 1 día');
    expect(haceDias(14)).toBe('Hace 14 días');
  });
});

describe('gráfico diario', () => {
  it('la serie de la URL, o las respuestas del asistente', () => {
    expect(leerSerie('citas')).toBe('citas');
    expect(leerSerie(undefined)).toBe('ia');
    expect(leerSerie('toString')).toBe('ia');
  });

  it('avisa si el mes empieza antes del primer día con detalle', () => {
    expect(faltaDetalle('2026-11', null)).toBe(true);
    expect(faltaDetalle('2026-11', '2026-11-15')).toBe(true);
    expect(faltaDetalle('2026-11', '2026-11-01')).toBe(false);
    expect(faltaDetalle('2026-12', '2026-11-15')).toBe(false);
    expect(faltaDetalle('2026-10', '2026-11-15')).toBe(true);
  });
});

describe('seCobran', () => {
  it('va en singular solo con 1', () => {
    expect(seCobran(0)).toBe('0 se cobran');
    expect(seCobran(1)).toBe('1 se cobra');
    expect(seCobran(1500)).toBe('1.500 se cobran');
  });
});
