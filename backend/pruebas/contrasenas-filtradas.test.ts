import argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatosInvalidos } from '../src/compartido/errores.js';
import { estaFiltrada, URL_PWNED } from '../src/compartido/contrasenas-filtradas.js';
import { entorno } from '../src/config/entorno.js';
import { conNegocio } from '../src/db/contexto.js';
import { aceptarInvitacion, iniciarSesion, invitarUsuario } from '../src/modulos/auth/auth.servicio.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const FILTRADA = 'contrasena-filtrada-de-prueba';
const BUENA = 'contrasena-buena-de-prueba';
const sha1 = (texto: string) => createHash('sha1').update(texto).digest('hex').toUpperCase();

/** Responde como Pwned Passwords: los finales del hash que empiezan igual, con su cuenta. */
function pwnedFalso(filtradas: string[], relleno = 3) {
  return vi.fn<typeof fetch>(async (url) => {
    const prefijo = String(url).slice(URL_PWNED.length);
    const lineas = filtradas.map(sha1).filter((h) => h.startsWith(prefijo)).map((h) => `${h.slice(5)}:42`);
    // Filas de relleno con cuenta 0, como cuando se pide Add-Padding.
    for (let i = 0; i < relleno; i += 1) lineas.push(`${sha1(`relleno-${i}`).slice(5)}:0`);
    return new Response(lineas.join('\r\n'), { status: 200 });
  });
}

describe('contraseñas filtradas (Pwned Passwords)', () => {
  it('apagada: no pregunta nada', async () => {
    const pedir = pwnedFalso([FILTRADA]);
    expect(await estaFiltrada(FILTRADA, { activa: false, pedir })).toBe(false);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('k-anonimato: solo viajan los 5 primeros caracteres del hash', async () => {
    const pedir = pwnedFalso([FILTRADA]);
    expect(await estaFiltrada(FILTRADA, { activa: true, pedir })).toBe(true);
    const [url, init] = pedir.mock.calls[0]!;
    expect(url).toBe(URL_PWNED + sha1(FILTRADA).slice(0, 5));
    const enviado = JSON.stringify([url, init?.headers]);
    expect(enviado).not.toContain(FILTRADA);
    expect(enviado).not.toContain(sha1(FILTRADA).slice(5));
    expect((init?.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('una que no está, o que solo coincide con el relleno (cuenta 0), se acepta', async () => {
    expect(await estaFiltrada(BUENA, { activa: true, pedir: pwnedFalso([FILTRADA]) })).toBe(false);
    const soloRelleno = vi.fn<typeof fetch>(async () => new Response(`${sha1(BUENA).slice(5)}:0`, { status: 200 }));
    expect(await estaFiltrada(BUENA, { activa: true, pedir: soloRelleno })).toBe(false);
  });

  it('falla abierta: si el servicio falla, tarda o responde con error, se acepta', async () => {
    const caido = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await estaFiltrada(FILTRADA, { activa: true, pedir: caido })).toBe(false);
    const error = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }));
    expect(await estaFiltrada(FILTRADA, { activa: true, pedir: error })).toBe(false);
    // Nunca responde: solo el tiempo límite lo corta.
    const colgado = vi.fn<typeof fetch>(
      (_url, init) => new Promise((_resolver, rechazar) => init!.signal!.addEventListener('abort', () => rechazar(init!.signal!.reason))),
    );
    const inicio = Date.now();
    expect(await estaFiltrada(FILTRADA, { activa: true, pedir: colgado, tiempoMs: 50 })).toBe(false);
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  describe('al poner una contraseña nueva', () => {
    let n: NegocioDePrueba;
    beforeAll(async () => {
      n = await crearNegocio('Contraseñas filtradas');
    });
    afterEach(() => {
      entorno.REVISAR_CONTRASENAS_FILTRADAS = false;
      vi.unstubAllGlobals();
    });
    afterAll(limpiar);

    it('activada, rechaza la filtrada sin gastar la invitación; con otra, entra', async () => {
      const email = `${randomUUID()}@prueba.com`;
      await conNegocio(n.negocioId, (tx) =>
        tx.consultar(`INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Dueña', 'dueno', true, $3)`, [n.negocioId, email, '']),
      );
      await conNegocio(n.negocioId, async (tx) => tx.consultar('UPDATE usuarios SET password_hash = $2 WHERE email = $1', [email, await argon2.hash(BUENA)]));
      const actor = (await iniciarSesion(email, BUENA)).usuario;
      const invitada = `${randomUUID()}@prueba.com`;
      const { token } = await invitarUsuario(actor, { email: invitada, nombre: 'Invitada', rol: 'dueno' });

      entorno.REVISAR_CONTRASENAS_FILTRADAS = true;
      vi.stubGlobal('fetch', pwnedFalso([FILTRADA]));
      await expect(aceptarInvitacion(token, FILTRADA)).rejects.toThrow(DatosInvalidos);
      await aceptarInvitacion(token, BUENA);
      expect((await iniciarSesion(invitada, BUENA)).usuario.rol).toBe('dueno');
    });
  });
});
