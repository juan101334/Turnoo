import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import {
  crearCita as insertarCita,
  crearCliente,
  crearHorario,
  crearNegocio,
  crearProfesional,
  crearServicio,
  limpiar,
  type NegocioDePrueba,
} from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';

// Las rutas usan la hora real, así que las fechas se calculan a partir de hoy:
// el próximo lunes que quede entre 3 y 9 días adelante (hora de Bogotá).
let LUNES = DateTime.now().setZone('America/Bogota').plus({ days: 3 }).startOf('day');
while (LUNES.weekday !== 1) LUNES = LUNES.plus({ days: 1 });
const en = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return LUNES.plus({ hours: h!, minutes: m! });
};
const iso = (hhmm: string) => en(hhmm).toISO()!;
const fecha = LUNES.toFormat('yyyy-MM-dd');
const rango = `desde=${encodeURIComponent(iso('00:00'))}&hasta=${encodeURIComponent(iso('23:59'))}`;

describe('rutas de citas', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  const superadmins: string[] = [];
  const tokens = {} as Record<'duenoA' | 'duenoB' | 'superadmin' | 'sinBarbero', string>;

  async function usuario(n: NegocioDePrueba | null, rol: string, profesionalId?: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const hash = await argon2.hash(CLAVE);
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
                 VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, hash];
    const id = n
      ? (await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))).rows[0]!.id
      : (await conSistema((tx) => tx.consultar<{ id: string }>(sql, params))).rows[0]!.id;
    if (!n) superadmins.push(id);
    if (n && profesionalId) {
      await conNegocio(n.negocioId, (tx) => tx.consultar('UPDATE profesionales SET usuario_id = $1 WHERE id = $2', [id, profesionalId]));
    }
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE }),
    });
    return (await r.json()).token as string;
  }

  /** Un barbero nuevo con su servicio y horario de lunes (08-12 y 14-18): cada prueba usa el suyo. */
  async function barbero(n: NegocioDePrueba = a) {
    const profesionalId = await crearProfesional(n, 'Barbero');
    const servicioId = await crearServicio(n, profesionalId, 'Corte', 30, 20000);
    await crearHorario(n, profesionalId, 1, '08:00', '12:00');
    await crearHorario(n, profesionalId, 1, '14:00', '18:00');
    return { profesionalId, servicioId };
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

  // Cada cliente nuevo tiene su propio teléfono: así el máximo de 2 citas activas no estorba.
  let consecutivo = 0;
  const agendar = (token: string, e: { profesionalId: string; servicioId: string }, hhmm: string, telefono = `3009${String(++consecutivo).padStart(6, '0')}`) =>
    api(token, 'POST', '/citas', {
      profesionalId: e.profesionalId, servicioIds: [e.servicioId], inicio: iso(hhmm),
      cliente: { telefono, nombre: 'Carlos' },
    });

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    tokens.duenoA = await usuario(a, 'dueno');
    tokens.duenoB = await usuario(b, 'dueno');
    tokens.superadmin = await usuario(null, 'superadmin');
    tokens.sinBarbero = await usuario(a, 'empleado');
  });
  afterAll(async () => {
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
    await new Promise((r) => servidor.close(r));
  });

  it('agenda para un cliente nuevo por teléfono y la cita aparece en la agenda', async () => {
    const e = await barbero();
    const r = await agendar(tokens.duenoA, e, '09:00', '300 100 0001');
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      estado: 'pendiente', clienteTelefono: '573001000001', clienteNombre: 'Carlos',
      precioTotalCop: 20000, servicios: [{ servicioId: e.servicioId, nombre: 'Corte', duracionMinutos: 30, precioCop: 20000 }],
    });
    expect((await api(tokens.duenoA, 'GET', `/citas/${r.json.id}`)).json).toEqual(r.json);
    const lista = await api(tokens.duenoA, 'GET', `/citas?${rango}&profesionalId=${e.profesionalId}`);
    expect(lista.json.citas.map((c: { id: string }) => c.id)).toEqual([r.json.id]);
  });

  it('el mismo teléfono en otro formato reutiliza al cliente y no pisa su nombre', async () => {
    const e = await barbero();
    const uno = await agendar(tokens.duenoA, e, '09:00', '3001000002');
    const dos = await api(tokens.duenoA, 'POST', '/citas', {
      profesionalId: e.profesionalId, servicioIds: [e.servicioId], inicio: iso('10:00'),
      cliente: { telefono: '+57 (300) 100-0002', nombre: 'Otro Nombre' },
    });
    expect(dos.json.clienteId).toBe(uno.json.clienteId);
    expect(dos.json.clienteNombre).toBe('Carlos');
  });

  it('la disponibilidad ofrece el hueco y deja de ofrecerlo cuando se agenda', async () => {
    const e = await barbero();
    const consultar = async () => (await api(tokens.duenoA, 'GET',
      `/citas/disponibilidad?profesionalId=${e.profesionalId}&servicioIds=${e.servicioId}&desde=${fecha}&hasta=${fecha}`)).json;
    const horas = (d: { dias: { huecos: { hora: string }[] }[] }) => d.dias[0]!.huecos.map((h) => h.hora);
    expect(horas(await consultar())).toContain('09:00');
    await agendar(tokens.duenoA, e, '09:00');
    expect(horas(await consultar())).not.toContain('09:00');
  });

  it('no deja agendar el mismo hueco dos veces', async () => {
    const e = await barbero();
    expect((await agendar(tokens.duenoA, e, '09:00', '300 100 0003')).status).toBe(201);
    const r = await agendar(tokens.duenoA, e, '09:00', '300 100 0004');
    expect([r.status, r.json.error.codigo]).toEqual([409, 'HORARIO_NO_DISPONIBLE']);
  });

  it('reprograma y cancela; no se cancela dos veces', async () => {
    const e = await barbero();
    const { json: cita } = await agendar(tokens.duenoA, e, '09:00');
    const movida = await api(tokens.duenoA, 'POST', `/citas/${cita.id}/reprogramar`, { inicio: iso('10:00') });
    expect(movida.status).toBe(200);
    expect(new Date(movida.json.inicio)).toEqual(en('10:00').toJSDate());

    const cancelada = await api(tokens.duenoA, 'POST', `/citas/${cita.id}/cancelar`);
    expect([cancelada.status, cancelada.json.estado]).toEqual([200, 'cancelada']);
    const otra = await api(tokens.duenoA, 'POST', `/citas/${cita.id}/cancelar`);
    expect([otra.status, otra.json.error.codigo]).toEqual([409, 'TRANSICION_NO_PERMITIDA']);
  });

  it('aprueba o rechaza una cita por aprobar', async () => {
    const e = await barbero();
    const cliente = await crearCliente(a);
    const nueva = (hhmm: string) => insertarCita(a, {
      profesionalId: e.profesionalId, clienteId: cliente, inicio: en(hhmm).toJSDate(), fin: en(hhmm).plus({ minutes: 30 }).toJSDate(), estado: 'por_aprobar',
    });
    const [p1, p2] = [await nueva('09:00'), await nueva('10:00')];
    expect((await api(tokens.duenoA, 'POST', `/citas/${p1}/aprobar`)).json.estado).toBe('pendiente');
    expect((await api(tokens.duenoA, 'POST', `/citas/${p2}/rechazar`)).json.estado).toBe('cancelada');
    expect((await api(tokens.duenoA, 'POST', `/citas/${p1}/aprobar`)).status).toBe(409);
  });

  it('marca asistencia solo cuando la cita ya empezó', async () => {
    const e = await barbero();
    const cliente = await crearCliente(a);
    const ayer = DateTime.now().minus({ days: 2 });
    const pasada = await insertarCita(a, { profesionalId: e.profesionalId, clienteId: cliente, inicio: ayer.toJSDate(), fin: ayer.plus({ minutes: 30 }).toJSDate() });
    expect((await api(tokens.duenoA, 'POST', `/citas/${pasada}/marcar`, { estado: 'no_asistio' })).json.estado).toBe('no_asistio');

    const { json: futura } = await agendar(tokens.duenoA, e, '09:00');
    expect((await api(tokens.duenoA, 'POST', `/citas/${futura.id}/marcar`, { estado: 'completada' })).status).toBe(409);
    expect((await api(tokens.duenoA, 'POST', `/citas/${futura.id}/marcar`, { estado: 'raro' })).status).toBe(400);
  });

  describe('historial del cliente (incluir=historial)', () => {
    /** Una cita pasada de `dias` atrás, en el estado indicado. */
    const pasada = (profesionalId: string, clienteId: string, dias: number, estado: 'completada' | 'no_asistio' | 'cancelada') => {
      const inicio = DateTime.now().minus({ days: dias });
      return insertarCita(a, { profesionalId, clienteId, inicio: inicio.toJSDate(), fin: inicio.plus({ minutes: 30 }).toJSDate(), estado });
    };
    const porAprobar = (profesionalId: string, clienteId: string, hhmm: string) =>
      insertarCita(a, { profesionalId, clienteId, inicio: en(hhmm).toJSDate(), fin: en(hhmm).plus({ minutes: 30 }).toJSDate(), estado: 'por_aprobar' });
    const historialDe = (citas: { id: string; clienteCitasCompletadas?: number; clienteInasistencias?: number }[], id: string) => {
      const c = citas.find((x) => x.id === id)!;
      return [c.clienteCitasCompletadas, c.clienteInasistencias];
    };

    it('cuenta completadas e inasistencias del cliente en todo el negocio, no solo en el rango', async () => {
      const uno = await barbero();
      const otro = await barbero();
      const recurrente = await crearCliente(a);
      const nuevo = await crearCliente(a);
      await pasada(uno.profesionalId, recurrente, 10, 'completada');
      await pasada(otro.profesionalId, recurrente, 100, 'completada');
      await pasada(uno.profesionalId, recurrente, 5, 'no_asistio');
      await pasada(uno.profesionalId, recurrente, 3, 'cancelada'); // no cuenta
      const suya = await porAprobar(uno.profesionalId, recurrente, '09:00');
      const delNuevo = await porAprobar(uno.profesionalId, nuevo, '10:00');

      const { json } = await api(tokens.duenoA, 'GET', `/citas?${rango}&profesionalId=${uno.profesionalId}&incluir=historial`);
      expect(historialDe(json.citas, suya)).toEqual([2, 1]); // incluye la del otro barbero
      expect(historialDe(json.citas, delNuevo)).toEqual([0, 0]);

      // Sin pedirlo no se calcula: la agenda no paga la consulta.
      const sin = await api(tokens.duenoA, 'GET', `/citas?${rango}&profesionalId=${uno.profesionalId}`);
      expect(sin.json.citas.find((c: { id: string }) => c.id === suya)).not.toHaveProperty('clienteCitasCompletadas');
    });

    it('el empleado solo cuenta lo que el cliente hizo con su barbero', async () => {
      const suyo = await barbero();
      const ajeno = await barbero();
      const token = await usuario(a, 'empleado', suyo.profesionalId);
      const cliente = await crearCliente(a);
      await pasada(suyo.profesionalId, cliente, 10, 'completada');
      await pasada(ajeno.profesionalId, cliente, 20, 'completada');
      await pasada(ajeno.profesionalId, cliente, 30, 'no_asistio');
      const cita = await porAprobar(suyo.profesionalId, cliente, '11:00');

      const { json } = await api(token, 'GET', `/citas?${rango}&incluir=historial`);
      expect(historialDe(json.citas, cita)).toEqual([1, 0]);
    });

    it('un valor desconocido en incluir es 400', async () => {
      expect((await api(tokens.duenoA, 'GET', `/citas?${rango}&incluir=raro`)).status).toBe(400);
    });
  });

  describe('empleado', () => {
    it('solo ve y maneja las citas de su barbero', async () => {
      const suyo = await barbero();
      const ajeno = await barbero();
      const token = await usuario(a, 'empleado', suyo.profesionalId);
      const citaSuya = (await agendar(tokens.duenoA, suyo, '09:00', '300 200 0001')).json;
      const citaAjena = (await agendar(tokens.duenoA, ajeno, '09:00', '300 200 0002')).json;

      const lista = await api(token, 'GET', `/citas?${rango}`);
      expect(lista.json.citas.map((c: { id: string }) => c.id)).toEqual([citaSuya.id]);
      expect((await api(token, 'GET', `/citas/${citaAjena.id}`)).status).toBe(404);
      expect((await api(token, 'POST', `/citas/${citaAjena.id}/cancelar`)).status).toBe(404);
      expect((await api(token, 'GET', `/citas?${rango}&profesionalId=${ajeno.profesionalId}`)).status).toBe(403);
      expect((await agendar(token, ajeno, '10:00')).status).toBe(403);
      expect((await api(token, 'GET', `/citas/disponibilidad?profesionalId=${ajeno.profesionalId}&servicioIds=${ajeno.servicioId}&desde=${fecha}&hasta=${fecha}`)).status).toBe(403);

      // Sin indicar barbero agenda en el suyo, y puede cancelar lo suyo.
      const propia = await api(token, 'POST', '/citas', {
        servicioIds: [suyo.servicioId], inicio: iso('10:00'), cliente: { telefono: '300 200 0003' },
      });
      expect([propia.status, propia.json.profesionalId]).toEqual([201, suyo.profesionalId]);
      expect((await api(token, 'POST', `/citas/${citaSuya.id}/cancelar`)).json.estado).toBe('cancelada');
    });

    it('un empleado sin barbero asociado no accede', async () => {
      expect((await api(tokens.sinBarbero, 'GET', `/citas?${rango}`)).status).toBe(403);
    });
  });

  describe('acceso', () => {
    it('sin sesión 401; el superadmin no entra a citas de un negocio (403)', async () => {
      expect((await api(null, 'GET', `/citas?${rango}`)).status).toBe(401);
      expect((await api(tokens.superadmin, 'GET', `/citas?${rango}`)).status).toBe(403);
    });

    it('otro negocio no ve ni toca las citas', async () => {
      const e = await barbero();
      const { json: cita } = await agendar(tokens.duenoA, e, '09:00');
      expect((await api(tokens.duenoB, 'GET', `/citas/${cita.id}`)).status).toBe(404);
      expect((await api(tokens.duenoB, 'POST', `/citas/${cita.id}/cancelar`)).status).toBe(404);
      expect((await api(tokens.duenoB, 'GET', `/citas?${rango}`)).json.citas).toEqual([]);
      expect((await agendar(tokens.duenoB, e, '10:00')).status).toBe(404); // barbero de A, desde B
    });
  });

  it('responde 400 a datos mal formados', async () => {
    const e = await barbero();
    const cuerpo = { profesionalId: e.profesionalId, servicioIds: [e.servicioId], inicio: iso('09:00'), cliente: { telefono: '300 300 0001' } };
    const casos: [string, string, unknown?][] = [
      ['GET', `/citas?desde=${encodeURIComponent(iso('00:00'))}`],
      ['GET', `/citas?desde=${encodeURIComponent(iso('00:00'))}&hasta=${encodeURIComponent(en('00:00').plus({ days: 63 }).toISO()!)}`],
      ['GET', `/citas?${rango}&estado=raro`],
      ['GET', '/citas/no-es-uuid'],
      ['POST', '/citas', { ...cuerpo, cliente: { telefono: 'abc' } }],
      ['POST', '/citas', { ...cuerpo, inicio: '2030-06-10T09:00:00' }],
      ['POST', '/citas', { ...cuerpo, servicioIds: [] }],
      ['POST', '/citas', { ...cuerpo, profesionalId: undefined }],
    ];
    for (const [metodo, ruta, body] of casos) {
      const r = await api(tokens.duenoA, metodo, ruta, body);
      expect([ruta, r.status]).toEqual([ruta, 400]);
    }
  });
});
