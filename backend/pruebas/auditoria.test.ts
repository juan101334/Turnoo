import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { ipParaAuditoria } from '../src/modulos/auditoria/auditoria.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const TOKEN_META = 'EAAtoken-de-meta-solo-para-pruebas-1234567890';

interface Fila {
  accion: string;
  usuario_id: string | null;
  negocio_id: string | null;
  ip_red: string | null;
  detalle: Record<string, unknown>;
}

/** Las filas de auditoría de un usuario, de la más vieja a la más nueva. */
const filasDe = async (usuarioId: string) =>
  (
    await conSistema((tx) =>
      tx.consultar<Fila>('SELECT accion, usuario_id, negocio_id, ip_red, detalle FROM auditoria WHERE usuario_id = $1 ORDER BY creado_en, id', [usuarioId]),
    )
  ).rows;

describe('ip para la auditoría', () => {
  it('se recorta a su red: /24 en IPv4 y /48 en IPv6', () => {
    expect(ipParaAuditoria('203.0.113.45')).toBe('203.0.113.0/24');
    expect(ipParaAuditoria('::ffff:203.0.113.45')).toBe('203.0.113.0/24');
    expect(ipParaAuditoria('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48');
    expect(ipParaAuditoria('::1')).toBe('0:0:0::/48');
    expect(ipParaAuditoria(null)).toBeNull();
  });
});

describe('registro de auditoría', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let base: string;
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  const superadmins: string[] = [];

  async function crearUsuario(n: NegocioDePrueba | null, rol: 'dueno' | 'superadmin') {
    const email = `${randomUUID()}@prueba.com`;
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, await argon2.hash(CLAVE)];
    const { rows } = n
      ? await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))
      : await conSistema((tx) => tx.consultar<{ id: string }>(sql, params));
    if (!n) superadmins.push(rows[0]!.id);
    return { id: rows[0]!.id, email };
  }

  const pedir = (ruta: string, metodo = 'GET', cuerpo?: unknown, token?: string) =>
    fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  const entrar = async (email: string) => ((await (await pedir('/auth/login', 'POST', { email, password: CLAVE })).json()) as { token: string }).token;

  beforeAll(async () => {
    a = await crearNegocio('Auditoría A');
    b = await crearNegocio('Auditoría B');
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
  });

  it('login correcto, fallido y de una cuenta que no existe; nunca el correo ni la contraseña', async () => {
    const u = await crearUsuario(a, 'dueno');
    expect((await pedir('/auth/login', 'POST', { email: u.email, password: 'no-es-la-clave-1' })).status).toBe(401);
    await entrar(u.email);
    const filas = await filasDe(u.id);
    expect(filas).toEqual([
      { accion: 'login_fallido', usuario_id: u.id, negocio_id: a.negocioId, ip_red: '127.0.0.0/24', detalle: { motivo: 'clave' } },
      { accion: 'login_correcto', usuario_id: u.id, negocio_id: a.negocioId, ip_red: '127.0.0.0/24', detalle: {} },
    ]);

    const inexistente = `${randomUUID()}@prueba.com`;
    expect((await pedir('/auth/login', 'POST', { email: inexistente, password: 'contrasena-escrita-1' })).status).toBe(401);
    const { rows } = await conSistema((tx) =>
      tx.consultar<{ fila: string }>(`SELECT row_to_json(a)::text AS fila FROM auditoria a WHERE accion = 'login_fallido' AND usuario_id IS NULL ORDER BY creado_en DESC LIMIT 1`),
    );
    expect(JSON.parse(rows[0]!.fila)).toMatchObject({ usuario_id: null, negocio_id: null, detalle: { motivo: 'cuenta_inexistente' } });
    const todo = (await conSistema((tx) => tx.consultar<{ t: string }>('SELECT coalesce(string_agg(row_to_json(a)::text, \'\'), \'\') AS t FROM auditoria a'))).rows[0]!.t;
    for (const secreto of [inexistente, 'contrasena-escrita-1', u.email, CLAVE, 'no-es-la-clave-1']) expect(todo).not.toContain(secreto);
  });

  it('cambiar la contraseña, cerrar las otras sesiones y salir', async () => {
    const u = await crearUsuario(a, 'dueno');
    await entrar(u.email);
    const token = await entrar(u.email);
    expect((await pedir('/auth/sesiones/cerrar-otras', 'POST', {}, token)).status).toBe(200);
    expect((await pedir('/auth/contrasena', 'POST', { actual: CLAVE, nueva: 'clave-nueva-de-prueba-1' }, token)).status).toBe(204);
    expect((await pedir('/auth/logout', 'POST', {}, token)).status).toBe(204);
    expect((await filasDe(u.id)).map((f) => [f.accion, f.detalle])).toEqual([
      ['login_correcto', {}],
      ['login_correcto', {}],
      ['cerrar_otras_sesiones', { cerradas: 1 }],
      ['cambiar_contrasena', {}],
      ['cerrar_sesion', {}],
    ]);
  });

  it('el superadmin: plan y estado, y cuentas de WhatsApp sin el token de Meta', async () => {
    const admin = await crearUsuario(null, 'superadmin');
    const token = await entrar(admin.email);
    expect((await pedir(`/negocios/${b.negocioId}`, 'PATCH', { estado: 'suspendido' }, token)).status).toBe(200);
    const cuerpo = { phoneNumberId: String(Date.now()), wabaId: '123', numeroVisible: '+57 300 000 0000', token: TOKEN_META };
    const registro = await pedir(`/negocios/${b.negocioId}/whatsapp`, 'POST', cuerpo, token);
    expect(registro.status).toBe(201);
    const { id: cuentaId } = (await registro.json()) as { id: string };
    expect((await pedir(`/negocios/${b.negocioId}/whatsapp/${cuentaId}`, 'PATCH', { token: `${TOKEN_META}-otro` }, token)).status).toBe(200);

    const filas = (await filasDe(admin.id)).filter((f) => f.accion !== 'login_correcto');
    expect(filas).toEqual([
      { accion: 'cambiar_plan_estado', usuario_id: admin.id, negocio_id: b.negocioId, ip_red: '127.0.0.0/24', detalle: { planId: null, estado: 'suspendido', pruebaHasta: null } },
      { accion: 'registrar_whatsapp', usuario_id: admin.id, negocio_id: b.negocioId, ip_red: '127.0.0.0/24', detalle: { cuentaId } },
      {
        accion: 'cambiar_whatsapp',
        usuario_id: admin.id,
        negocio_id: b.negocioId,
        ip_red: '127.0.0.0/24',
        detalle: { cuentaId, numeroVisible: false, token: true, activa: null },
      },
    ]);
    expect(JSON.stringify(filas)).not.toContain(TOKEN_META);
  });

  it('la invitación del dueño queda en su negocio; con un negocio ajeno se rechaza y no se anota', async () => {
    const dueno = await crearUsuario(a, 'dueno');
    const token = await entrar(dueno.email);
    const invitacion = () => ({ email: `${randomUUID()}@prueba.com`, nombre: 'Nueva', rol: 'dueno' });
    expect((await pedir('/auth/usuarios/invitar', 'POST', { ...invitacion(), negocioId: b.negocioId }, token)).status).toBe(403);
    expect((await filasDe(dueno.id)).filter((f) => f.accion === 'invitar_usuario')).toEqual([]);
    const respuesta = await pedir('/auth/usuarios/invitar', 'POST', invitacion(), token);
    expect(respuesta.status).toBe(201);
    const { usuarioId, enlace } = (await respuesta.json()) as { usuarioId: string; enlace: string };
    const fila = (await filasDe(dueno.id)).find((f) => f.accion === 'invitar_usuario')!;
    expect(fila).toMatchObject({ negocio_id: a.negocioId, detalle: { invitadoId: usuarioId, rol: 'dueno' } });

    // Sin sesión: quien acepta se identifica por el enlace.
    const tokenInvitacion = decodeURIComponent(new URL(enlace).hash.replace('#token=', ''));
    expect((await pedir('/auth/aceptar-invitacion', 'POST', { token: tokenInvitacion, password: 'clave-de-la-invitada-1' })).status).toBe(204);
    expect(await filasDe(usuarioId)).toEqual([
      { accion: 'aceptar_invitacion', usuario_id: usuarioId, negocio_id: a.negocioId, ip_red: '127.0.0.0/24', detalle: {} },
    ]);
    const todo = JSON.stringify(await filasDe(usuarioId));
    expect(todo).not.toContain(tokenInvitacion.split('.')[1]);
  });

  it('solo se agrega: la aplicación no puede cambiar ni borrar el registro', async () => {
    await expect(conSistema((tx) => tx.consultar(`UPDATE auditoria SET accion = 'login_correcto'`))).rejects.toThrow();
    await expect(conSistema((tx) => tx.consultar('DELETE FROM auditoria'))).rejects.toThrow();
  });

  it('cada negocio ve solo su parte del registro', async () => {
    const u = await crearUsuario(b, 'dueno');
    await entrar(u.email);
    const { rows } = await conNegocio(a.negocioId, (tx) => tx.consultar<{ n: number }>('SELECT count(*)::int AS n FROM auditoria WHERE negocio_id <> $1 OR negocio_id IS NULL', [a.negocioId]));
    expect(rows[0]!.n).toBe(0);
  });
});
