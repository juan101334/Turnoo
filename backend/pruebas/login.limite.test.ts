import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { DemasiadosIntentos, NoAutorizado } from '../src/compartido/errores.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { redDeLaIp } from '../src/modulos/auth/auth.intentos.js';
import { iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const MALA = 'clave-incorrecta-1';
const AHORA = new Date('2030-06-10T15:00:00Z');
const despues = (segundos: number, desde = AHORA) => new Date(desde.getTime() + segundos * 1000);

let ips = 0;
/** IP distinta en cada llamada, para que las pruebas no se estorben entre sí. */
const nuevaIp = () => {
  ips += 1;
  return `10.${Math.floor(ips / 65536) % 256}.${Math.floor(ips / 256) % 256}.${ips % 256}`;
};

describe('límite de intentos de login', () => {
  let n: NegocioDePrueba;

  beforeAll(async () => {
    n = await crearNegocio('Login');
  });
  afterAll(limpiar);

  async function usuario(): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const hash = await argon2.hash(CLAVE);
    await conNegocio(n.negocioId, (tx) =>
      tx.consultar(
        `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
         VALUES ($1, $2, 'Persona', 'dueno', true, $3)`,
        [n.negocioId, email, hash],
      ),
    );
    return email;
  }

  const correoInexistente = () => `${randomUUID()}@prueba.com`;
  const intento = (email: string, clave: string, ip: string | null, ahora = AHORA) =>
    iniciarSesion(email, clave, ahora, ip).catch((e: unknown) => e);

  async function fallar(email: string, ip: string, veces: number, ahora = AHORA) {
    for (let i = 0; i < veces; i += 1) {
      expect(await intento(email, MALA, ip, ahora)).toBeInstanceOf(NoAutorizado);
    }
  }

  describe('por cuenta e IP', () => {
    it('al sexto intento responde 429, aunque la contraseña sea correcta', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 5);
      expect(await intento(email, MALA, ip)).toBeInstanceOf(DemasiadosIntentos);
      expect(await intento(email, CLAVE, ip)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('un correo inexistente se comporta igual: no revela cuáles existen', async () => {
      const email = correoInexistente();
      const ip = nuevaIp();
      await fallar(email, ip, 5);
      expect(await intento(email, MALA, ip)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('un atacante no le cierra la cuenta a su dueño desde otra IP', async () => {
      const email = await usuario();
      await fallar(email, nuevaIp(), 5);
      expect(await intento(email, CLAVE, nuevaIp())).toMatchObject({ token: expect.any(String) });
    });

    it('insistir ya frenado no acerca el límite de la cuenta', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 5);
      for (let i = 0; i < 25; i += 1) {
        expect(await intento(email, MALA, ip)).toBeInstanceOf(DemasiadosIntentos);
      }
      expect(await intento(email, CLAVE, nuevaIp())).toMatchObject({ token: expect.any(String) });
    });

    it('mayúsculas y espacios en el correo cuentan como la misma cuenta', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 3);
      await fallar(email.toUpperCase(), ip, 1);
      await fallar(`  ${email} `, ip, 1);
      expect(await intento(email, CLAVE, ip)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('un login correcto reinicia el contador', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 4);
      expect(await intento(email, CLAVE, ip)).toMatchObject({ token: expect.any(String) });
      await fallar(email, ip, 5);
      expect(await intento(email, MALA, ip)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('los logins correctos nunca frenan a nadie', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      for (let i = 0; i < 35; i += 1) {
        expect(await intento(email, CLAVE, ip)).toMatchObject({ token: expect.any(String) });
      }
    });

    it('datos que no llegan a verificarse no gastan intentos', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      for (let i = 0; i < 6; i += 1) {
        expect(await intento(email, 'x'.repeat(129), ip)).toBeInstanceOf(NoAutorizado);
      }
      expect(await intento(email, CLAVE, ip)).toMatchObject({ token: expect.any(String) });
    });
  });

  describe('ventana de tiempo', () => {
    it('sigue frenado hasta el último segundo, y a los 15 minutos vuelve a contar desde cero', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 5);
      expect(await intento(email, CLAVE, ip, despues(15 * 60 - 1))).toBeInstanceOf(DemasiadosIntentos);

      const nueva = despues(15 * 60);
      await fallar(email, ip, 5, nueva);
      expect(await intento(email, MALA, ip, nueva)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('fallar no alarga la ventana', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 4);
      await fallar(email, ip, 1, despues(14 * 60));
      expect(await intento(email, CLAVE, ip, despues(15 * 60))).toMatchObject({ token: expect.any(String) });
    });

    it('indica cuánto falta según el contador que frenó', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      await fallar(email, ip, 5);
      const error = (await intento(email, MALA, ip, despues(60))) as DemasiadosIntentos;
      expect(error.reintentarEnSegundos).toBe(14 * 60);
      expect(error.message).toBe('Demasiados intentos. Vuelve a intentar en 14 minuto(s)');
    });
  });

  describe('por cuenta', () => {
    it('un ataque repartido entre IP se frena a los 20 intentos, desde cualquier IP', async () => {
      const email = await usuario();
      for (let i = 0; i < 4; i += 1) await fallar(email, nuevaIp(), 5);
      expect(await intento(email, CLAVE, nuevaIp())).toBeInstanceOf(DemasiadosIntentos);
    });

    it('sin IP conocida aplica solo este contador', async () => {
      const email = await usuario();
      for (let i = 0; i < 20; i += 1) expect(await intento(email, MALA, null)).toBeInstanceOf(NoAutorizado);
      expect(await intento(email, CLAVE, null)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('un login correcto de otra IP no reinicia el contador de la cuenta', async () => {
      const email = await usuario();
      for (let i = 0; i < 3; i += 1) await fallar(email, nuevaIp(), 5);
      await fallar(email, nuevaIp(), 4);
      expect(await intento(email, CLAVE, nuevaIp())).toMatchObject({ token: expect.any(String) });
      await fallar(email, nuevaIp(), 1);
      expect(await intento(email, CLAVE, nuevaIp())).toBeInstanceOf(DemasiadosIntentos);
    });
  });

  describe('por IP', () => {
    it('probar muchas cuentas se frena a los 30 intentos, sin afectar a otras IP', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 30; i += 1) await fallar(correoInexistente(), ip, 1);
      const victima = await usuario();
      expect(await intento(victima, CLAVE, ip)).toBeInstanceOf(DemasiadosIntentos);
      expect(await intento(victima, CLAVE, nuevaIp())).toMatchObject({ token: expect.any(String) });
    });

    it('entrar a una cuenta propia no le limpia el contador al atacante', async () => {
      const ip = nuevaIp();
      const propia = await usuario();
      for (let i = 0; i < 29; i += 1) await fallar(correoInexistente(), ip, 1);
      expect(await intento(propia, CLAVE, ip)).toMatchObject({ token: expect.any(String) });
      await fallar(correoInexistente(), ip, 1);
      expect(await intento(correoInexistente(), MALA, ip)).toBeInstanceOf(DemasiadosIntentos);
    });

    it('las direcciones de una misma red IPv6 /64 comparten contador', async () => {
      const email = await usuario();
      for (let i = 1; i <= 5; i += 1) await fallar(email, `2001:db8:1:2::${i}`, 1);
      expect(await intento(email, CLAVE, '2001:db8:1:2:ffff::9')).toBeInstanceOf(DemasiadosIntentos);
      expect(await intento(email, CLAVE, '2001:db8:1:3::1')).toMatchObject({ token: expect.any(String) });
    });
  });

  describe('peticiones simultáneas', () => {
    it('no pasan más intentos que el límite, y no hay bloqueos mutuos', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      const resultados = await Promise.all(Array.from({ length: 20 }, () => intento(email, MALA, ip)));
      expect(resultados.filter((r) => r instanceof NoAutorizado)).toHaveLength(5);
      expect(resultados.filter((r) => r instanceof DemasiadosIntentos)).toHaveLength(15);
    });

    it('logins correctos y fallidos a la vez no fallan por bloqueos', async () => {
      const email = await usuario();
      const ip = nuevaIp();
      const resultados = await Promise.all(
        Array.from({ length: 16 }, (_, i) => intento(email, i % 2 ? CLAVE : MALA, i % 4 < 2 ? ip : nuevaIp())),
      );
      for (const r of resultados) {
        expect(r instanceof NoAutorizado || r instanceof DemasiadosIntentos || 'token' in (r as object)).toBe(true);
      }
    });
  });

  describe('almacenamiento', () => {
    it('no guarda ni el correo ni la IP en texto legible', async () => {
      const email = await usuario();
      const ip = '198.51.100.77';
      await fallar(email, ip, 1);
      const { rows } = await conSistema((tx) => tx.consultar<{ clave: string }>('SELECT clave FROM intentos_login'));
      expect(rows.length).toBeGreaterThan(0);
      for (const { clave } of rows) expect(clave).toMatch(/^[0-9a-f]{64}$/);
    });

    it('la tabla solo es visible en el contexto de sistema', async () => {
      await fallar(correoInexistente(), nuevaIp(), 1);
      const filas = await conNegocio(n.negocioId, (tx) => tx.consultar('SELECT 1 FROM intentos_login'));
      expect(filas.rowCount).toBe(0);
      await expect(
        conNegocio(n.negocioId, (tx) =>
          tx.consultar("INSERT INTO intentos_login VALUES ('x', 0, now())"),
        ),
      ).rejects.toThrow();
    });
  });

  describe('redDeLaIp', () => {
    it.each([
      ['192.0.2.1', '192.0.2.1'],
      ['::ffff:192.0.2.1', '192.0.2.1'],
      ['::FFFF:192.0.2.1', '192.0.2.1'],
      ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
      ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
      ['2001:0DB8:0001:0002::1', '2001:db8:1:2::/64'],
      ['2001:db8::1', '2001:db8:0:0::/64'],
      ['fe80::1%eth0', 'fe80:0:0:0::/64'],
      ['::1', '0:0:0:0::/64'],
    ])('%s cuenta como %s', (ip, red) => {
      expect(redDeLaIp(ip)).toBe(red);
    });
  });

  describe('por HTTP', () => {
    const conApp = async (saltosProxy: number, trabajo: (base: string) => Promise<void>) => {
      const servidor = crearApp({ saltosProxy }).listen(0);
      await new Promise((r) => servidor.once('listening', r));
      try {
        await trabajo(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}`);
      } finally {
        await new Promise((r) => servidor.close(r));
      }
    };

    const login = (base: string, email: string, password: string, reenvio?: string) =>
      fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(reenvio ? { 'x-forwarded-for': reenvio } : {}) },
        body: JSON.stringify({ email, password }),
      });

    it('responde 429 con Retry-After y el formato de error del proyecto', async () => {
      await conApp(0, async (base) => {
        const email = correoInexistente();
        for (let i = 0; i < 5; i += 1) expect((await login(base, email, MALA)).status).toBe(401);
        const r = await login(base, email, MALA);
        expect(r.status).toBe(429);
        const segundos = Number(r.headers.get('retry-after'));
        expect(segundos).toBeGreaterThan(0);
        expect(segundos).toBeLessThanOrEqual(900);
        expect((await r.json()).error.codigo).toBe('DEMASIADOS_INTENTOS');
      });
    });

    it('sin proxy declarado, falsificar X-Forwarded-For no evade el límite', async () => {
      await conApp(0, async (base) => {
        const email = correoInexistente();
        for (let i = 0; i < 5; i += 1) await login(base, email, MALA, nuevaIp());
        expect((await login(base, email, MALA, nuevaIp())).status).toBe(429);
      });
    });

    it('con un proxy, cuenta la IP que agregó el proxy y no la que escribió el cliente', async () => {
      await conApp(1, async (base) => {
        const email = correoInexistente();
        const real = nuevaIp();
        for (let i = 0; i < 5; i += 1) await login(base, email, MALA, `${nuevaIp()}, ${real}`);
        expect((await login(base, email, MALA, `${nuevaIp()}, ${real}`)).status).toBe(429);
        // Otra persona detrás del mismo proxy tiene su propio contador.
        expect((await login(base, email, MALA, nuevaIp())).status).toBe(401);
      });
    });
  });
});
