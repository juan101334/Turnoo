import argon2 from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp, LIMITES, type Limites } from '../src/app.js';
import { ContadorPorVentana } from '../src/compartido/limite.js';
import { conNegocio } from '../src/db/contexto.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const SECRETO = 'secreto-solo-para-pruebas';
const CLAVE = 'clave-de-prueba-1';
const MINUTO = 60_000;

/** Levanta una app con los límites indicados y devuelve cómo pedirle cosas. */
async function levantar(limites: Partial<Limites>, saltosProxy = 0) {
  const servidor = crearApp({ limites, saltosProxy, whatsapp: { appSecret: SECRETO, verifyToken: 'token' } }).listen(0);
  await new Promise((r) => servidor.once('listening', r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const pedir = (ruta: string, opciones: { metodo?: string; cuerpo?: unknown; token?: string; ip?: string } = {}) =>
    fetch(base + ruta, {
      method: opciones.metodo ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opciones.token ? { authorization: `Bearer ${opciones.token}` } : {}),
        ...(opciones.ip ? { 'x-forwarded-for': opciones.ip } : {}),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  const cerrar = () => new Promise((r) => servidor.close(r));
  return { base, pedir, cerrar };
}

async function esperar429(respuesta: Response) {
  expect(respuesta.status).toBe(429);
  expect(Number(respuesta.headers.get('retry-after'))).toBeGreaterThan(0);
  // Genérico: no dice qué contador se llenó ni cuántas peticiones van.
  expect(await respuesta.json()).toEqual({
    error: { codigo: 'DEMASIADAS_PETICIONES', mensaje: 'Demasiadas peticiones. Vuelve a intentar en unos minutos' },
  });
}

describe('contador por ventana', () => {
  it('deja pasar hasta el máximo, luego dice cuánto falta y se libera al vencer la ventana', () => {
    const contador = new ContadorPorVentana({ ventanaMs: MINUTO, maximo: 2 });
    expect(contador.sumar('a', 0)).toBeNull();
    expect(contador.sumar('a', 1_000)).toBeNull();
    expect(contador.sumar('a', 30_000)).toBe(30);
    // Otra clave tiene su propio cupo.
    expect(contador.sumar('b', 30_000)).toBeNull();
    expect(contador.sumar('a', MINUTO)).toBeNull();
  });

  it('los límites por defecto son holgados para una persona', () => {
    expect(LIMITES.global).toEqual({ ventanaMs: MINUTO, maximo: 300 });
    expect(LIMITES.publicas).toEqual({ ventanaMs: 15 * MINUTO, maximo: 20 });
    expect(LIMITES.webhook).toEqual({ ventanaMs: MINUTO, maximo: 600 });
  });
});

describe('límite global por IP', () => {
  it('al pasarse responde 429 JSON genérico con Retry-After', async () => {
    const app = await levantar({ global: { ventanaMs: MINUTO, maximo: 3 } });
    try {
      for (let i = 0; i < 3; i += 1) expect((await app.pedir('/no-existe')).status).toBe(404);
      await esperar429(await app.pedir('/no-existe'));
    } finally {
      await app.cerrar();
    }
  });

  it('con SALTOS_PROXY cuenta cada IP de X-Forwarded-For por separado', async () => {
    const app = await levantar({ global: { ventanaMs: MINUTO, maximo: 1 } }, 1);
    try {
      expect((await app.pedir('/no-existe', { ip: '203.0.113.1' })).status).toBe(404);
      expect((await app.pedir('/no-existe', { ip: '203.0.113.2' })).status).toBe(404);
      expect((await app.pedir('/no-existe', { ip: '203.0.113.1' })).status).toBe(429);
    } finally {
      await app.cerrar();
    }
  });

  it('sin proxy de confianza ignora X-Forwarded-For: cambiarlo no regala cupo', async () => {
    const app = await levantar({ global: { ventanaMs: MINUTO, maximo: 1 } }, 0);
    try {
      expect((await app.pedir('/no-existe', { ip: '203.0.113.1' })).status).toBe(404);
      expect((await app.pedir('/no-existe', { ip: '203.0.113.2' })).status).toBe(429);
    } finally {
      await app.cerrar();
    }
  });
});

describe('límites de auth', () => {
  let n: NegocioDePrueba;
  beforeAll(async () => {
    n = await crearNegocio('Límites');
  });
  afterAll(limpiar);

  it('aceptar invitación y restablecer comparten un cupo por IP', async () => {
    const app = await levantar({ publicas: { ventanaMs: MINUTO, maximo: 2 } });
    try {
      const cuerpo = { token: 'no-existe', password: CLAVE };
      expect((await app.pedir('/auth/aceptar-invitacion', { metodo: 'POST', cuerpo })).status).not.toBe(429);
      expect((await app.pedir('/auth/restablecer', { metodo: 'POST', cuerpo })).status).not.toBe(429);
      await esperar429(await app.pedir('/auth/restablecer', { metodo: 'POST', cuerpo }));
    } finally {
      await app.cerrar();
    }
  });

  it('cambiar la contraseña e invitar cuentan por usuario, no por IP', async () => {
    const app = await levantar({ contrasena: { ventanaMs: MINUTO, maximo: 1 }, enlaces: { ventanaMs: MINUTO, maximo: 1 } });
    try {
      const entrar = async () => {
        const email = `${randomUUID()}@prueba.com`;
        const hash = await argon2.hash(CLAVE);
        await conNegocio(n.negocioId, (tx) =>
          tx.consultar(`INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Persona', 'dueno', true, $3)`, [
            n.negocioId,
            email,
            hash,
          ]),
        );
        const respuesta = await app.pedir('/auth/login', { metodo: 'POST', cuerpo: { email, password: CLAVE } });
        return ((await respuesta.json()) as { token: string }).token;
      };
      const uno = await entrar();
      const otro = await entrar();
      const malaContrasena = { actual: 'no-es-esta-1', nueva: 'otra-clave-nueva-1' };
      expect((await app.pedir('/auth/contrasena', { metodo: 'POST', cuerpo: malaContrasena, token: uno })).status).not.toBe(429);
      await esperar429(await app.pedir('/auth/contrasena', { metodo: 'POST', cuerpo: malaContrasena, token: uno }));
      // Otro usuario desde la misma IP todavía puede.
      expect((await app.pedir('/auth/contrasena', { metodo: 'POST', cuerpo: malaContrasena, token: otro })).status).not.toBe(429);

      const invitacion = () => ({ email: `${randomUUID()}@prueba.com`, nombre: 'Nuevo', rol: 'dueno' });
      expect((await app.pedir('/auth/usuarios/invitar', { metodo: 'POST', cuerpo: invitacion(), token: uno })).status).toBe(201);
      await esperar429(await app.pedir('/auth/usuarios/invitar', { metodo: 'POST', cuerpo: invitacion(), token: uno }));
    } finally {
      await app.cerrar();
    }
  });
});

describe('límite del webhook de WhatsApp', () => {
  const firmar = (cuerpo: string) => `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}`;

  it('la firma va antes: las peticiones sin firma no gastan el cupo de los eventos reales', async () => {
    const app = await levantar({ webhook: { ventanaMs: MINUTO, maximo: 1 } });
    try {
      const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const enviar = (firma?: string) =>
        fetch(`${app.base}/webhooks/whatsapp`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(firma ? { 'x-hub-signature-256': firma } : {}) },
          body: cuerpo,
        });
      for (let i = 0; i < 3; i += 1) expect((await enviar()).status).toBe(401);
      expect((await enviar(firmar(cuerpo))).status).toBe(200);
      await esperar429(await enviar(firmar(cuerpo)));
    } finally {
      await app.cerrar();
    }
  });
});
