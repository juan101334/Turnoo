import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { entorno } from '../config/entorno.js';
import { NoConfigurado } from './errores.js';

/**
 * Cifrado de secretos que se guardan en la base (los tokens de Meta), con AES-256-GCM.
 * La clave vive en el entorno y nunca en la base: quien obtenga una copia de la base
 * no puede usar los tokens. GCM además detecta si alguien alteró el texto cifrado.
 *
 * Formato: `v1.<iv>.<etiqueta>.<datos>`, en base64url. La versión permite cambiar
 * de algoritmo o de clave más adelante sin confundir los valores viejos.
 */

const VERSION = 'v1';
const BYTES_IV = 12; // el tamaño recomendado para GCM
const BYTES_CLAVE = 32;

export class TextoCifradoInvalido extends Error {
  constructor() {
    super('El texto cifrado no es válido o la clave no corresponde');
    this.name = 'TextoCifradoInvalido';
  }
}

/** La clave del entorno, o un error claro si no está configurada. */
export function claveDeTokens(): Buffer {
  if (!entorno.CLAVE_CIFRADO_TOKENS) {
    throw new NoConfigurado('Falta CLAVE_CIFRADO_TOKENS: no se pueden guardar ni usar tokens de WhatsApp');
  }
  return Buffer.from(entorno.CLAVE_CIFRADO_TOKENS, 'base64');
}

function exigirClave(clave: Buffer): void {
  if (clave.length !== BYTES_CLAVE) throw new Error(`La clave de cifrado debe tener ${BYTES_CLAVE} bytes`);
}

export function cifrar(texto: string, clave: Buffer): string {
  exigirClave(clave);
  // Un IV nuevo cada vez: con GCM, repetir IV y clave rompe la seguridad.
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return [VERSION, iv, etiqueta, datos].map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url'))).join('.');
}

/** Lanza TextoCifradoInvalido si el formato no sirve, si fue alterado o si la clave es otra. */
export function descifrar(textoCifrado: string, clave: Buffer): string {
  exigirClave(clave);
  const partes = textoCifrado.split('.');
  if (partes.length !== 4 || partes[0] !== VERSION) throw new TextoCifradoInvalido();
  const [iv, etiqueta, datos] = partes.slice(1).map((parte) => Buffer.from(parte, 'base64url'));
  if (iv!.length !== BYTES_IV || etiqueta!.length !== 16) throw new TextoCifradoInvalido();
  try {
    const descifrador = createDecipheriv('aes-256-gcm', clave, iv!);
    descifrador.setAuthTag(etiqueta!);
    return Buffer.concat([descifrador.update(datos!), descifrador.final()]).toString('utf8');
  } catch {
    throw new TextoCifradoInvalido();
  }
}
