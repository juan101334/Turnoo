import { describe, expect, it } from 'vitest';
import { porcentajeUsado } from '@/lib/conocimiento';
import { asistenteCallaHasta, nombreDelCliente, textoDelMensaje, ventanaHasta } from '@/lib/conversaciones';

describe('ventanaHasta', () => {
  it('son 24 h desde el último mensaje del CLIENTE, no del negocio', () => {
    const hasta = ventanaHasta([
      { direccion: 'entrante', creadoEn: '2026-11-08T10:00:00Z' },
      { direccion: 'entrante', creadoEn: '2026-11-08T12:00:00Z' },
      { direccion: 'saliente', creadoEn: '2026-11-08T15:00:00Z' },
    ]);
    expect(hasta?.toISOString()).toBe('2026-11-09T12:00:00.000Z');
  });

  it('sin mensajes del cliente no hay ventana', () => {
    expect(ventanaHasta([{ direccion: 'saliente', creadoEn: '2026-11-08T10:00:00Z' }])).toBeNull();
  });
});

describe('asistenteCallaHasta', () => {
  const ahora = new Date('2026-11-08T12:00:00Z');

  it('calla las horas del negocio desde que una persona tomó la conversación', () => {
    expect(asistenteCallaHasta({ estado: 'humano', humanoDesde: '2026-11-08T10:00:00Z' }, 4, ahora)?.toISOString()).toBe('2026-11-08T14:00:00.000Z');
  });

  it('pasado ese tiempo, o si la atiende el asistente, ya no calla', () => {
    expect(asistenteCallaHasta({ estado: 'humano', humanoDesde: '2026-11-08T07:00:00Z' }, 4, ahora)).toBeNull();
    expect(asistenteCallaHasta({ estado: 'humano', humanoDesde: '2026-11-08T08:00:00Z' }, 4, ahora)).toBeNull();
    expect(asistenteCallaHasta({ estado: 'bot', humanoDesde: null }, 4, ahora)).toBeNull();
  });
});

describe('textoDelMensaje', () => {
  const base = { contenido: null, transcripcion: null, tieneImagen: false };
  it('muestra la nota de voz con su transcripción, o avisa que no la hay', () => {
    expect(textoDelMensaje({ ...base, tipo: 'audio', transcripcion: 'quiero un corte' })).toBe('Nota de voz: "quiero un corte"');
    expect(textoDelMensaje({ ...base, tipo: 'audio' })).toBe('Nota de voz (no se pudo transcribir)');
  });

  it('una imagen sin texto y un tipo desconocido tienen su rótulo', () => {
    expect(textoDelMensaje({ ...base, tipo: 'imagen', tieneImagen: true })).toBe('Imagen');
    expect(textoDelMensaje({ ...base, tipo: 'otro' })).toMatch(/no puede mostrar/);
    expect(textoDelMensaje({ ...base, tipo: 'texto', contenido: 'Hola' })).toBe('Hola');
  });
});

it('el cliente sin nombre se muestra con su teléfono', () => {
  const legible = (t: string) => `+${t}`;
  expect(nombreDelCliente({ id: 'x', nombre: 'Ana', telefono: '573001112233' }, legible)).toBe('Ana');
  expect(nombreDelCliente({ id: 'x', nombre: null, telefono: '573001112233' }, legible)).toBe('+573001112233');
  expect(nombreDelCliente({ id: 'x', nombre: null, telefono: null }, legible)).toBe('Cliente sin nombre');
});

it('porcentajeUsado queda entre 0 y 100', () => {
  expect(porcentajeUsado(5_000, 20_000)).toBe(25);
  expect(porcentajeUsado(64, 20_000)).toBe(1);
  expect(porcentajeUsado(0, 20_000)).toBe(0);
  expect(porcentajeUsado(25_000, 20_000)).toBe(100);
  expect(porcentajeUsado(0, 0)).toBe(100);
});
