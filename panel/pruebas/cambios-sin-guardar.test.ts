import { describe, expect, it } from 'vitest';
import { debeAvisar, esIOS, navegaAqui } from '@/lib/cambios-sin-guardar';

const aqui = new URL('http://localhost:3001/clientes/1/editar');
const nunca = () => false;
const destino = (ruta: string) => new URL(ruta, aqui);

describe('qué enlaces preguntan antes de salir', () => {
  it('otra página del panel pregunta', () => {
    expect(debeAvisar(destino('/clientes/1'), aqui, nunca)).toBe(true);
    expect(debeAvisar(destino('/clientes/1/editar?x=1'), aqui, nunca)).toBe(true);
  });

  it('la misma página o solo un #ancla no pierden nada', () => {
    expect(debeAvisar(destino('/clientes/1/editar'), aqui, nunca)).toBe(false);
    expect(debeAvisar(destino('/clientes/1/editar#notas'), aqui, nunca)).toBe(false);
  });

  it('otro sitio u otro protocolo: avisa el navegador (beforeunload), no el panel', () => {
    expect(debeAvisar(new URL('https://wa.me/573001234567'), aqui, nunca)).toBe(false);
    expect(debeAvisar(new URL('mailto:hola@turnoo.co'), aqui, nunca)).toBe(false);
    expect(debeAvisar(new URL('tel:+573001234567'), aqui, nunca)).toBe(false);
  });

  it('lo que la pantalla marca como seguro no pregunta', () => {
    const ajustes = new URL('http://localhost:3001/negocio?seccion=datos');
    const mismaPantalla = (d: URL) => d.pathname === '/negocio';
    expect(debeAvisar(new URL('/negocio?seccion=agenda', ajustes), ajustes, mismaPantalla)).toBe(false);
    expect(debeAvisar(new URL('/hoy', ajustes), ajustes, mismaPantalla)).toBe(true);
  });
});

describe('qué clics navegan en esta pestaña', () => {
  const normal = { boton: 0, conTecla: false, target: '', descarga: false };
  it('clic izquierdo normal, o con target="_self"', () => {
    expect(navegaAqui(normal)).toBe(true);
    expect(navegaAqui({ ...normal, target: '_self' })).toBe(true);
  });
  it('clic central, con tecla, en otra pestaña o descarga: no', () => {
    expect(navegaAqui({ ...normal, boton: 1 })).toBe(false);
    expect(navegaAqui({ ...normal, conTecla: true })).toBe(false);
    expect(navegaAqui({ ...normal, target: '_blank' })).toBe(false);
    expect(navegaAqui({ ...normal, descarga: true })).toBe(false);
  });
});

describe('iPhone y iPad (sin aviso al recargar)', () => {
  it('reconoce iPhone, iPad y el iPad que se presenta como Mac', () => {
    expect(esIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(esIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad', 5)).toBe(true);
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });
  it('un Mac de verdad, Android o Windows, no', () => {
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(esIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 'Linux armv81', 5)).toBe(false);
    expect(esIOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0)).toBe(false);
  });
});
