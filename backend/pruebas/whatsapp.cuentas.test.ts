import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { claveDeTokens, descifrar } from '../src/compartido/cifrado.js';
import { NoConfigurado } from '../src/compartido/errores.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { buscarCuentaWhatsapp } from '../src/db/previas.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const TOKEN_META = 'EAAtoken-de-prueba-para-rutas-0001';

describe('rutas de cuentas de WhatsApp', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  const superadmins: string[] = [];
  const tokens = {} as Record<'superadmin' | 'duenoA' | 'empleadoA', string>;
  let ids = 0;

  const nuevoId = () => `${Date.now()}${String(++ids).padStart(3, '0')}`;

  async function usuario(n: NegocioDePrueba | null, rol: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
                 VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, await argon2.hash(CLAVE)];
    const { rows } = n
      ? await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))
      : await conSistema((tx) => tx.consultar<{ id: string }>(sql, params));
    if (!n) superadmins.push(rows[0]!.id);
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE }),
    });
    return (await r.json()).token as string;
  }

  const pedir = (ruta: string, token: string | undefined, metodo = 'GET', cuerpo?: unknown) =>
    fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });

  const entrada = (extra: object = {}) => ({
    phoneNumberId: nuevoId(),
    wabaId: '1534000000000000',
    numeroVisible: '+57 300 123 4567',
    token: TOKEN_META,
    ...extra,
  });

  const tokenGuardado = (n: NegocioDePrueba, cuentaId: string) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<{ token_acceso_cifrado: string }>(
          'SELECT token_acceso_cifrado FROM whatsapp_cuentas WHERE id = $1',
          [cuentaId],
        )
      ).rows[0]?.token_acceso_cifrado,
    );

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    tokens.superadmin = await usuario(null, 'superadmin');
    tokens.duenoA = await usuario(a, 'dueno');
    tokens.empleadoA = await usuario(a, 'empleado');
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
  });

  it('el superadmin registra una cuenta: el token queda cifrado y nunca se devuelve', async () => {
    const datos = entrada();
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp`, tokens.superadmin, 'POST', datos);
    expect(r.status).toBe(201);
    const texto = await r.text();
    expect(texto).not.toContain(TOKEN_META);
    const cuenta = JSON.parse(texto);
    expect(cuenta).toEqual({
      id: expect.any(String),
      phoneNumberId: datos.phoneNumberId,
      wabaId: datos.wabaId,
      numeroVisible: '573001234567',
      activa: true,
      createdAt: expect.any(String),
    });

    const guardado = await tokenGuardado(a, cuenta.id);
    expect(guardado).not.toContain(TOKEN_META);
    expect(descifrar(guardado!, claveDeTokens())).toBe(TOKEN_META);

    // El webhook la encuentra por su phone_number_id.
    expect(await buscarCuentaWhatsapp(datos.phoneNumberId)).toMatchObject({ cuentaId: cuenta.id, negocioId: a.negocioId });
  });

  it('la lista muestra las cuentas del negocio, sin token, y no las de otro', async () => {
    const deA = await registrarCuenta(a.negocioId, entrada());
    const deB = await registrarCuenta(b.negocioId, entrada());
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp`, tokens.superadmin);
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain(TOKEN_META);
    const ids = JSON.parse(texto).cuentas.map((c: { id: string }) => c.id);
    expect(ids).toContain(deA.id);
    expect(ids).not.toContain(deB.id);
  });

  it('cambia el token (rotación), el número visible y la desactiva', async () => {
    const cuenta = await registrarCuenta(a.negocioId, entrada());
    const antes = await tokenGuardado(a, cuenta.id);
    const nuevo = 'EAAotro-token-rotado-0000000002';
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp/${cuenta.id}`, tokens.superadmin, 'PATCH', {
      token: nuevo,
      numeroVisible: '3009998877',
      activa: false,
    });
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain(nuevo);
    expect(JSON.parse(texto)).toMatchObject({ numeroVisible: '573009998877', activa: false });
    const despues = await tokenGuardado(a, cuenta.id);
    expect(despues).not.toBe(antes);
    expect(descifrar(despues!, claveDeTokens())).toBe(nuevo);
    // Desactivada, el webhook ya no la reconoce.
    expect(await buscarCuentaWhatsapp(cuenta.phoneNumberId)).toBeNull();
  });

  it('cambiar solo un dato deja los demás como estaban', async () => {
    const cuenta = await registrarCuenta(a.negocioId, entrada());
    const antes = await tokenGuardado(a, cuenta.id);
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp/${cuenta.id}`, tokens.superadmin, 'PATCH', { activa: false });
    expect(await r.json()).toMatchObject({ numeroVisible: '573001234567', activa: false });
    expect(await tokenGuardado(a, cuenta.id)).toBe(antes);
  });

  it('un phone_number_id ya registrado, aunque sea de otro negocio, responde 409', async () => {
    const datos = entrada();
    await registrarCuenta(b.negocioId, datos);
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp`, tokens.superadmin, 'POST', { ...datos });
    expect(r.status).toBe(409);
  });

  it.each([
    [{}, 'vacío'],
    [{ phoneNumberId: 'abc' }, 'id no numérico'],
    [{ wabaId: '12 34' }, 'waba con espacios'],
    [{ numeroVisible: '12' }, 'número corto'],
    [{ token: 'corto' }, 'token corto'],
    [{ token: 'EAA token con espacios dentro 123' }, 'token con espacios'],
    [{ activa: false }, 'campo que no corresponde'],
  ])('rechaza al crear %j (%s) con 400', async (cambio, _caso) => {
    const cuerpo = Object.keys(cambio).length === 0 ? {} : entrada(cambio);
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp`, tokens.superadmin, 'POST', cuerpo);
    expect(r.status).toBe(400);
  });

  it('al cambiar rechaza un cuerpo vacío o campos que no corresponden', async () => {
    const cuenta = await registrarCuenta(a.negocioId, entrada());
    for (const cuerpo of [{}, { phoneNumberId: '1' }, { negocioId: b.negocioId }]) {
      expect((await pedir(`/negocios/${a.negocioId}/whatsapp/${cuenta.id}`, tokens.superadmin, 'PATCH', cuerpo)).status).toBe(400);
    }
  });

  it('negocio inexistente o id mal escrito: 404 o 400', async () => {
    expect((await pedir(`/negocios/${randomUUID()}/whatsapp`, tokens.superadmin)).status).toBe(404);
    expect((await pedir(`/negocios/${randomUUID()}/whatsapp`, tokens.superadmin, 'POST', entrada())).status).toBe(404);
    expect((await pedir('/negocios/no-es-uuid/whatsapp', tokens.superadmin)).status).toBe(400);
  });

  it('no se puede cambiar la cuenta de otro negocio usando la URL de este', async () => {
    const deB = await registrarCuenta(b.negocioId, entrada());
    const antes = await tokenGuardado(b, deB.id);
    const r = await pedir(`/negocios/${a.negocioId}/whatsapp/${deB.id}`, tokens.superadmin, 'PATCH', {
      token: 'EAAintento-de-cambiar-otro-negocio',
    });
    expect(r.status).toBe(404);
    expect(await tokenGuardado(b, deB.id)).toBe(antes);
  });

  it('solo el superadmin: dueño, empleado y sin sesión no entran', async () => {
    const cuenta = await registrarCuenta(a.negocioId, entrada());
    for (const token of [tokens.duenoA, tokens.empleadoA]) {
      expect((await pedir(`/negocios/${a.negocioId}/whatsapp`, token)).status).toBe(403);
      expect((await pedir(`/negocios/${a.negocioId}/whatsapp`, token, 'POST', entrada())).status).toBe(403);
      expect((await pedir(`/negocios/${a.negocioId}/whatsapp/${cuenta.id}`, token, 'PATCH', { activa: false })).status).toBe(403);
    }
    expect((await pedir(`/negocios/${a.negocioId}/whatsapp`, undefined)).status).toBe(401);
  });

  it('sin clave de cifrado no guarda nada', async () => {
    const datos = entrada();
    const sinClave = () => {
      throw new NoConfigurado('Falta CLAVE_CIFRADO_TOKENS');
    };
    await expect(registrarCuenta(a.negocioId, datos, sinClave)).rejects.toThrow(NoConfigurado);
    expect(await buscarCuentaWhatsapp(datos.phoneNumberId)).toBeNull();
  });
});
