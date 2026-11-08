import { describe, expect, it } from 'vitest';
import { ipDelCliente } from '@/lib/ip';

describe('IP real del usuario', () => {
  it('sin proxy propio (0 saltos) ignora la cabecera: la escribió el navegador', () => {
    expect(ipDelCliente('203.0.113.10', 0)).toBeNull();
  });

  it('detrás de Caddy (1 salto) toma la IP que Caddy agregó al final', () => {
    expect(ipDelCliente('203.0.113.10', 1)).toBe('203.0.113.10');
  });

  it('descarta lo que el navegador escribió antes: no se puede hacer pasar por otra IP', () => {
    // El navegador mandó "198.51.100.99"; Caddy agregó la IP real al final.
    expect(ipDelCliente('198.51.100.99, 203.0.113.10', 1)).toBe('203.0.113.10');
    expect(ipDelCliente('1.1.1.1,2.2.2.2 , 203.0.113.10', 1)).toBe('203.0.113.10');
  });

  it('con dos proxies cuenta desde el final', () => {
    expect(ipDelCliente('198.51.100.99, 203.0.113.10, 10.0.0.2', 2)).toBe('203.0.113.10');
  });

  it('acepta IPv6', () => {
    expect(ipDelCliente('2001:db8::1', 1)).toBe('2001:db8::1');
  });

  it('sin cabecera, con menos entradas que saltos o con algo que no es una IP, no hay IP', () => {
    expect(ipDelCliente(null, 1)).toBeNull();
    expect(ipDelCliente('', 1)).toBeNull();
    expect(ipDelCliente('203.0.113.10', 2)).toBeNull();
    expect(ipDelCliente('no-es-ip', 1)).toBeNull();
    expect(ipDelCliente('203.0.113.10:4321', 1)).toBeNull();
  });
});
