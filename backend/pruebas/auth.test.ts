import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { DatosInvalidos, NoAutorizado, NoEncontrado, Prohibido, Duplicado } from '../src/compartido/errores.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import {
  aceptarInvitacion,
  autenticar,
  cerrarSesion,
  generarRecuperacion,
  iniciarSesion,
  invitarSuperadmin,
  invitarUsuario,
  restablecerContrasena,
} from '../src/modulos/auth/auth.servicio.js';
import type { Rol, UsuarioAutenticado } from '../src/modulos/auth/auth.tipos.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const ahora = new Date('2030-06-09T12:00:00Z');
const dias = (d: number) => new Date(ahora.getTime() + d * 86_400_000);
const horas = (h: number) => new Date(ahora.getTime() + h * 3_600_000);
const correo = () => `${randomUUID()}@prueba.com`;
const superadminsCreados: string[] = [];

/** Usuario ya activo, con contraseña, creado directo en la base. */
async function crearUsuario(n: NegocioDePrueba | null, rol: Rol, clave = CLAVE) {
  const email = correo();
  const hash = await argon2.hash(clave);
  const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
               VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
  const params = [n?.negocioId ?? null, email, rol, hash];
  const id = n
    ? (await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))).rows[0]!.id
    : (await conSistema((tx) => tx.consultar<{ id: string }>(sql, params))).rows[0]!.id;
  if (!n) superadminsCreados.push(id);
  return { id, email };
}

const comoActor = async (email: string): Promise<UsuarioAutenticado> =>
  (await iniciarSesion(email, CLAVE, ahora)).usuario;

