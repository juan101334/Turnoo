import pino from 'pino';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { enmascararTelefono, errorParaLog, OPCIONES_DE_REGISTRO } from '../src/compartido/logger.js';

/** Un logger con las mismas opciones que el de la app, que escribe en memoria. */
function registrar(objeto: object, mensaje = 'prueba'): Record<string, unknown> {
  let salida = '';
  const destino = new Writable({
    write(trozo, _codificacion, listo) {
      salida += String(trozo);
      listo();
    },
  });
  pino({ level: 'info', ...OPCIONES_DE_REGISTRO }, destino).info(objeto, mensaje);
  return JSON.parse(salida) as Record<string, unknown>;
}

describe('logs sin datos sensibles', () => {
  it('oculta contraseñas, tokens, cookies y la cabecera de autorización, también anidados', () => {
    const linea = registrar({
      password: 'clave-1',
      cuerpo: { contrasena: 'clave-2', actual: 'clave-3', nueva: 'clave-4', token: 'tok-1' },
      req: { headers: { authorization: 'Bearer abc', cookie: 'turnoo_sesion=xyz', 'set-cookie': ['a=b'], 'x-hub-signature-256': 'sha256=f' } },
      cuenta: { meta: { accessToken: 'EAA-1', token_acceso_cifrado: 'v1:...' } },
    });
    const texto = JSON.stringify(linea);
    for (const secreto of ['clave-1', 'clave-2', 'clave-3', 'clave-4', 'tok-1', 'Bearer abc', 'xyz', 'a=b', 'sha256=f', 'EAA-1', 'v1:...']) {
      expect(texto).not.toContain(secreto);
    }
    expect(linea.password).toBe('[oculto]');
    expect((linea.req as { headers: Record<string, unknown> }).headers.authorization).toBe('[oculto]');
  });

  it('los teléfonos quedan con los 4 últimos dígitos', () => {
    const linea = registrar({ telefono: '+57 300 123 4567', cliente: { waUserId: '573001234567' }, aviso: { negocio: { telefonoAvisos: '573009998877' } } });
    expect(linea.telefono).toBe('***4567');
    expect((linea.cliente as Record<string, unknown>).waUserId).toBe('***4567');
    expect(((linea.aviso as Record<string, unknown>).negocio as Record<string, unknown>).telefonoAvisos).toBe('***8877');
  });

  it('un número de teléfono dentro de un texto (el error de Meta) también se enmascara', () => {
    const linea = registrar({ detalle: 'Recipient +573001234567 is not a valid WhatsApp user', fallo: { mensaje: 'wa_id 573109876543 bloqueado' } });
    expect(linea.detalle).toBe('Recipient ***4567 is not a valid WhatsApp user');
    expect((linea.fallo as Record<string, unknown>).mensaje).toBe('wa_id ***6543 bloqueado');
  });

  it('no toca ids ni uuids, ni lo que no es sensible', () => {
    const linea = registrar({ negocioId: '0b5c3f1e-1234-4abc-8def-123456789012', phoneNumberId: '109876543210987', cantidad: 12, duracionMs: 1500 });
    expect(linea).toMatchObject({ negocioId: '0b5c3f1e-1234-4abc-8def-123456789012', phoneNumberId: '109876543210987', cantidad: 12, duracionMs: 1500 });
  });

  it('un error conserva su mensaje y su pila', () => {
    const linea = registrar({ err: errorParaLog(new Error('falló la consulta')) });
    expect((linea.err as Record<string, unknown>).mensaje).toBe('falló la consulta');
    expect(String((linea.err as Record<string, unknown>).stack)).toContain('Error: falló la consulta');
    const directo = registrar({ err: new Error('sin envolver') });
    expect((directo.err as Record<string, unknown>).message).toBe('sin envolver');
  });

  it('enmascarar: corto o sin dígitos queda oculto entero', () => {
    expect(enmascararTelefono('123')).toBe('[oculto]');
    expect(enmascararTelefono({ a: 1 })).toBe('[oculto]');
    expect(enmascararTelefono(573001234567)).toBe('***4567');
  });
});
