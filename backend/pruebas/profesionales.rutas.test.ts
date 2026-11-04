import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { aceptarInvitacion, iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import { bloquearProfesionalActivo } from '../src/modulos/citas/citas.repositorio.js';
import {
  crearCita,
  crearCliente,
  crearNegocio,
  crearProfesional,
  hora,
  limpiar,
  type NegocioDePrueba,
} from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const correo = () => `${randomUUID()}@prueba.com`;
const tokenDelEnlace = (enlace: string) => decodeURIComponent(enlace.split('#token=')[1]!);

interface Persona {
  id: string;
  email: string;
  token: string;
}

describe('barberos y usuarios', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let duenoA: Persona;
  let duenoB: Persona;
  let admin: Persona;
  const superadmins: string[] = [];
  const planes: string[] = [];

  async function persona(n: NegocioDePrueba | null, rol: string, profesionalId?: string): Promise<Persona> {
    const email = correo();
    const hash = await argon2.hash(CLAVE);
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
                 VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, hash];
    const { rows } = n
      ? await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))
      : await conSistema((tx) => tx.consultar<{ id: string }>(sql, params));
    const id = rows[0]!.id;
    if (!n) superadmins.push(id);
    if (n && profesionalId) {
      await conNegocio(n.negocioId, (tx) =>
        tx.consultar('UPDATE profesionales SET usuario_id = $1 WHERE id = $2', [id, profesionalId]),
      );
    }
    const { token } = await iniciarSesion(email, CLAVE);
    return { id, email, token };
  }

  const api = async (token: string | null, metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    return { status: r.status, json: texto ? JSON.parse(texto) : null };
  };

  const negocioNuevo = () => crearNegocio('Negocio de una prueba');
  const fijarEstado = (n: NegocioDePrueba, estado: string) =>
    conSistema((tx) => tx.consultar('UPDATE negocios SET estado = $2 WHERE id = $1', [n.negocioId, estado]));

  async function asignarPlan(n: NegocioDePrueba, maxProfesionales: number) {
    const { rows } = await conSistema((tx) =>
      tx.consultar<{ id: string }>(
        'INSERT INTO planes (nombre, precio_mensual_cop, max_profesionales) VALUES ($1, 50000, $2) RETURNING id',
        [`Plan ${randomUUID()}`, maxProfesionales],
      ),
    );
    planes.push(rows[0]!.id);
    await conSistema((tx) => tx.consultar('UPDATE negocios SET plan_id = $2 WHERE id = $1', [n.negocioId, rows[0]!.id]));
  }

  async function estadoDe(token: string, id: string, negocioId?: string) {
    const consulta = negocioId ? `?negocioId=${negocioId}` : '';
    const { json } = await api(token, 'GET', `/auth/usuarios${consulta}`);
    return json.usuarios.find((u: { id: string }) => u.id === id);
  }

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    duenoA = await persona(a, 'dueno');
    duenoB = await persona(b, 'dueno');
    admin = await persona(null, 'superadmin');
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema(async (tx) => {
      await tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]);
      await tx.consultar('DELETE FROM planes WHERE id = ANY($1::uuid[])', [planes]);
    });
  });

  describe('administrar barberos', () => {
    it('el dueño crea, consulta, lista y renombra un barbero en su sede', async () => {
      const creado = await api(duenoA.token, 'POST', '/profesionales', { nombre: '  Andrés  ' });
      expect(creado.status).toBe(201);
      expect(creado.json).toMatchObject({ nombre: 'Andrés', activo: true, usuarioId: null, sedeId: a.sedeId });

      const ruta = `/profesionales/${creado.json.id}`;
      expect((await api(duenoA.token, 'GET', ruta)).json.nombre).toBe('Andrés');
      expect((await api(duenoA.token, 'PATCH', ruta, { nombre: 'Andrés R.' })).json.nombre).toBe('Andrés R.');

      const lista = await api(duenoA.token, 'GET', '/profesionales');
      expect(lista.json.profesionales.map((p: { id: string }) => p.id)).toContain(creado.json.id);
    });

    it.each([[{}], [{ nombre: '   ' }], [{ nombre: 'x'.repeat(101) }], [{ nombre: 'X', activo: false }], [{ nombre: 'X', usuarioId: null }]])(
      'rechaza datos inválidos: %j',
      async (cuerpo) => {
        expect((await api(duenoA.token, 'POST', '/profesionales', cuerpo)).status).toBe(400);
      },
    );

    it('un barbero de otro negocio responde 404 en todas las rutas y no cambia', async () => {
      const ajeno = await crearProfesional(b, 'De B');
      const ruta = `/profesionales/${ajeno}`;
      expect((await api(duenoA.token, 'GET', ruta)).status).toBe(404);
      expect((await api(duenoA.token, 'PATCH', ruta, { nombre: 'Mío' })).status).toBe(404);
      expect((await api(duenoA.token, 'POST', `${ruta}/desactivar`)).status).toBe(404);
      expect((await api(duenoA.token, 'POST', `${ruta}/activar`)).status).toBe(404);
      expect((await api(duenoA.token, 'PUT', `${ruta}/usuario`, { usuarioId: null })).status).toBe(404);
      expect((await api(duenoA.token, 'PUT', `${ruta}/usuario`, { usuarioId: duenoA.id })).status).toBe(404);

      const { json } = await api(duenoB.token, 'GET', ruta);
      expect(json).toMatchObject({ nombre: 'De B', activo: true, usuarioId: null });
      const lista = await api(duenoA.token, 'GET', '/profesionales');
      expect(lista.json.profesionales.map((p: { id: string }) => p.id)).not.toContain(ajeno);
    });

    it('un id mal escrito responde 400', async () => {
      expect((await api(duenoA.token, 'GET', '/profesionales/no-es-uuid')).status).toBe(400);
      expect((await api(duenoA.token, 'POST', '/profesionales/no-es-uuid/desactivar')).status).toBe(400);
    });

    it('el empleado solo consulta su barbero; un barbero ajeno responde 404', async () => {
      const suyo = await crearProfesional(a, 'Suyo');
      const otro = await crearProfesional(a, 'Otro');
      const empleado = await persona(a, 'empleado', suyo);

      const lista = await api(empleado.token, 'GET', '/profesionales');
      expect(lista.json.profesionales.map((p: { id: string }) => p.id)).toEqual([suyo]);
      expect((await api(empleado.token, 'GET', `/profesionales/${suyo}`)).status).toBe(200);
      expect((await api(empleado.token, 'GET', `/profesionales/${otro}`)).status).toBe(404);
    });

    it('un empleado sin barbero ve una lista vacía', async () => {
      const empleado = await persona(a, 'empleado');
      expect((await api(empleado.token, 'GET', '/profesionales')).json.profesionales).toEqual([]);
    });

    it('el empleado no administra barberos, ni siquiera el suyo', async () => {
      const suyo = await crearProfesional(a, 'Suyo');
      const empleado = await persona(a, 'empleado', suyo);
      const ruta = `/profesionales/${suyo}`;
      expect((await api(empleado.token, 'POST', '/profesionales', { nombre: 'X' })).status).toBe(403);
      expect((await api(empleado.token, 'PATCH', ruta, { nombre: 'X' })).status).toBe(403);
      expect((await api(empleado.token, 'POST', `${ruta}/desactivar`)).status).toBe(403);
      expect((await api(empleado.token, 'POST', `${ruta}/activar`)).status).toBe(403);
      expect((await api(empleado.token, 'PUT', `${ruta}/usuario`, { usuarioId: null })).status).toBe(403);
    });

    it('el superadmin no opera barberos y sin sesión responde 401', async () => {
      expect((await api(admin.token, 'GET', '/profesionales')).status).toBe(403);
      expect((await api(admin.token, 'POST', '/profesionales', { nombre: 'X' })).status).toBe(403);
      expect((await api(null, 'GET', '/profesionales')).status).toBe(401);
    });

    it('un negocio suspendido consulta barberos pero no los modifica', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const id = await crearProfesional(n, 'Barbero');
      await fijarEstado(n, 'suspendido');
      const ruta = `/profesionales/${id}`;

      expect((await api(dueno.token, 'GET', '/profesionales')).status).toBe(200);
      expect((await api(dueno.token, 'POST', '/profesionales', { nombre: 'X' })).status).toBe(403);
      expect((await api(dueno.token, 'PATCH', ruta, { nombre: 'X' })).status).toBe(403);
      expect((await api(dueno.token, 'POST', `${ruta}/desactivar`)).status).toBe(403);
      expect((await api(dueno.token, 'POST', `${ruta}/activar`)).status).toBe(403);
      expect((await api(dueno.token, 'PUT', `${ruta}/usuario`, { usuarioId: dueno.id })).status).toBe(403);
    });
  });

  describe('límite del plan', () => {
    it('sin plan no hay límite', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      for (let i = 0; i < 3; i++) {
        expect((await api(dueno.token, 'POST', '/profesionales', { nombre: `B${i}` })).status).toBe(201);
      }
    });

    it('no deja pasar el límite, y desactivar libera un cupo', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      await asignarPlan(n, 1);

      const primero = await api(dueno.token, 'POST', '/profesionales', { nombre: 'Uno' });
      expect(primero.status).toBe(201);
      const excedido = await api(dueno.token, 'POST', '/profesionales', { nombre: 'Dos' });
      expect(excedido.status).toBe(403);
      expect(excedido.json.error.codigo).toBe('LIMITE_DEL_PLAN');

      await api(dueno.token, 'POST', `/profesionales/${primero.json.id}/desactivar`);
      expect((await api(dueno.token, 'POST', '/profesionales', { nombre: 'Dos' })).status).toBe(201);
    });

    it('reactivar también respeta el límite, pero activar a uno ya activo no consume cupo', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const uno = (await api(dueno.token, 'POST', '/profesionales', { nombre: 'Uno' })).json.id;
      await api(dueno.token, 'POST', `/profesionales/${uno}/desactivar`);
      const dos = (await api(dueno.token, 'POST', '/profesionales', { nombre: 'Dos' })).json.id;
      await asignarPlan(n, 1);

      const reactivar = await api(dueno.token, 'POST', `/profesionales/${uno}/activar`);
      expect(reactivar.status).toBe(403);
      expect(reactivar.json.error.codigo).toBe('LIMITE_DEL_PLAN');
      expect((await api(dueno.token, 'POST', `/profesionales/${dos}/activar`)).status).toBe(200);
    });

    it('dos altas simultáneas no pasan el límite', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      await asignarPlan(n, 1);

      const respuestas = await Promise.all(
        ['Uno', 'Dos', 'Tres', 'Cuatro'].map((nombre) => api(dueno.token, 'POST', '/profesionales', { nombre })),
      );
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 403, 403, 403]);
    });
  });

  describe('desactivar un barbero', () => {
    it('se rechaza con la cantidad de citas futuras, sin contar canceladas ni pasadas', async () => {
      const id = await crearProfesional(a, 'Ocupado');
      const cliente = await crearCliente(a);
      const ruta = `/profesionales/${id}/desactivar`;
      const cita = (hhmm: string, dia: string, estado?: 'cancelada' | 'por_aprobar' | 'completada') =>
        crearCita(a, {
          profesionalId: id, clienteId: cliente, inicio: hora(hhmm, dia), fin: hora(`${hhmm.slice(0, 2)}:30`, dia),
          ...(estado && { estado }),
        });

      await cita('10:00', '2020-01-06', 'completada');
      await cita('11:00', '2020-01-06');
      await cita('10:00', '2030-06-10', 'cancelada');
      await cita('11:00', '2030-06-10', 'completada');
      await cita('12:00', '2030-06-10');
      await cita('13:00', '2030-06-10', 'por_aprobar');

      const r = await api(duenoA.token, 'POST', ruta);
      expect(r.status).toBe(409);
      expect(r.json.error).toMatchObject({ codigo: 'CONFLICTO', mensaje: expect.stringContaining('2 citas futuras') });
      expect((await api(duenoA.token, 'GET', `/profesionales/${id}`)).json.activo).toBe(true);
    });

    it('sin citas futuras se desactiva, no agenda más y se puede reactivar', async () => {
      const id = await crearProfesional(a, 'Libre');
      const ruta = `/profesionales/${id}`;
      const desactivado = await api(duenoA.token, 'POST', `${ruta}/desactivar`);
      expect(desactivado.json.activo).toBe(false);
      expect((await api(duenoA.token, 'POST', `${ruta}/desactivar`)).status).toBe(200);

      const agendar = await api(duenoA.token, 'POST', '/citas', {
        profesionalId: id, servicioIds: [randomUUID()], inicio: '2030-06-10T14:00:00Z',
        cliente: { telefono: '3001234567', nombre: 'Carlos' },
      });
      expect(agendar.status).toBe(404);

      expect((await api(duenoA.token, 'POST', `${ruta}/activar`)).json.activo).toBe(true);
    });

    it('espera a una cita que se está creando y la cuenta', async () => {
      const id = await crearProfesional(a, 'En carrera');
      const cliente = await crearCliente(a);
      let avisarBloqueo!: () => void;
      let soltar!: () => void;
      const bloqueado = new Promise<void>((r) => { avisarBloqueo = r; });
      const liberado = new Promise<void>((r) => { soltar = r; });

      const creacion = conNegocio(a.negocioId, async (tx) => {
        await bloquearProfesionalActivo(tx, id);
        avisarBloqueo();
        await liberado;
        await tx.consultar(
          `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.negocioId, a.sedeId, id, cliente, hora('10:00'), hora('10:30')],
        );
      });
      await bloqueado;
      const desactivacion = api(duenoA.token, 'POST', `/profesionales/${id}/desactivar`);
      await new Promise((r) => setTimeout(r, 150));
      soltar();
      await creacion;

      expect((await desactivacion).status).toBe(409);
    });

    it('una cita vieja sin marcar no se reprograma con un barbero desactivado', async () => {
      const id = await crearProfesional(a, 'Se fue');
      const cliente = await crearCliente(a);
      const cita = await crearCita(a, {
        profesionalId: id, clienteId: cliente, inicio: hora('10:00', '2020-01-06'), fin: hora('10:30', '2020-01-06'),
      });
      expect((await api(duenoA.token, 'POST', `/profesionales/${id}/desactivar`)).status).toBe(200);

      const r = await api(duenoA.token, 'POST', `/citas/${cita}/reprogramar`, { inicio: '2030-06-10T14:00:00Z' });
      expect(r.status).toBe(409);
      expect(r.json.error.codigo).toBe('CONFLICTO');
    });

    it('el empleado de un barbero desactivado pierde el acceso a citas', async () => {
      const id = await crearProfesional(a, 'Se va');
      const empleado = await persona(a, 'empleado', id);
      await api(duenoA.token, 'POST', `/profesionales/${id}/desactivar`);
      const rango = 'desde=2030-06-10T00:00:00Z&hasta=2030-06-11T00:00:00Z';
      expect((await api(empleado.token, 'GET', `/citas?${rango}`)).status).toBe(403);
    });
  });

  describe('asociar usuario y barbero', () => {
    const rango = 'desde=2030-06-10T00:00:00Z&hasta=2030-06-11T00:00:00Z';

    it('un empleado asociado entra a citas y al quitarlo pierde el acceso', async () => {
      const id = await crearProfesional(a, 'Con empleado');
      const empleado = await persona(a, 'empleado');
      expect((await api(empleado.token, 'GET', `/citas?${rango}`)).status).toBe(403);

      const ruta = `/profesionales/${id}/usuario`;
      const asociado = await api(duenoA.token, 'PUT', ruta, { usuarioId: empleado.id });
      expect(asociado.status).toBe(200);
      expect(asociado.json.usuarioId).toBe(empleado.id);
      expect((await api(empleado.token, 'GET', `/citas?${rango}`)).status).toBe(200);

      expect((await api(duenoA.token, 'PUT', ruta, { usuarioId: null })).json.usuarioId).toBeNull();
      expect((await api(empleado.token, 'GET', `/citas?${rango}`)).status).toBe(403);
    });

    it('sirve para un dueño que atiende, y sigue viendo todo el negocio', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const suyo = await crearProfesional(n, 'Dueño barbero');
      const otro = await crearProfesional(n, 'Otro');
      const cliente = await crearCliente(n);
      const citaDelOtro = await crearCita(n, {
        profesionalId: otro, clienteId: cliente, inicio: hora('10:00'), fin: hora('10:30'),
      });

      const r = await api(dueno.token, 'PUT', `/profesionales/${suyo}/usuario`, { usuarioId: dueno.id });
      expect(r.status).toBe(200);
      expect(r.json.usuarioId).toBe(dueno.id);
      expect((await estadoDe(dueno.token, dueno.id)).profesionalId).toBe(suyo);

      const lista = await api(dueno.token, 'GET', '/profesionales');
      expect(lista.json.profesionales).toHaveLength(2);
      const citas = await api(dueno.token, 'GET', `/citas?${rango}`);
      expect(citas.json.citas.map((c: { id: string }) => c.id)).toContain(citaDelOtro);
    });

    it('cambia el usuario de un barbero si el dueño lo pide', async () => {
      const id = await crearProfesional(a, 'Cambia');
      const primero = await persona(a, 'empleado', id);
      const segundo = await persona(a, 'empleado');
      const r = await api(duenoA.token, 'PUT', `/profesionales/${id}/usuario`, { usuarioId: segundo.id });
      expect(r.json.usuarioId).toBe(segundo.id);
      expect((await api(primero.token, 'GET', `/citas?${rango}`)).status).toBe(403);
    });

    it('rechaza un usuario ajeno, ocupado, desactivado o mal escrito, y un barbero inactivo', async () => {
      const ruta = (id: string) => `/profesionales/${id}/usuario`;
      const libre = await crearProfesional(a, 'Libre');

      const deOtroNegocio = await persona(b, 'empleado');
      expect((await api(duenoA.token, 'PUT', ruta(libre), { usuarioId: deOtroNegocio.id })).status).toBe(404);
      expect((await api(duenoA.token, 'PUT', ruta(libre), { usuarioId: admin.id })).status).toBe(404);
      expect((await api(duenoA.token, 'PUT', ruta(libre), { usuarioId: 'no-es-uuid' })).status).toBe(400);
      expect((await api(duenoA.token, 'PUT', ruta(libre), {})).status).toBe(400);

      const ocupado = await persona(a, 'empleado', await crearProfesional(a, 'Ocupado'));
      expect((await api(duenoA.token, 'PUT', ruta(libre), { usuarioId: ocupado.id })).status).toBe(409);

      const desactivado = await persona(a, 'empleado');
      await api(duenoA.token, 'POST', `/auth/usuarios/${desactivado.id}/desactivar`);
      expect((await api(duenoA.token, 'PUT', ruta(libre), { usuarioId: desactivado.id })).status).toBe(409);

      const inactivo = await crearProfesional(a, 'Inactivo');
      await api(duenoA.token, 'POST', `/profesionales/${inactivo}/desactivar`);
      const disponible = await persona(a, 'empleado');
      expect((await api(duenoA.token, 'PUT', ruta(inactivo), { usuarioId: disponible.id })).status).toBe(409);
    });
  });

  describe('invitar empleados', () => {
    const invitar = (token: string, cuerpo: Record<string, unknown>) =>
      api(token, 'POST', '/auth/usuarios/invitar', { nombre: 'Nueva', ...cuerpo });

    it('exige el barbero y lo deja asociado desde que acepta', async () => {
      const email = correo();
      expect((await invitar(duenoA.token, { email, rol: 'empleado' })).status).toBe(400);

      const id = await crearProfesional(a, 'Para invitar');
      const r = await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: id });
      expect(r.status).toBe(201);
      expect((await estadoDe(duenoA.token, r.json.usuarioId)).profesionalId).toBe(id);

      await aceptarInvitacion(tokenDelEnlace(r.json.enlace), CLAVE);
      const { token } = await iniciarSesion(email, CLAVE);
      const rango = 'desde=2030-06-10T00:00:00Z&hasta=2030-06-11T00:00:00Z';
      expect((await api(token, 'GET', `/citas?${rango}`)).status).toBe(200);
    });

    it('si el barbero no sirve no crea el usuario, y no le quita el acceso a quien ya estaba', async () => {
      const email = correo();
      const conUsuario = await crearProfesional(a, 'Con usuario');
      const actual = await persona(a, 'empleado', conUsuario);
      const inactivo = await crearProfesional(a, 'Inactivo');
      await api(duenoA.token, 'POST', `/profesionales/${inactivo}/desactivar`);
      const deB = await crearProfesional(b, 'De B');

      expect((await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: conUsuario })).status).toBe(409);
      expect((await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: inactivo })).status).toBe(409);
      expect((await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: deB })).status).toBe(404);
      expect((await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: randomUUID() })).status).toBe(404);
      expect((await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: 'mal' })).status).toBe(400);

      // Ningún intento dejó el usuario creado: el correo sigue libre.
      const libre = await crearProfesional(a, 'Libre');
      expect((await invitar(duenoA.token, { email, rol: 'empleado', profesionalId: libre })).status).toBe(201);
      expect((await api(duenoA.token, 'GET', `/profesionales/${conUsuario}`)).json.usuarioId).toBe(actual.id);
    });

    it('un dueño no se asocia en la invitación', async () => {
      const id = await crearProfesional(a, 'X');
      const r = await invitar(admin.token, { email: correo(), rol: 'dueno', profesionalId: id, negocioId: a.negocioId });
      expect(r.status).toBe(400);
    });
  });

  describe('listar usuarios', () => {
    it('muestra estados y barbero, sin contraseñas y sin usuarios de otro negocio', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const baja = await persona(n, 'empleado');
      await api(dueno.token, 'POST', `/auth/usuarios/${baja.id}/desactivar`);
      const id = await crearProfesional(n, 'Barbero');
      const pendiente = await api(dueno.token, 'POST', '/auth/usuarios/invitar', {
        email: correo(), nombre: 'Pendiente', rol: 'empleado', profesionalId: id,
      });

      const { status, json } = await api(dueno.token, 'GET', '/auth/usuarios');
      expect(status).toBe(200);
      expect(json.usuarios).toHaveLength(3);
      const porId = Object.fromEntries(json.usuarios.map((u: { id: string }) => [u.id, u]));
      expect(porId[dueno.id]).toMatchObject({ estado: 'activo', rol: 'dueno', profesionalId: null });
      expect(porId[baja.id].estado).toBe('desactivado');
      expect(porId[pendiente.json.usuarioId]).toMatchObject({ estado: 'pendiente', profesionalId: id });
      expect(JSON.stringify(json)).not.toMatch(/password|hash|token/i);
    });

    it('el superadmin indica el negocio; el dueño no ve otro; el empleado no entra', async () => {
      expect((await api(admin.token, 'GET', '/auth/usuarios')).status).toBe(400);
      expect((await api(admin.token, 'GET', `/auth/usuarios?negocioId=${randomUUID()}`)).status).toBe(404);
      expect(await estadoDe(admin.token, duenoB.id, b.negocioId)).toMatchObject({ estado: 'activo' });

      expect((await api(duenoA.token, 'GET', `/auth/usuarios?negocioId=${b.negocioId}`)).status).toBe(403);
      const empleado = await persona(a, 'empleado');
      expect((await api(empleado.token, 'GET', '/auth/usuarios')).status).toBe(403);
    });
  });

  describe('desactivar un usuario', () => {
    it('corta el acceso de inmediato: sesión, login y enlaces pendientes', async () => {
      const empleado = await persona(a, 'empleado');
      const recuperacion = await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/recuperacion`, {});
      const invitado = await api(duenoA.token, 'POST', '/auth/usuarios/invitar', {
        email: correo(), nombre: 'Por aceptar', rol: 'empleado', profesionalId: await crearProfesional(a),
      });

      expect((await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/desactivar`)).status).toBe(204);
      expect((await api(duenoA.token, 'POST', `/auth/usuarios/${invitado.json.usuarioId}/desactivar`)).status).toBe(204);

      expect((await api(empleado.token, 'GET', '/auth/yo')).status).toBe(401);
      expect((await api(null, 'POST', '/auth/login', { email: empleado.email, password: CLAVE })).status).toBe(401);
      const usarRecuperacion = await api(null, 'POST', '/auth/restablecer', {
        token: tokenDelEnlace(recuperacion.json.enlace), password: 'clave-nueva-muy-larga',
      });
      expect(usarRecuperacion.status).toBe(401);
      const aceptar = await api(null, 'POST', '/auth/aceptar-invitacion', {
        token: tokenDelEnlace(invitado.json.enlace), password: CLAVE,
      });
      expect(aceptar.status).toBe(401);
    });

    it('la recuperación no reactiva: ni se genera, ni sirve un enlace que quedó vivo', async () => {
      const empleado = await persona(a, 'empleado');
      const enlace = await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/recuperacion`, {});

      // Se apaga directo en la base: el enlace sigue vigente, como si se hubiera escapado de la anulación.
      await conNegocio(a.negocioId, (tx) => tx.consultar('UPDATE usuarios SET activo = false WHERE id = $1', [empleado.id]));

      const uso = await api(null, 'POST', '/auth/restablecer', {
        token: tokenDelEnlace(enlace.json.enlace), password: 'clave-nueva-muy-larga',
      });
      expect(uso.status).toBe(401);
      expect((await estadoDe(duenoA.token, empleado.id)).estado).toBe('desactivado');
      expect((await api(null, 'POST', '/auth/login', { email: empleado.email, password: CLAVE })).status).toBe(401);
      expect((await api(null, 'POST', '/auth/login', { email: empleado.email, password: 'clave-nueva-muy-larga' })).status).toBe(401);

      const nueva = await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/recuperacion`, {});
      expect(nueva.status).toBe(409);
    });

    it('la recuperación tampoco activa a un invitado pendiente', async () => {
      const invitado = await api(duenoA.token, 'POST', '/auth/usuarios/invitar', {
        email: correo(), nombre: 'Pendiente', rol: 'empleado', profesionalId: await crearProfesional(a),
      });
      const r = await api(duenoA.token, 'POST', `/auth/usuarios/${invitado.json.usuarioId}/recuperacion`, {});
      expect(r.status).toBe(409);
    });

    it('nadie desactiva al último dueño activo, ni él mismo ni el superadmin', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');

      const propio = await api(dueno.token, 'POST', `/auth/usuarios/${dueno.id}/desactivar`);
      expect(propio.status).toBe(409);
      const delAdmin = await api(admin.token, 'POST', `/auth/usuarios/${dueno.id}/desactivar`, { negocioId: n.negocioId });
      expect(delAdmin.status).toBe(409);
      expect((await api(dueno.token, 'GET', '/auth/yo')).status).toBe(200);
    });

    it('un dueño pendiente no cuenta como dueño activo', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      await api(admin.token, 'POST', '/auth/usuarios/invitar', {
        email: correo(), nombre: 'Por aceptar', rol: 'dueno', negocioId: n.negocioId,
      });
      expect((await api(dueno.token, 'POST', `/auth/usuarios/${dueno.id}/desactivar`)).status).toBe(409);
    });

    it('con dos dueños uno se puede desactivar; el que queda ya no', async () => {
      const n = await negocioNuevo();
      const uno = await persona(n, 'dueno');
      const dos = await persona(n, 'dueno');

      expect((await api(uno.token, 'POST', `/auth/usuarios/${dos.id}/desactivar`)).status).toBe(204);
      expect((await api(uno.token, 'POST', `/auth/usuarios/${uno.id}/desactivar`)).status).toBe(409);
    });

    it('dos dueños que se desactivan a la vez no dejan el negocio sin ninguno', async () => {
      const n = await negocioNuevo();
      const uno = await persona(n, 'dueno');
      const dos = await persona(n, 'dueno');

      const respuestas = await Promise.all([
        api(uno.token, 'POST', `/auth/usuarios/${dos.id}/desactivar`),
        api(dos.token, 'POST', `/auth/usuarios/${uno.id}/desactivar`),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([204, 409]);
    });

    it('permisos: el empleado no, y un usuario de otro negocio responde 404', async () => {
      const empleado = await persona(a, 'empleado');
      const otro = await persona(a, 'empleado');
      expect((await api(empleado.token, 'POST', `/auth/usuarios/${otro.id}/desactivar`)).status).toBe(403);
      expect((await api(duenoA.token, 'POST', `/auth/usuarios/${duenoB.id}/desactivar`)).status).toBe(404);
      expect((await api(duenoA.token, 'POST', '/auth/usuarios/no-es-uuid/desactivar')).status).toBe(400);
      expect((await api(duenoB.token, 'GET', '/auth/yo')).status).toBe(200);
    });

    it('un dueño suspendido no desactiva; el superadmin sí', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const empleado = await persona(n, 'empleado');
      await fijarEstado(n, 'suspendido');
      const ruta = `/auth/usuarios/${empleado.id}/desactivar`;
      expect((await api(dueno.token, 'POST', ruta)).status).toBe(403);
      expect((await api(admin.token, 'POST', ruta, { negocioId: n.negocioId })).status).toBe(204);
    });
  });

  describe('reenviar invitación', () => {
    it('reactiva a un desactivado con su barbero, sin revivir sus sesiones viejas', async () => {
      const id = await crearProfesional(a, 'Regresa');
      const empleado = await persona(a, 'empleado', id);
      await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/desactivar`);

      const r = await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/reenviar-invitacion`, {});
      expect(r.status).toBe(201);
      expect(r.json.enlace).toContain('/aceptar-invitacion#token=');
      expect((await api(null, 'POST', '/auth/login', { email: empleado.email, password: CLAVE })).status).toBe(401);

      const nueva = 'clave-de-regreso-1';
      const aceptar = await api(null, 'POST', '/auth/aceptar-invitacion', { token: tokenDelEnlace(r.json.enlace), password: nueva });
      expect(aceptar.status).toBe(204);

      expect((await api(empleado.token, 'GET', '/auth/yo')).status).toBe(401);
      expect((await api(null, 'POST', '/auth/login', { email: empleado.email, password: CLAVE })).status).toBe(401);
      const { token } = await iniciarSesion(empleado.email, nueva);
      const rango = 'desde=2030-06-10T00:00:00Z&hasta=2030-06-11T00:00:00Z';
      expect((await api(token, 'GET', `/citas?${rango}`)).status).toBe(200);
    });

    it('da un enlace nuevo a un pendiente y anula el anterior', async () => {
      const email = correo();
      const invitado = await api(duenoA.token, 'POST', '/auth/usuarios/invitar', {
        email, nombre: 'Pendiente', rol: 'empleado', profesionalId: await crearProfesional(a),
      });
      const ruta = `/auth/usuarios/${invitado.json.usuarioId}/reenviar-invitacion`;
      const nuevo = await api(duenoA.token, 'POST', ruta, {});
      expect(nuevo.status).toBe(201);

      const viejo = await api(null, 'POST', '/auth/aceptar-invitacion', { token: tokenDelEnlace(invitado.json.enlace), password: CLAVE });
      expect(viejo.status).toBe(401);
      const valido = await api(null, 'POST', '/auth/aceptar-invitacion', { token: tokenDelEnlace(nuevo.json.enlace), password: CLAVE });
      expect(valido.status).toBe(204);
      await iniciarSesion(email, CLAVE);
    });

    it('no sirve para un usuario activo: daría una forma de cambiarle la contraseña', async () => {
      const empleado = await persona(a, 'empleado');
      const r = await api(duenoA.token, 'POST', `/auth/usuarios/${empleado.id}/reenviar-invitacion`, {});
      expect(r.status).toBe(409);
      expect((await api(empleado.token, 'GET', '/auth/yo')).status).toBe(200);
    });

    it('el dueño no la pide para otro dueño, pero el superadmin sí', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const otro = await persona(n, 'dueno');
      await api(dueno.token, 'POST', `/auth/usuarios/${otro.id}/desactivar`);
      const ruta = `/auth/usuarios/${otro.id}/reenviar-invitacion`;

      expect((await api(dueno.token, 'POST', ruta, {})).status).toBe(403);
      expect((await api(admin.token, 'POST', ruta, { negocioId: n.negocioId })).status).toBe(201);
    });

    it('permisos: empleado, otro negocio y negocio suspendido', async () => {
      const n = await negocioNuevo();
      const dueno = await persona(n, 'dueno');
      const empleado = await persona(n, 'empleado');
      const baja = await persona(n, 'empleado');
      await api(dueno.token, 'POST', `/auth/usuarios/${baja.id}/desactivar`);
      const ruta = `/auth/usuarios/${baja.id}/reenviar-invitacion`;

      expect((await api(empleado.token, 'POST', ruta, {})).status).toBe(403);
      expect((await api(duenoA.token, 'POST', ruta, {})).status).toBe(404);
      await fijarEstado(n, 'suspendido');
      expect((await api(dueno.token, 'POST', ruta, {})).status).toBe(403);
      expect((await api(admin.token, 'POST', ruta, { negocioId: n.negocioId })).status).toBe(201);
    });
  });
});