describe('autenticación', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;

  beforeAll(async () => {
    a = await crearNegocio('Negocio A');
    b = await crearNegocio('Negocio B');
  });
  afterAll(async () => {
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadminsCreados]));
  });

  describe('sesiones', () => {
    it('inicia sesión, identifica al usuario y la sesión se puede cerrar', async () => {
      const u = await crearUsuario(a, 'dueno');
      const s = await iniciarSesion(u.email, CLAVE, ahora);
      expect(s.usuario).toMatchObject({ usuarioId: u.id, negocioId: a.negocioId, rol: 'dueno' });
      expect(await autenticar(s.token, ahora)).toEqual(s.usuario);

      await cerrarSesion(s.token, ahora);
      await expect(autenticar(s.token, ahora)).rejects.toBeInstanceOf(NoAutorizado);
    });

    it('en la base solo queda el hash del token, nunca el token', async () => {
      const u = await crearUsuario(a, 'dueno');
      const s = await iniciarSesion(u.email, CLAVE, ahora);
      const secreto = s.token.split('.')[1]!;
      const filas = await conNegocio(a.negocioId, async (tx) =>
        (await tx.consultar('SELECT 1 FROM sesiones WHERE token_hash = $1 OR token_hash = $2', [secreto, s.token])).rowCount);
      expect(filas).toBe(0);
    });

    it('el correo no distingue mayúsculas y las credenciales malas dan el mismo mensaje', async () => {
      const u = await crearUsuario(a, 'empleado');
      await iniciarSesion(u.email.toUpperCase(), CLAVE, ahora);
      const mensajes: string[] = [];
      for (const [email, clave] of [[u.email, 'otra-clave-larga'], [correo(), CLAVE], [u.email, '']] as const) {
        const error = await iniciarSesion(email, clave, ahora).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(NoAutorizado);
        mensajes.push((error as Error).message);
      }
      expect(new Set(mensajes).size).toBe(1);
    });

    it('un usuario inactivo no entra, y si lo desactivan se cae su sesión', async () => {
      const u = await crearUsuario(a, 'empleado');
      const s = await iniciarSesion(u.email, CLAVE, ahora);
      await conNegocio(a.negocioId, (tx) => tx.consultar('UPDATE usuarios SET activo = false WHERE id = $1', [u.id]));
      await expect(autenticar(s.token, ahora)).rejects.toBeInstanceOf(NoAutorizado);
      await expect(iniciarSesion(u.email, CLAVE, ahora)).rejects.toBeInstanceOf(NoAutorizado);
    });

    it('la sesión vence a los 7 días', async () => {
      const s = await iniciarSesion((await crearUsuario(a, 'dueno')).email, CLAVE, ahora);
      await autenticar(s.token, dias(6));
      await expect(autenticar(s.token, dias(8))).rejects.toBeInstanceOf(NoAutorizado);
    });

    it('rechaza tokens mal formados, manipulados o de otro negocio', async () => {
      const s = await iniciarSesion((await crearUsuario(a, 'dueno')).email, CLAVE, ahora);
      const secreto = s.token.split('.')[1]!;
      for (const falso of [undefined, null, '', 'x', `${a.negocioId}.corto`, `${s.token}.extra`, `no-uuid.${secreto}`,
        `${b.negocioId}.${secreto}`, // el secreto es de A, pero se presenta como de B
        `sis.${secreto}`]) {                // y como de superadmin
        await expect(autenticar(falso, ahora)).rejects.toBeInstanceOf(NoAutorizado);
      }
    });

    it('un negocio no puede ver las sesiones ni los tokens de otro', async () => {
      const ua = await crearUsuario(a, 'dueno');
      await iniciarSesion(ua.email, CLAVE, ahora);
      await invitarUsuario(await comoActor(ua.email), { email: correo(), nombre: 'X', rol: 'empleado' }, ahora);
      for (const tabla of ['sesiones', 'tokens_usuario']) {
        const vistoPorB = await conNegocio(b.negocioId, async (tx) => (await tx.consultar(`SELECT 1 FROM ${tabla}`)).rowCount);
        expect(vistoPorB).toBe(0);
      }
    });
  });

  describe('invitaciones', () => {
    it('el dueño invita, la persona define su contraseña y entra', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const email = correo();
      const inv = await invitarUsuario(dueno, { email, nombre: 'Nuevo Barbero', rol: 'empleado' }, ahora);
      await expect(iniciarSesion(email, CLAVE, ahora)).rejects.toBeInstanceOf(NoAutorizado); // aún no acepta

      await aceptarInvitacion(inv.token, CLAVE, ahora);
      const s = await iniciarSesion(email, CLAVE, ahora);
      expect(s.usuario).toMatchObject({ negocioId: a.negocioId, rol: 'empleado', nombre: 'Nuevo Barbero' });
    });

    it('el enlace sirve una sola vez, vence a las 72 h y no sirve de otro tipo', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const uno = await invitarUsuario(dueno, { email: correo(), nombre: 'U', rol: 'empleado' }, ahora);
      await aceptarInvitacion(uno.token, CLAVE, ahora);
      await expect(aceptarInvitacion(uno.token, CLAVE, ahora)).rejects.toBeInstanceOf(NoAutorizado);

      const vence = await invitarUsuario(dueno, { email: correo(), nombre: 'V', rol: 'empleado' }, ahora);
      await expect(aceptarInvitacion(vence.token, CLAVE, horas(73))).rejects.toBeInstanceOf(NoAutorizado);

      const otro = await invitarUsuario(dueno, { email: correo(), nombre: 'W', rol: 'empleado' }, ahora);
      await expect(restablecerContrasena(otro.token, CLAVE, ahora)).rejects.toBeInstanceOf(NoAutorizado);
    });

    it('exige una contraseña de 10 a 128 caracteres', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const inv = await invitarUsuario(dueno, { email: correo(), nombre: 'P', rol: 'empleado' }, ahora);
      for (const mala of ['corta', 'x'.repeat(129), 12345678901234, undefined]) {
        await expect(aceptarInvitacion(inv.token, mala, ahora)).rejects.toBeInstanceOf(DatosInvalidos);
      }
      await aceptarInvitacion(inv.token, CLAVE, ahora); // el enlace no se gastó con los intentos malos
    });

    it('quién puede invitar: el empleado no; el dueño solo a su negocio; el superadmin a cualquiera', async () => {
      const empleado = await comoActor((await crearUsuario(a, 'empleado')).email);
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const admin = await comoActor((await crearUsuario(null, 'superadmin')).email);
      const nuevo = { nombre: 'N', rol: 'empleado' as const };

      await expect(invitarUsuario(empleado, { ...nuevo, email: correo() }, ahora)).rejects.toBeInstanceOf(Prohibido);
      await expect(invitarUsuario(dueno, { ...nuevo, email: correo(), negocioId: b.negocioId }, ahora)).rejects.toBeInstanceOf(Prohibido);
      await expect(invitarUsuario(admin, { ...nuevo, email: correo() }, ahora)).rejects.toBeInstanceOf(DatosInvalidos); // falta negocio

      const inv = await invitarUsuario(admin, { ...nuevo, rol: 'dueno', email: correo(), negocioId: b.negocioId }, ahora);
      const filas = await conNegocio(b.negocioId, async (tx) => (await tx.consultar('SELECT 1 FROM usuarios WHERE id = $1', [inv.usuarioId])).rowCount);
      expect(filas).toBe(1);
    });

    it('valida correo, nombre y rol, y no repite correos', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const base = { email: correo(), nombre: 'Ok', rol: 'empleado' as const };
      for (const caso of [{ ...base, email: 'sin-arroba' }, { ...base, nombre: '  ' }, { ...base, rol: 'superadmin' as never }]) {
        await expect(invitarUsuario(dueno, caso, ahora)).rejects.toBeInstanceOf(DatosInvalidos);
      }
      await invitarUsuario(dueno, base, ahora);
      await expect(invitarUsuario(dueno, base, ahora)).rejects.toBeInstanceOf(Duplicado);
    });

    it('el primer superadmin se crea con su enlace y entra sin negocio', async () => {
      const email = correo();
      const { token } = await invitarSuperadmin(email, 'Admin', ahora);
      expect(token.startsWith('sis.')).toBe(true);
      await aceptarInvitacion(token, CLAVE, ahora);
      const s = await iniciarSesion(email, CLAVE, ahora);
      expect(s.usuario).toMatchObject({ negocioId: null, rol: 'superadmin' });
      expect(await autenticar(s.token, ahora)).toEqual(s.usuario);
      const { rows } = await conSistema((tx) => tx.consultar<{ id: string }>('SELECT id FROM usuarios WHERE email = $1', [email]));
      superadminsCreados.push(rows[0]!.id);
    });
  });

  describe('recuperación de contraseña', () => {
    it('el dueño genera el enlace de un empleado; al usarlo cambia la clave y se cierran sus sesiones', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const emp = await crearUsuario(a, 'empleado');
      const vieja = await iniciarSesion(emp.email, CLAVE, ahora);

      const { token } = await generarRecuperacion(dueno, emp.id, undefined, ahora);
      await restablecerContrasena(token, 'clave-nueva-muy-larga', ahora);

      await expect(autenticar(vieja.token, ahora)).rejects.toBeInstanceOf(NoAutorizado);
      await expect(iniciarSesion(emp.email, CLAVE, ahora)).rejects.toBeInstanceOf(NoAutorizado);
      await iniciarSesion(emp.email, 'clave-nueva-muy-larga', ahora);
      await expect(restablecerContrasena(token, 'otra-clave-muy-larga', ahora)).rejects.toBeInstanceOf(NoAutorizado);
    });

    it('el enlace vence a la hora', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const emp = await crearUsuario(a, 'empleado');
      const { token } = await generarRecuperacion(dueno, emp.id, undefined, ahora);
      await expect(restablecerContrasena(token, CLAVE, horas(2))).rejects.toBeInstanceOf(NoAutorizado);
    });

    it('el dueño no puede recuperar a otro dueño ni a usuarios de otro negocio; el superadmin sí', async () => {
      const dueno = await comoActor((await crearUsuario(a, 'dueno')).email);
      const otroDueno = await crearUsuario(a, 'dueno');
      const deB = await crearUsuario(b, 'empleado');
      const admin = await comoActor((await crearUsuario(null, 'superadmin')).email);

      await expect(generarRecuperacion(dueno, otroDueno.id, undefined, ahora)).rejects.toBeInstanceOf(Prohibido);
      await expect(generarRecuperacion(dueno, deB.id, undefined, ahora)).rejects.toBeInstanceOf(NoEncontrado);
      await expect(generarRecuperacion(dueno, deB.id, b.negocioId, ahora)).rejects.toBeInstanceOf(Prohibido);
      await generarRecuperacion(admin, otroDueno.id, a.negocioId, ahora);
    });
  });

  describe('HTTP', () => {
    let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
    let base: string;
    beforeAll(async () => {
      servidor = crearApp().listen(0);
      await new Promise((r) => servidor.once('listening', r));
      base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise((r) => servidor.close(r)));

    const pedir = (ruta: string, metodo = 'GET', cuerpo?: unknown, token?: string) =>
      fetch(base + ruta, {
        method: metodo,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });

    it('flujo completo: invitar, aceptar, entrar, ver quién soy y salir', async () => {
      const dueno = await crearUsuario(a, 'dueno');
      const sesion = await (await pedir('/auth/login', 'POST', { email: dueno.email, password: CLAVE })).json();
      expect(sesion.token).toBeTypeOf('string');

      const email = correo();
      const res = await pedir('/auth/usuarios/invitar', 'POST', { email, nombre: 'Por HTTP', rol: 'empleado' }, sesion.token);
      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const { enlace } = await res.json();
      const token = decodeURIComponent(enlace.split('#token=')[1]);

      expect((await pedir('/auth/aceptar-invitacion', 'POST', { token, password: CLAVE })).status).toBe(204);
      const nueva = await (await pedir('/auth/login', 'POST', { email, password: CLAVE })).json();
      const yo = await (await pedir('/auth/yo', 'GET', undefined, nueva.token)).json();
      expect(yo.usuario).toMatchObject({ rol: 'empleado', negocioId: a.negocioId });

      expect((await pedir('/auth/logout', 'POST', undefined, nueva.token)).status).toBe(204);
      expect((await pedir('/auth/yo', 'GET', undefined, nueva.token)).status).toBe(401);
    });

    it('responde 401, 403 y 400 con el formato de error del proyecto', async () => {
      expect((await pedir('/auth/yo')).status).toBe(401);
      expect((await pedir('/auth/login', 'POST', { email: correo(), password: CLAVE })).status).toBe(401);
      expect((await pedir('/auth/login', 'POST', { email: 5 })).status).toBe(400);

      const emp = await crearUsuario(a, 'empleado');
      const { token } = await (await pedir('/auth/login', 'POST', { email: emp.email, password: CLAVE })).json();
      const res = await pedir('/auth/usuarios/invitar', 'POST', { email: correo(), nombre: 'X', rol: 'empleado' }, token);
      expect(res.status).toBe(403);
      expect((await res.json()).error.codigo).toBe('PROHIBIDO');
    });
  });
});
