import { describe, expect, it } from 'vitest';
import { cifrar, claveDeTokens, descifrar, TextoCifradoInvalido } from '../src/compartido/cifrado.js';

const CLAVE = Buffer.alloc(32, 7);
const OTRA = Buffer.alloc(32, 8);

describe('cifrado de tokens', () => {
  it('descifra lo que cifró, incluso con tildes y emojis', () => {
    const texto = 'EAAG-token.de_prueba ñ ☕';
    expect(descifrar(cifrar(texto, CLAVE), CLAVE)).toBe(texto);
  });

  it('el texto cifrado no contiene el original y cambia cada vez (IV nuevo)', () => {
    const texto = 'token-que-no-debe-verse';
    const uno = cifrar(texto, CLAVE);
    const dos = cifrar(texto, CLAVE);
    expect(uno).not.toContain(texto);
    expect(uno).not.toBe(dos);
    expect(uno.startsWith('v1.')).toBe(true);
  });

  it('con otra clave no descifra', () => {
    expect(() => descifrar(cifrar('secreto', CLAVE), OTRA)).toThrow(TextoCifradoInvalido);
  });

  it('detecta cualquier alteración del texto cifrado', () => {
    const partes = cifrar('secreto largo para alterar', CLAVE).split('.');
    for (const indice of [1, 2, 3]) {
      const alterada = [...partes];
      const bytes = Buffer.from(alterada[indice]!, 'base64url');
      bytes[0] = bytes[0]! ^ 1;
      alterada[indice] = bytes.toString('base64url');
      expect(() => descifrar(alterada.join('.'), CLAVE)).toThrow(TextoCifradoInvalido);
    }
  });

  it('rechaza un texto válido con otra versión', () => {
    const otraVersion = cifrar('secreto', CLAVE).replace(/^v1\./, 'v2.');
    expect(() => descifrar(otraVersion, CLAVE)).toThrow(TextoCifradoInvalido);
  });

  it.each(['sin-uso-por-ahora', '', 'v2.a.b.c', 'v1.a.b', 'v1...'])('rechaza el formato %j', (valor) => {
    expect(() => descifrar(valor, CLAVE)).toThrow(TextoCifradoInvalido);
  });

  it('exige una clave de 32 bytes', () => {
    expect(() => cifrar('x', Buffer.alloc(16))).toThrow();
    expect(() => descifrar(cifrar('x', CLAVE), Buffer.alloc(31))).toThrow();
  });

  it('toma la clave del entorno (la de pruebas)', () => {
    expect(claveDeTokens()).toEqual(Buffer.alloc(32, 1));
  });
});
