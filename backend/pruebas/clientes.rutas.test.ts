import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { NoEncontrado } from '../src/compartido/errores.js';
import { conNegocio, conSistema, type Transaccion } from '../src/db/contexto.js';
import { iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import { crearCita as agendarCita } from '../src/modulos/citas/citas.servicio.js';
import { bloquearClienteVigente } from '../src/modulos/citas/citas.repositorio.js';
import * as repositorio from '../src/modulos/clientes/clientes.repositorio.js';
import {
  crearCita,
  crearCliente,
  crearHorario,
  crearNegocio,
  crearProfesional,
  crearServicio,
  hora,
  limpiar,
  type EstadoCita,
  type NegocioDePrueba,
} from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const NINGUNO = '00000000-0000-4000-8000-000000000000';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('rutas de clientes', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let duenoA: string;
  let admin: string;
  let barberoA: string;
  let barberoB: string;
  let empleadoA: string;
  let sinBarbero: string;
  const superadmins: string[] = [];
  let telefonos = 0;

  async function sesion(n: NegocioDePrueba | null, rol: string, profesionalId?: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const hash = await argon2.hash(CLAVE);
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
                 VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, hash];
    const { rows } = n
      ? await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))
      : await conSistema((tx) => tx.consultar<{ id: string }>(sql, params));
    if (!n) superadmins.push(rows[0]!.id);
    if (n && profesionalId) {
      await conNegocio(n.negocioId, (tx) =>
        tx.consultar('UPDATE profesionales SET usuario_id = $1 WHERE id = $2', [rows[0]!.id, profesionalId]),
      );
    }
    return (await iniciarSesion(email, CLAVE)).token;
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

  const ids = (lista: { id: string }[]) => lista.map((x) => x.id);
  const sql = <T extends object>(n: NegocioDePrueba, texto: string, params: unknown[] = []) =>
    conNegocio(n.negocioId, async (tx) => (await tx.consultar<T>(texto, params)).rows);

  /** Teléfono distinto en cada llamada. */
  const nuevoTelefono = () => `573${String(++telefonos).padStart(9, '0')}`;

  async function cliente(n: NegocioDePrueba, nombre: string | null, telefono = nuevoTelefono()) {
    const [fila] = await sql<{ id: string }>(
      n,
      'INSERT INTO clientes (negocio_id, nombre, telefono) VALUES ($1, $2, $3) RETURNING id',
      [n.negocioId, nombre, telefono],
    );
    return { id: fila!.id, telefono };
  }

  /** Citas sueltas en días distintos para que no choquen entre sí. */
  let diaDeCita = 0;
  function citaDe(n: NegocioDePrueba, profesionalId: string, clienteId: string, estado?: EstadoCita) {
    diaDeCita += 1;
    const dia = `2031-01-${String(1 + (diaDeCita % 28)).padStart(2, '0')}`;
    const minuto = String(diaDeCita % 60).padStart(2, '0');
    return crearCita(n, {
      profesionalId,
      clienteId,
      inicio: hora(`10:${minuto}`, dia),
      fin: hora(`11:${minuto}`, dia),
      ...(estado && { estado }),
    });
  }

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    duenoA = await sesion(a, 'dueno');
    admin = await sesion(null, 'superadmin');
    barberoA = await crearProfesional(a, 'Del empleado');
    barberoB = await crearProfesional(a, 'Otro barbero');
    empleadoA = await sesion(a, 'empleado', barberoA);
    sinBarbero = await sesion(a, 'empleado');
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
  });

  describe('permisos', () => {
    it('sin sesión responde 401 en todas las rutas', async () => {
      const { id } = await cliente(a, 'Ana');
      for (const [metodo, ruta] of [
        ['GET', '/clientes'],
        ['GET', `/clientes/${id}`],
        ['PATCH', `/clientes/${id}`],
        ['POST', `/clientes/${id}/anonimizar`],
      ] as const) {
        expect((await api(null, metodo, ruta, metodo === 'GET' ? undefined : {})).status).toBe(401);
      }
    });

    it('el superadmin no entra a los clientes de un negocio', async () => {
      const { id } = await cliente(a, 'Ana');
      expect((await api(admin, 'GET', '/clientes')).status).toBe(403);
      expect((await api(admin, 'GET', `/clientes/${id}`)).status).toBe(403);
      expect((await api(admin, 'PATCH', `/clientes/${id}`, { nombre: 'X' })).status).toBe(403);
      expect((await api(admin, 'POST', `/clientes/${id}/anonimizar`)).status).toBe(403);
    });

    it('un empleado sin barbero no ve clientes', async () => {
      const { id } = await cliente(a, 'Ana');
      expect((await api(sinBarbero, 'GET', '/clientes')).status).toBe(403);
      expect((await api(sinBarbero, 'GET', `/clientes/${id}`)).status).toBe(403);
    });

    it('el empleado ve solo los clientes con citas de su barbero, en cualquier estado', async () => {
      const propio = await cliente(a, 'Propio empleado');
      const cancelado = await cliente(a, 'Cancelado empleado');
      const ajeno = await cliente(a, 'Ajeno empleado');
      const sinCitas = await cliente(a, 'Sin citas empleado');
      await citaDe(a, barberoA, propio.id);
      await citaDe(a, barberoA, cancelado.id, 'cancelada');
      await citaDe(a, barberoB, ajeno.id);

      const lista = await api(empleadoA, 'GET', '/clientes?buscar=empleado');
      expect(lista.status).toBe(200);
      expect(ids(lista.json.clientes).sort()).toEqual([propio.id, cancelado.id].sort());

      expect((await api(empleadoA, 'GET', `/clientes/${propio.id}`)).status).toBe(200);
      expect((await api(empleadoA, 'GET', `/clientes/${ajeno.id}`)).status).toBe(404);
      expect((await api(empleadoA, 'GET', `/clientes/${sinCitas.id}`)).status).toBe(404);

      const delDueno = await api(duenoA, 'GET', '/clientes?buscar=empleado');
      expect(ids(delDueno.json.clientes)).toHaveLength(4);
    });

    it('un cliente con citas de varios barberos aparece una sola vez', async () => {
      const { id } = await cliente(a, 'Repetido varios');
      await citaDe(a, barberoA, id);
      await citaDe(a, barberoA, id);
      await citaDe(a, barberoB, id);
      expect(ids((await api(empleadoA, 'GET', '/clientes?buscar=Repetido')).json.clientes)).toEqual([id]);
    });

    it('el empleado no edita ni anonimiza, ni siquiera a sus propios clientes', async () => {
      const { id } = await cliente(a, 'Intocable');
      await citaDe(a, barberoA, id, 'completada');
      const editar = await api(empleadoA, 'PATCH', `/clientes/${id}`, { nombre: 'Otro' });
      const anonimizar = await api(empleadoA, 'POST', `/clientes/${id}/anonimizar`);
      expect([editar.status, anonimizar.status]).toEqual([403, 403]);
      const [fila] = await sql<{ nombre: string; anonimizado_en: Date | null }>(
        a,
        'SELECT nombre, anonimizado_en FROM clientes WHERE id = $1',
        [id],
      );
      expect(fila).toEqual({ nombre: 'Intocable', anonimizado_en: null });
    });

    it('historial: la cita más reciente primero, por páginas; el empleado ve solo las de su barbero', async () => {
      const { id } = await cliente(a, 'Con historial');
      const vieja = await crearCita(a, { profesionalId: barberoA, clienteId: id, inicio: hora('10:00', '2031-02-01'), fin: hora('10:30', '2031-02-01'), estado: 'completada' });
      const ajena = await crearCita(a, { profesionalId: barberoB, clienteId: id, inicio: hora('10:00', '2031-02-02'), fin: hora('10:30', '2031-02-02') });
      const nueva = await crearCita(a, { profesionalId: barberoA, clienteId: id, inicio: hora('10:00', '2031-02-03'), fin: hora('10:30', '2031-02-03'), estado: 'cancelada' });

      const todo = await api(duenoA, 'GET', `/clientes/${id}/citas`);
      expect(todo.status).toBe(200);
      expect(ids(todo.json.citas)).toEqual([nueva, ajena, vieja]);
      expect(todo.json.hayMas).toBe(false);
      expect(todo.json.citas[0]).toMatchObject({ estado: 'cancelada', profesionalNombre: 'Del empleado', clienteNombre: 'Con historial' });

      const primera = await api(duenoA, 'GET', `/clientes/${id}/citas?limite=2`);
      expect([ids(primera.json.citas), primera.json.hayMas]).toEqual([[nueva, ajena], true]);
      const segunda = await api(duenoA, 'GET', `/clientes/${id}/citas?limite=2&desplazamiento=2`);
      expect([ids(segunda.json.citas), segunda.json.hayMas]).toEqual([[vieja], false]);

      expect(ids((await api(empleadoA, 'GET', `/clientes/${id}/citas`)).json.citas)).toEqual([nueva, vieja]);
      expect((await api(duenoA, 'GET', `/clientes/${id}/citas?limite=101`)).status).toBe(400);
    });

    it('historial: cliente ajeno, de otro negocio o sin sesión no se ve', async () => {
      const ajeno = await cliente(a, 'Historial ajeno');
      await citaDe(a, barberoB, ajeno.id);
      const deB = await cliente(b, 'Historial de B');
      expect((await api(empleadoA, 'GET', `/clientes/${ajeno.id}/citas`)).status).toBe(404);
      expect((await api(duenoA, 'GET', `/clientes/${deB.id}/citas`)).status).toBe(404);
      expect((await api(duenoA, 'GET', `/clientes/${NINGUNO}/citas`)).status).toBe(404);
      expect((await api(duenoA, 'GET', '/clientes/no-es-id/citas')).status).toBe(404);
      expect((await api(null, 'GET', `/clientes/${ajeno.id}/citas`)).status).toBe(401);
      expect((await api(admin, 'GET', `/clientes/${ajeno.id}/citas`)).status).toBe(403);
    });

    it('un cliente de otro negocio responde 404, y su lista no se mezcla', async () => {
      const deB = await cliente(b, 'Secreto de B');
      const duenoB = await sesion(b, 'dueno');
      expect((await api(duenoA, 'GET', `/clientes/${deB.id}`)).status).toBe(404);
      expect((await api(duenoA, 'PATCH', `/clientes/${deB.id}`, { nombre: 'Hackeado' })).status).toBe(404);
      expect((await api(duenoA, 'POST', `/clientes/${deB.id}/anonimizar`)).status).toBe(404);
      expect((await api(duenoA, 'GET', '/clientes?buscar=Secreto')).json.clientes).toEqual([]);
      expect((await api(duenoB, 'GET', `/clientes/${deB.id}`)).json.nombre).toBe('Secreto de B');
    });
  });

  describe('listar y buscar', () => {
    let n: NegocioDePrueba;
    let dueno: string;
    let ana: { id: string; telefono: string };
    let anita: { id: string; telefono: string };
    let sinNombre: { id: string; telefono: string };

    beforeAll(async () => {
      n = await crearNegocio('Búsqueda');
      dueno = await sesion(n, 'dueno');
      ana = await cliente(n, 'Ana Pérez', '573111111111');
      anita = await cliente(n, 'Anita 100%', '573222222222');
      await cliente(n, 'Bruno_Ruiz', '573333333333');
      sinNombre = await cliente(n, null, '573444444444');
    });

    const buscar = async (texto: string) =>
      ids((await api(dueno, 'GET', `/clientes?buscar=${encodeURIComponent(texto)}`)).json.clientes);

    it('ordena por nombre, con los que no tienen nombre al final', async () => {
      const { json } = await api(dueno, 'GET', '/clientes');
      expect(json.clientes.map((c: { nombre: string | null }) => c.nombre)).toEqual([
        'Ana Pérez',
        'Anita 100%',
        'Bruno_Ruiz',
        null,
      ]);
      expect(json.clientes[0]).toEqual({
        id: ana.id,
        nombre: 'Ana Pérez',
        telefono: '573111111111',
        notas: null,
        anonimizadoEn: null,
        createdAt: expect.any(String),
      });
    });

    it('busca por parte del nombre sin importar mayúsculas', async () => {
      expect(await buscar('ANA P')).toEqual([ana.id]);
      expect((await buscar('an')).sort()).toEqual([ana.id, anita.id].sort());
    });

    it('busca por teléfono en cualquier formato', async () => {
      expect(await buscar('311 111')).toEqual([ana.id]);
      expect(await buscar('+57 (311) 111-1111')).toEqual([ana.id]);
      expect(await buscar('573444')).toEqual([sinNombre.id]);
    });

    it('un texto con letras y números no busca por teléfono', async () => {
      expect(await buscar('Ana 1')).toEqual([]);
      expect(await buscar('Anita 1')).toEqual([anita.id]);
    });

    it('% y _ se buscan como texto, no como comodines', async () => {
      expect(await buscar('%')).toEqual([anita.id]);
      expect((await buscar('_')).length).toBe(1);
      expect(await buscar('\\')).toEqual([]);
    });

    it('una búsqueda con solo espacios equivale a no buscar', async () => {
      expect(await buscar('   ')).toHaveLength(4);
    });

    it('pagina con hayMas sin perder ni repetir clientes', async () => {
      const uno = await api(dueno, 'GET', '/clientes?limite=3');
      expect(uno.json.clientes).toHaveLength(3);
      expect(uno.json.hayMas).toBe(true);
      const dos = await api(dueno, 'GET', '/clientes?limite=3&desplazamiento=3');
      expect(dos.json.clientes).toHaveLength(1);
      expect(dos.json.hayMas).toBe(false);
      const todos = [...ids(uno.json.clientes), ...ids(dos.json.clientes)];
      expect(new Set(todos).size).toBe(4);
    });

    it('exactamente el límite no dice que hay más', async () => {
      const { json } = await api(dueno, 'GET', '/clientes?limite=4');
      expect(json.clientes).toHaveLength(4);
      expect(json.hayMas).toBe(false);
    });

    it.each(['limite=0', 'limite=101', 'limite=abc', 'desplazamiento=-1', 'otro=1', `buscar=${'x'.repeat(101)}`])(
      'rechaza el filtro %s',
      async (filtro) => {
        expect((await api(dueno, 'GET', `/clientes?${filtro}`)).status).toBe(400);
      },
    );

    it('un id mal escrito o inexistente responde 404', async () => {
      expect((await api(dueno, 'GET', '/clientes/no-es-uuid')).status).toBe(404);
      expect((await api(dueno, 'GET', `/clientes/${NINGUNO}`)).status).toBe(404);
    });
  });

  describe('editar', () => {
    it('cambia nombre y notas, y limpia el texto', async () => {
      const { id } = await cliente(a, 'Antes');
      const r = await api(duenoA, 'PATCH', `/clientes/${id}`, { nombre: '  Después ', notas: ' Alérgico al talco ' });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ id, nombre: 'Después', notas: 'Alérgico al talco' });
    });

    it('solo cambia lo que se envía', async () => {
      const { id, telefono } = await cliente(a, 'Fijo');
      await api(duenoA, 'PATCH', `/clientes/${id}`, { notas: 'Una nota' });
      const r = await api(duenoA, 'PATCH', `/clientes/${id}`, { nombre: 'Nuevo' });
      expect(r.json).toMatchObject({ nombre: 'Nuevo', telefono, notas: 'Una nota' });
    });

    it('null o texto vacío quitan el nombre y las notas', async () => {
      const { id } = await cliente(a, 'Con nombre');
      await api(duenoA, 'PATCH', `/clientes/${id}`, { notas: 'Nota' });
      const r = await api(duenoA, 'PATCH', `/clientes/${id}`, { nombre: null, notas: '   ' });
      expect(r.json).toMatchObject({ nombre: null, notas: null });
    });

    it('normaliza el teléfono', async () => {
      const { id } = await cliente(a, 'Nuevo número');
      const r = await api(duenoA, 'PATCH', `/clientes/${id}`, { telefono: '(320) 555-0001' });
      expect(r.json.telefono).toBe('573205550001');
    });

    it('un teléfono de otro cliente del negocio responde 409 y no cambia nada', async () => {
      const uno = await cliente(a, 'Uno');
      const dos = await cliente(a, 'Dos');
      const r = await api(duenoA, 'PATCH', `/clientes/${dos.id}`, { telefono: uno.telefono, nombre: 'Cambiado' });
      expect(r.status).toBe(409);
      expect(r.json.error.codigo).toBe('DUPLICADO');
      const [fila] = await sql<{ nombre: string; telefono: string }>(
        a,
        'SELECT nombre, telefono FROM clientes WHERE id = $1',
        [dos.id],
      );
      expect(fila).toEqual({ nombre: 'Dos', telefono: dos.telefono });
    });

    it('el mismo teléfono puede estar en otro negocio', async () => {
      const deB = await cliente(b, 'En B');
      const deA = await cliente(a, 'En A');
      expect((await api(duenoA, 'PATCH', `/clientes/${deA.id}`, { telefono: deB.telefono })).status).toBe(200);
    });

    it.each([
      [{}, 'cuerpo vacío'],
      [{ nombre: undefined }, 'solo undefined'],
      [{ telefono: null }, 'teléfono nulo'],
      [{ telefono: 'abc' }, 'teléfono inválido'],
      [{ telefono: '' }, 'teléfono vacío'],
      [{ nombre: 'x'.repeat(101) }, 'nombre largo'],
      [{ notas: 'x'.repeat(2001) }, 'notas largas'],
      [{ nombre: 5 }, 'nombre que no es texto'],
      [{ negocioId: NINGUNO }, 'campo desconocido'],
      [{ anonimizadoEn: null }, 'campo protegido'],
      [{ nombre: 'Válido', anonimizadoEn: '2030-01-01T00:00:00Z' }, 'campo desconocido junto a uno válido'],
    ])('rechaza %j (%s)', async (cuerpo, _motivo) => {
      const { id } = await cliente(a, 'Validación');
      expect((await api(duenoA, 'PATCH', `/clientes/${id}`, cuerpo)).status).toBe(400);
    });

    it('un cliente inexistente responde 404', async () => {
      expect((await api(duenoA, 'PATCH', `/clientes/${NINGUNO}`, { nombre: 'X' })).status).toBe(404);
      expect((await api(duenoA, 'PATCH', '/clientes/no-es-uuid', { nombre: 'X' })).status).toBe(404);
    });
  });

  describe('anonimizar', () => {
    /** Cliente con todo lo que guarda datos de una persona. */
    async function clienteCompleto(n: NegocioDePrueba, profesionalId: string, cuenta: string) {
      const c = await cliente(n, 'Persona real');
      await sql(n, "UPDATE clientes SET notas = 'Nota privada' WHERE id = $1", [c.id]);
      const citaId = await citaDe(n, profesionalId, c.id, 'completada');
      await sql(n, "UPDATE citas SET notas = 'Dato de la cita' WHERE id = $1", [citaId]);
      const [conv] = await sql<{ id: string }>(
        n,
        `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id) VALUES ($1, $2, $3) RETURNING id`,
        [n.negocioId, c.id, cuenta],
      );
      await sql(
        n,
        `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido)
         VALUES ($1, $2, 'entrante', 'cliente', 'texto', 'Hola, soy Persona real')`,
        [n.negocioId, conv!.id],
      );
      await sql(
        n,
        `INSERT INTO derivaciones (negocio_id, conversacion_id, motivo, detalle)
         VALUES ($1, $2, 'cliente_pidio_humano', 'Lo que preguntó')`,
        [n.negocioId, conv!.id],
      );
      await sql(n, `INSERT INTO consentimientos (negocio_id, cliente_id, version_politica) VALUES ($1, $2, 'v1')`, [
        n.negocioId,
        c.id,
      ]);
      return { ...c, citaId, conversacionId: conv!.id };
    }

    let cuentaA: string;
    beforeAll(async () => {
      const [fila] = await sql<{ id: string }>(
        a,
        `INSERT INTO whatsapp_cuentas (negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
         VALUES ($1, $2, 'waba', '573000000000', 'sin-uso-en-pruebas') RETURNING id`,
        [a.negocioId, randomUUID()],
      );
      cuentaA = fila!.id;
    });

    it('borra los datos personales y conserva la cita y el consentimiento', async () => {
      const c = await clienteCompleto(a, barberoA, cuentaA);
      expect((await api(duenoA, 'POST', `/clientes/${c.id}/anonimizar`)).status).toBe(204);

      const [fila] = await sql<Record<string, unknown>>(
        a,
        'SELECT nombre, telefono, notas, anonimizado_en FROM clientes WHERE id = $1',
        [c.id],
      );
      expect(fila).toEqual({ nombre: null, telefono: null, notas: null, anonimizado_en: expect.any(Date) });

      const [cita] = await sql<{ notas: string | null; estado: string }>(
        a,
        'SELECT notas, estado FROM citas WHERE id = $1',
        [c.citaId],
      );
      expect(cita).toEqual({ notas: null, estado: 'completada' });

      for (const consulta of [
        'SELECT 1 FROM conversaciones WHERE id = $1',
        'SELECT 1 FROM mensajes WHERE conversacion_id = $1',
        'SELECT 1 FROM derivaciones WHERE conversacion_id = $1',
      ]) {
        expect(await sql(a, consulta, [c.conversacionId])).toHaveLength(0);
      }
      expect(await sql(a, 'SELECT 1 FROM consentimientos WHERE cliente_id = $1', [c.id])).toHaveLength(1);
    });

    it('no toca los datos de otros clientes', async () => {
      const objetivo = await clienteCompleto(a, barberoA, cuentaA);
      const vecino = await clienteCompleto(a, barberoA, cuentaA);
      expect((await api(duenoA, 'POST', `/clientes/${objetivo.id}/anonimizar`)).status).toBe(204);

      const [fila] = await sql<{ nombre: string; telefono: string; notas: string }>(
        a,
        'SELECT nombre, telefono, notas FROM clientes WHERE id = $1',
        [vecino.id],
      );
      expect(fila).toEqual({ nombre: 'Persona real', telefono: vecino.telefono, notas: 'Nota privada' });
      const [cita] = await sql<{ notas: string }>(a, 'SELECT notas FROM citas WHERE id = $1', [vecino.citaId]);
      expect(cita!.notas).toBe('Dato de la cita');
      expect(await sql(a, 'SELECT 1 FROM mensajes WHERE conversacion_id = $1', [vecino.conversacionId])).toHaveLength(1);
    });

    it.each(['por_aprobar', 'pendiente', 'confirmada'] as const)(
      'con una cita %s se rechaza, dice cuántas y no borra nada',
      async (estado) => {
        const c = await clienteCompleto(a, barberoA, cuentaA);
        await citaDe(a, barberoA, c.id, estado);
        const r = await api(duenoA, 'POST', `/clientes/${c.id}/anonimizar`);
        expect(r.status).toBe(409);
        expect(r.json.error.mensaje).toContain('1 cita');
        const [fila] = await sql<{ telefono: string | null }>(a, 'SELECT telefono FROM clientes WHERE id = $1', [c.id]);
        expect(fila!.telefono).toBe(c.telefono);
        expect(await sql(a, 'SELECT 1 FROM conversaciones WHERE id = $1', [c.conversacionId])).toHaveLength(1);
      },
    );

    it('una cita activa cuya hora ya pasó también lo impide', async () => {
      const c = await cliente(a, 'Con cita vieja');
      await crearCita(a, {
        profesionalId: barberoB,
        clienteId: c.id,
        inicio: hora('08:00', '2020-02-03'),
        fin: hora('08:30', '2020-02-03'),
      });
      expect((await api(duenoA, 'POST', `/clientes/${c.id}/anonimizar`)).status).toBe(409);
    });

    it.each(['completada', 'cancelada', 'no_asistio'] as const)('una cita %s no lo impide', async (estado) => {
      const c = await cliente(a, 'Con cita final');
      await citaDe(a, barberoA, c.id, estado);
      expect((await api(duenoA, 'POST', `/clientes/${c.id}/anonimizar`)).status).toBe(204);
    });

    it('anonimizar dos veces responde 409', async () => {
      const { id } = await cliente(a, 'Dos veces');
      expect((await api(duenoA, 'POST', `/clientes/${id}/anonimizar`)).status).toBe(204);
      expect((await api(duenoA, 'POST', `/clientes/${id}/anonimizar`)).status).toBe(409);
    });

    it('un cliente inexistente responde 404', async () => {
      expect((await api(duenoA, 'POST', `/clientes/${NINGUNO}/anonimizar`)).status).toBe(404);
      expect((await api(duenoA, 'POST', '/clientes/no-es-uuid/anonimizar')).status).toBe(404);
    });

    it('un anonimizado no se puede editar: nunca recupera datos', async () => {
      const { id } = await cliente(a, 'Sin regreso');
      await api(duenoA, 'POST', `/clientes/${id}/anonimizar`);
      const r = await api(duenoA, 'PATCH', `/clientes/${id}`, { nombre: 'Otra vez', telefono: nuevoTelefono() });
      expect(r.status).toBe(409);
      const [fila] = await sql<{ nombre: string | null }>(a, 'SELECT nombre FROM clientes WHERE id = $1', [id]);
      expect(fila!.nombre).toBeNull();
    });

    it('no aparece en la lista, pero se consulta por id y conserva sus citas', async () => {
      const c = await cliente(a, 'Invisible tras borrar');
      const citaId = await citaDe(a, barberoA, c.id, 'completada');
      await api(duenoA, 'POST', `/clientes/${c.id}/anonimizar`);

      expect((await api(duenoA, 'GET', '/clientes?buscar=Invisible')).json.clientes).toEqual([]);
      expect(ids((await api(duenoA, 'GET', '/clientes?limite=100')).json.clientes)).not.toContain(c.id);

      const directo = await api(duenoA, 'GET', `/clientes/${c.id}`);
      expect(directo.status).toBe(200);
      expect(directo.json).toMatchObject({ nombre: null, telefono: null, anonimizadoEn: expect.any(String) });

      const cita = await api(duenoA, 'GET', `/citas/${citaId}`);
      expect(cita.status).toBe(200);
      expect(cita.json).toMatchObject({ clienteNombre: null, clienteTelefono: null });
    });

    it('varios anonimizados conviven, y si la persona vuelve es un cliente nuevo', async () => {
      const uno = await cliente(a, 'Vuelve', '573900000001');
      const dos = await cliente(a, 'Otro', '573900000002');
      expect((await api(duenoA, 'POST', `/clientes/${uno.id}/anonimizar`)).status).toBe(204);
      expect((await api(duenoA, 'POST', `/clientes/${dos.id}/anonimizar`)).status).toBe(204);

      const barbero = await crearProfesional(a, 'Agenda');
      const servicio = await crearServicio(a, barbero);
      for (const dia of [1, 2, 3, 4, 5, 6, 7]) await crearHorario(a, barbero, dia, '00:00', '24:00');
      const inicio = new Date(Date.now() + 5 * 24 * 3_600_000);
      inicio.setUTCMinutes(0, 0, 0);
      const r = await api(duenoA, 'POST', '/citas', {
        profesionalId: barbero,
        servicioIds: [servicio],
        inicio: inicio.toISOString(),
        cliente: { telefono: '573900000001', nombre: 'Vuelve de nuevo' },
      });
      expect(r.status).toBe(201);
      expect(r.json.clienteId).not.toBe(uno.id);
      const [nuevo] = await sql<{ nombre: string }>(a, 'SELECT nombre FROM clientes WHERE telefono = $1', [
        '573900000001',
      ]);
      expect(nuevo!.nombre).toBe('Vuelve de nuevo');
    });

    it('la base impide un anonimizado con datos y un vigente sin teléfono', async () => {
      const { id } = await cliente(a, 'Restricción');
      for (const cambio of [
        'anonimizado_en = now()',
        "anonimizado_en = now(), telefono = NULL, nombre = 'Queda'",
        "anonimizado_en = now(), telefono = NULL, nombre = NULL, notas = 'Queda'",
        'telefono = NULL',
      ]) {
        await expect(sql(a, `UPDATE clientes SET ${cambio} WHERE id = $1`, [id])).rejects.toMatchObject({
          constraint: 'clientes_anonimizado_sin_datos',
        });
      }
    });
  });

  describe('carreras entre anonimizar y agendar', () => {
    let barbero: string;
    let servicio: string;

    beforeAll(async () => {
      barbero = await crearProfesional(a, 'Carreras');
      servicio = await crearServicio(a, barbero);
      for (const dia of [1, 2, 3, 4, 5, 6, 7]) await crearHorario(a, barbero, dia, '00:00', '24:00');
    });

    /** Hueco libre y en el futuro; cada llamada usa un día distinto. */
    let dias = 3;
    function inicioLibre(): Date {
      dias += 1;
      const inicio = new Date(Date.now() + dias * 24 * 3_600_000);
      inicio.setUTCHours(15, 0, 0, 0);
      return inicio;
    }

    it('agendar espera a la anonimización en curso y luego se rechaza', async () => {
      const { id } = await cliente(a, 'Carrera uno');
      let agenda: Promise<unknown> | undefined;
      await conNegocio(a.negocioId, async (tx: Transaccion) => {
        await repositorio.obtenerBloqueado(tx, id);
        await repositorio.anonimizar(tx, id);
        agenda = agendarCita(a.negocioId, {
          profesionalId: barbero,
          clienteId: id,
          servicioIds: [servicio],
          inicio: inicioLibre(),
          origen: 'panel',
        }).catch((e: unknown) => e);
        await espera(150);
      });
      expect(await agenda).toBeInstanceOf(NoEncontrado);
      expect(await sql(a, 'SELECT 1 FROM citas WHERE cliente_id = $1', [id])).toHaveLength(0);
    });

    it('anonimizar espera a la cita en curso, la ve y se rechaza', async () => {
      const { id, telefono } = await cliente(a, 'Carrera dos');
      let anonimizar: Promise<{ status: number }> | undefined;
      await conNegocio(a.negocioId, async (tx: Transaccion) => {
        expect(await bloquearClienteVigente(tx, id)).toBe(true);
        await tx.consultar(
          `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.negocioId, a.sedeId, barbero, id, hora('10:00', '2032-03-01'), hora('10:30', '2032-03-01')],
        );
        anonimizar = api(duenoA, 'POST', `/clientes/${id}/anonimizar`);
        await espera(150);
      });
      expect((await anonimizar)!.status).toBe(409);
      const [fila] = await sql<{ telefono: string }>(a, 'SELECT telefono FROM clientes WHERE id = $1', [id]);
      expect(fila!.telefono).toBe(telefono);
    });
  });

  describe('negocio suspendido', () => {
    it('consulta y anonimiza, pero no edita', async () => {
      const n = await crearNegocio('Suspendido');
      const dueno = await sesion(n, 'dueno');
      const barbero = await crearProfesional(n);
      const empleado = await sesion(n, 'empleado', barbero);
      const c = await cliente(n, 'Conservado');
      await citaDe(n, barbero, c.id, 'completada');
      await conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'suspendido' WHERE id = $1", [n.negocioId]));

      expect(ids((await api(dueno, 'GET', '/clientes')).json.clientes)).toEqual([c.id]);
      expect((await api(dueno, 'GET', `/clientes/${c.id}`)).status).toBe(200);
      expect(ids((await api(empleado, 'GET', '/clientes')).json.clientes)).toEqual([c.id]);

      expect((await api(dueno, 'PATCH', `/clientes/${c.id}`, { nombre: 'Otro' })).status).toBe(403);
      const [fila] = await sql<{ nombre: string }>(n, 'SELECT nombre FROM clientes WHERE id = $1', [c.id]);
      expect(fila!.nombre).toBe('Conservado');

      // Excepción a la suspensión: el derecho de la persona no depende de los pagos del negocio.
      expect((await api(empleado, 'POST', `/clientes/${c.id}/anonimizar`)).status).toBe(403);
      expect((await api(dueno, 'POST', `/clientes/${c.id}/anonimizar`)).status).toBe(204);
      const [anonimo] = await sql<{ telefono: string | null }>(n, 'SELECT telefono FROM clientes WHERE id = $1', [c.id]);
      expect(anonimo!.telefono).toBeNull();
    });

    it('con citas activas sigue rechazando, y el suspendido no puede cancelarlas', async () => {
      const n = await crearNegocio('Suspendido con citas');
      const dueno = await sesion(n, 'dueno');
      const barbero = await crearProfesional(n);
      const c = await cliente(n, 'Con cita activa');
      const citaId = await citaDe(n, barbero, c.id);
      await conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'suspendido' WHERE id = $1", [n.negocioId]));

      expect((await api(dueno, 'POST', `/clientes/${c.id}/anonimizar`)).status).toBe(409);
      expect((await api(dueno, 'POST', `/citas/${citaId}/cancelar`, {})).status).toBe(403);
    });
  });
});
