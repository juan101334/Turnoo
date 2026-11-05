import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import { bloquearProfesionalActivo } from '../src/modulos/citas/citas.repositorio.js';
import {
  crearBloqueo,
  crearCita,
  crearCliente,
  crearHorario,
  crearNegocio,
  crearProfesional,
  crearServicio,
  limpiar,
  type NegocioDePrueba,
} from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';

// Las rutas usan la hora real: se trabaja con el próximo lunes entre 3 y 9 días adelante (Bogotá).
let LUNES = DateTime.now().setZone('America/Bogota').plus({ days: 3 }).startOf('day');
while (LUNES.weekday !== 1) LUNES = LUNES.plus({ days: 1 });
const en = (hhmm: string, dias = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return LUNES.plus({ days: dias, hours: h!, minutes: m! });
};
const iso = (hhmm: string, dias = 0) => en(hhmm, dias).toISO()!;
const instante = (hhmm: string, dias = 0) => en(hhmm, dias).toJSDate();
const fecha = LUNES.toFormat('yyyy-MM-dd');

describe('servicios, horarios y bloqueos', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let duenoA: string;
  let duenoB: string;
  let admin: string;
  const superadmins: string[] = [];

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

  const corte = { nombre: 'Corte', duracionMinutos: 30, precioCop: 20000 };
  const rangoDelLunes = `desde=${encodeURIComponent(iso('00:00'))}&hasta=${encodeURIComponent(iso('00:00', 1))}`;
  const ids = (lista: { id: string }[]) => lista.map((x) => x.id);

  const suspender = (n: NegocioDePrueba) =>
    conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'suspendido' WHERE id = $1", [n.negocioId]));

  async function citaEn(n: NegocioDePrueba, profesionalId: string, hhmm: string, estado?: 'cancelada' | 'por_aprobar') {
    return crearCita(n, {
      profesionalId,
      clienteId: await crearCliente(n, 'Carlos'),
      inicio: instante(hhmm),
      fin: en(hhmm).plus({ minutes: 30 }).toJSDate(),
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
    duenoB = await sesion(b, 'dueno');
    admin = await sesion(null, 'superadmin');
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
  });

  describe('servicios', () => {
    it('el dueño crea, lista y edita solo lo enviado', async () => {
      const id = await crearProfesional(a);
      const ruta = `/profesionales/${id}/servicios`;
      const creado = await api(duenoA, 'POST', ruta, { ...corte, nombre: '  Corte  ' });
      expect(creado.status).toBe(201);
      expect(creado.json).toMatchObject({ ...corte, profesionalId: id, activo: true });

      const editado = await api(duenoA, 'PATCH', `${ruta}/${creado.json.id}`, { precioCop: 25000 });
      expect(editado.json).toMatchObject({ nombre: 'Corte', duracionMinutos: 30, precioCop: 25000 });

      const lista = await api(duenoA, 'GET', ruta);
      expect(ids(lista.json.servicios)).toEqual([creado.json.id]);
    });

    it.each([
      [{}, 'vacío'],
      [{ ...corte, nombre: '  ' }, 'sin nombre'],
      [{ ...corte, duracionMinutos: 0 }, 'duración cero'],
      [{ ...corte, duracionMinutos: 481 }, 'duración excesiva'],
      [{ ...corte, duracionMinutos: 1.5 }, 'duración no entera'],
      [{ ...corte, precioCop: -1 }, 'precio negativo'],
      [{ ...corte, precioCop: 3_000_000_000 }, 'desborda integer'],
      [{ ...corte, activo: false }, 'campo extra'],
      [{ ...corte, profesionalId: randomUUID() }, 'otro barbero'],
    ])('rechaza un servicio inválido: %j (%s)', async (cuerpo, _motivo) => {
      const id = await crearProfesional(a);
      expect((await api(duenoA, 'POST', `/profesionales/${id}/servicios`, cuerpo)).status).toBe(400);
    });

    it('no acepta un cambio vacío ni un id mal escrito', async () => {
      const id = await crearProfesional(a);
      const servicio = await crearServicio(a, id);
      const ruta = `/profesionales/${id}/servicios`;
      expect((await api(duenoA, 'PATCH', `${ruta}/${servicio}`, {})).status).toBe(400);
      expect((await api(duenoA, 'PATCH', `${ruta}/mal`, { precioCop: 1 })).status).toBe(400);
      expect((await api(duenoA, 'POST', `${ruta}/mal/desactivar`)).status).toBe(400);
    });

    it('un nombre repetido entre los activos responde 409, y al desactivar queda libre', async () => {
      const id = await crearProfesional(a);
      const ruta = `/profesionales/${id}/servicios`;
      const primero = (await api(duenoA, 'POST', ruta, corte)).json.id;
      const repetido = await api(duenoA, 'POST', ruta, { ...corte, nombre: 'CORTE' });
      expect(repetido.status).toBe(409);
      expect(repetido.json.error.codigo).toBe('DUPLICADO');

      expect((await api(duenoA, 'POST', `${ruta}/${primero}/desactivar`)).json.activo).toBe(false);
      expect((await api(duenoA, 'POST', ruta, corte)).status).toBe(201);
      expect((await api(duenoA, 'POST', `${ruta}/${primero}/activar`)).status).toBe(409);
    });

    it('otro barbero u otro negocio responden 404 y no cambian nada', async () => {
      const id = await crearProfesional(a);
      const otro = await crearProfesional(a);
      const servicio = await crearServicio(a, otro, 'Barba');
      const rutaCruzada = `/profesionales/${id}/servicios/${servicio}`;
      expect((await api(duenoA, 'PATCH', rutaCruzada, { precioCop: 1 })).status).toBe(404);
      expect((await api(duenoA, 'POST', `${rutaCruzada}/desactivar`)).status).toBe(404);

      expect((await api(duenoB, 'GET', `/profesionales/${otro}/servicios`)).status).toBe(404);
      expect((await api(duenoB, 'POST', `/profesionales/${otro}/servicios`, corte)).status).toBe(404);
      expect((await api(duenoB, 'PATCH', `/profesionales/${otro}/servicios/${servicio}`, { precioCop: 1 })).status).toBe(404);

      const { json } = await api(duenoA, 'GET', `/profesionales/${otro}/servicios`);
      expect(json.servicios).toMatchObject([{ precioCop: 20000, activo: true }]);
    });

    it('editar el servicio no cambia una cita ya agendada, y desactivado no se puede agendar', async () => {
      const id = await crearProfesional(a);
      await crearHorario(a, id, 1, '08:00', '12:00');
      const ruta = `/profesionales/${id}/servicios`;
      const servicio = (await api(duenoA, 'POST', ruta, corte)).json.id;
      const agendar = (hhmm: string, telefono: string) =>
        api(duenoA, 'POST', '/citas', {
          profesionalId: id, servicioIds: [servicio], inicio: iso(hhmm), cliente: { telefono, nombre: 'Ana' },
        });
      const cita = await agendar('09:00', '3004000001');
      expect(cita.status).toBe(201);

      await api(duenoA, 'PATCH', `${ruta}/${servicio}`, { precioCop: 99000, nombre: 'Otro' });
      const vista = await api(duenoA, 'GET', `/citas/${cita.json.id}`);
      expect(vista.json.precioTotalCop).toBe(20000);

      await api(duenoA, 'POST', `${ruta}/${servicio}/desactivar`);
      expect((await agendar('10:00', '3004000002')).status).toBe(400);
    });
  });

  describe('horarios', () => {
    it('crea varios rangos por día, los lista en orden y admite terminar a las 24:00', async () => {
      const id = await crearProfesional(a);
      const ruta = `/profesionales/${id}/horarios`;
      for (const h of [
        { diaSemana: 2, horaInicio: '14:00', horaFin: '18:00' },
        { diaSemana: 1, horaInicio: '20:00', horaFin: '24:00' },
        { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' },
      ]) {
        const r = await api(duenoA, 'POST', ruta, h);
        expect(r.status).toBe(201);
        expect(r.json).toMatchObject(h);
      }
      const { json } = await api(duenoA, 'GET', ruta);
      expect(json.horarios.map((h: { diaSemana: number; horaInicio: string }) => [h.diaSemana, h.horaInicio])).toEqual([
        [1, '20:00'], [2, '08:00'], [2, '14:00'],
      ]);
    });

    it.each([
      [{ diaSemana: 0, horaInicio: '08:00', horaFin: '12:00' }, 'día cero'],
      [{ diaSemana: 8, horaInicio: '08:00', horaFin: '12:00' }, 'día ocho'],
      [{ diaSemana: 1, horaInicio: '12:00', horaFin: '08:00' }, 'al revés'],
      [{ diaSemana: 1, horaInicio: '08:00', horaFin: '08:00' }, 'sin duración'],
      [{ diaSemana: 1, horaInicio: '25:00', horaFin: '26:00' }, 'hora inexistente'],
      [{ diaSemana: 1, horaInicio: '24:00', horaFin: '24:00' }, 'inicio a las 24'],
      [{ diaSemana: 1, horaInicio: '8:00', horaFin: '12:00' }, 'sin cero a la izquierda'],
      [{ diaSemana: 1, horaInicio: '08:00' }, 'sin fin'],
    ])('rechaza un horario inválido: %j (%s)', async (cuerpo, _motivo) => {
      const id = await crearProfesional(a);
      expect((await api(duenoA, 'POST', `/profesionales/${id}/horarios`, cuerpo)).status).toBe(400);
    });

    it('rechaza rangos que se cruzan, pero no los contiguos ni los de otro día', async () => {
      const id = await crearProfesional(a);
      const ruta = `/profesionales/${id}/horarios`;
      await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' });
      expect((await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '11:00', horaFin: '13:00' })).status).toBe(400);
      expect((await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '12:00', horaFin: '13:00' })).status).toBe(201);
      expect((await api(duenoA, 'POST', ruta, { diaSemana: 2, horaInicio: '11:00', horaFin: '13:00' })).status).toBe(201);
    });

    it('quitar un rango lista solo las citas que quedan fuera, sin tocarlas', async () => {
      const id = await crearProfesional(a);
      const ruta = `/profesionales/${id}/horarios`;
      const manana = (await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' })).json.id;
      await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' });
      const afectada = await citaEn(a, id, '09:00');
      const porAprobar = await citaEn(a, id, '10:00', 'por_aprobar');
      await citaEn(a, id, '11:00', 'cancelada');
      await citaEn(a, id, '15:00');
      await crearCita(a, {
        profesionalId: id, clienteId: await crearCliente(a), inicio: instante('09:00', 1), fin: instante('09:30', 1),
      });

      const r = await api(duenoA, 'DELETE', `${ruta}/${manana}`);
      expect(r.status).toBe(200);
      expect(ids(r.json.citasAfectadas)).toEqual([afectada, porAprobar]);
      expect(r.json.citasAfectadas[0]).toMatchObject({ clienteNombre: 'Carlos', estado: 'pendiente' });

      const cita = await api(duenoA, 'GET', `/citas/${afectada}`);
      expect(cita.json.estado).toBe('pendiente');
      expect((await api(duenoA, 'GET', ruta)).json.horarios).toHaveLength(1);
    });

    it('usa la zona del negocio para decidir qué citas quedan fuera', async () => {
      const n = await crearNegocio('En Tokio');
      await conSistema((tx) => tx.consultar("UPDATE negocios SET zona_horaria = 'Asia/Tokyo' WHERE id = $1", [n.negocioId]));
      const token = await sesion(n, 'dueno');
      const id = await crearProfesional(n);
      const ruta = `/profesionales/${id}/horarios`;
      const horario = (await api(token, 'POST', ruta, { diaSemana: 1, horaInicio: '09:00', horaFin: '10:00' })).json.id;

      const lunesTokio = LUNES.setZone('Asia/Tokyo', { keepLocalTime: true }).set({ hour: 9 });
      const cita = await crearCita(n, {
        profesionalId: id,
        clienteId: await crearCliente(n),
        inicio: lunesTokio.toJSDate(),
        fin: lunesTokio.plus({ minutes: 30 }).toJSDate(),
      });
      const r = await api(token, 'DELETE', `${ruta}/${horario}`);
      expect(ids(r.json.citasAfectadas)).toEqual([cita]);
    });

    it('un rango de otro barbero o negocio responde 404 y sigue existiendo', async () => {
      const id = await crearProfesional(a);
      const otro = await crearProfesional(a);
      const ruta = `/profesionales/${otro}/horarios`;
      const horario = (await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' })).json.id;

      expect((await api(duenoA, 'DELETE', `/profesionales/${id}/horarios/${horario}`)).status).toBe(404);
      expect((await api(duenoB, 'DELETE', `${ruta}/${horario}`)).status).toBe(404);
      expect((await api(duenoA, 'DELETE', `${ruta}/mal`)).status).toBe(400);
      expect((await api(duenoA, 'GET', ruta)).json.horarios).toHaveLength(1);
    });

    it('quitar un rango espera a la cita que se está creando y la lista', async () => {
      const id = await crearProfesional(a);
      const ruta = `/profesionales/${id}/horarios`;
      const horario = (await api(duenoA, 'POST', ruta, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' })).json.id;
      const cliente = await crearCliente(a);
      let avisar!: () => void;
      let soltar!: () => void;
      const bloqueado = new Promise<void>((r) => { avisar = r; });
      const liberado = new Promise<void>((r) => { soltar = r; });

      const enCurso = conNegocio(a.negocioId, async (tx) => {
        await bloquearProfesionalActivo(tx, id);
        avisar();
        await liberado;
        await tx.consultar(
          `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.negocioId, a.sedeId, id, cliente, instante('09:00'), instante('09:30')],
        );
      });
      await bloqueado;
      const peticion = api(duenoA, 'DELETE', `${ruta}/${horario}`);
      await new Promise((r) => setTimeout(r, 150));
      soltar();
      await enCurso;

      expect((await peticion).json.citasAfectadas).toHaveLength(1);
    });
  });

  describe('bloqueos', () => {
    const bloqueoDe = (profesionalId: string | null, inicio = iso('09:00'), fin = iso('10:00')) => ({
      profesionalId, inicio, fin,
    });

    it('un bloqueo del barbero lista sus citas cruzadas, sin tocarlas', async () => {
      const id = await crearProfesional(a);
      const otro = await crearProfesional(a);
      const cruzada = await citaEn(a, id, '09:30');
      const porAprobar = await citaEn(a, id, '09:00', 'por_aprobar');
      await citaEn(a, id, '08:30'); // termina justo cuando empieza el bloqueo
      await citaEn(a, id, '10:00'); // empieza justo cuando termina el bloqueo
      await citaEn(a, otro, '09:30');
      await citaEn(a, id, '09:15', 'cancelada');

      const r = await api(duenoA, 'POST', '/bloqueos', { ...bloqueoDe(id), motivo: ' Cita médica ' });
      expect(r.status).toBe(201);
      expect(r.json.bloqueo).toMatchObject({ profesionalId: id, motivo: 'Cita médica' });
      expect(ids(r.json.citasAfectadas).sort()).toEqual([cruzada, porAprobar].sort());
      expect((await api(duenoA, 'GET', `/citas/${cruzada}`)).json.estado).toBe('pendiente');
    });

    it('un cierre del negocio lista las citas de todos sus barberos, no las de otro negocio', async () => {
      const n = await crearNegocio('Con cierre');
      const token = await sesion(n, 'dueno');
      const uno = await citaEn(n, await crearProfesional(n), '09:00');
      const dos = await citaEn(n, await crearProfesional(n), '09:30');
      await citaEn(b, await crearProfesional(b), '09:00');

      const r = await api(token, 'POST', '/bloqueos', bloqueoDe(null));
      expect(r.status).toBe(201);
      expect(r.json.bloqueo.profesionalId).toBeNull();
      expect(ids(r.json.citasAfectadas)).toEqual([uno, dos]);
    });

    it('no lista citas que ya terminaron', async () => {
      const id = await crearProfesional(a);
      const ayer = DateTime.now().minus({ days: 1 });
      await crearCita(a, {
        profesionalId: id, clienteId: await crearCliente(a),
        inicio: ayer.toJSDate(), fin: ayer.plus({ minutes: 30 }).toJSDate(),
      });
      const r = await api(duenoA, 'POST', '/bloqueos', bloqueoDe(id, ayer.minus({ hours: 1 }).toISO(), ayer.plus({ hours: 1 }).toISO()));
      expect(r.status).toBe(201);
      expect(r.json.citasAfectadas).toEqual([]);
    });

    it('el dueño debe indicar el barbero o null: un olvido no cierra el negocio', async () => {
      const r = await api(duenoA, 'POST', '/bloqueos', { inicio: iso('09:00'), fin: iso('10:00') });
      expect(r.status).toBe(400);
    });

    it.each([
      [{ profesionalId: null, inicio: 'ayer', fin: '2030-01-01T10:00:00Z' }, 'inicio inválido'],
      [{ profesionalId: null, inicio: '2030-01-01T10:00:00', fin: '2030-01-01T11:00:00Z' }, 'sin zona'],
      [{ profesionalId: null, inicio: '2030-01-01T10:00:00Z', fin: '2030-01-01T10:00:00Z' }, 'sin duración'],
      [{ profesionalId: null, inicio: '2030-01-01T11:00:00Z', fin: '2030-01-01T10:00:00Z' }, 'al revés'],
      [{ profesionalId: 'mal', inicio: '2030-01-01T10:00:00Z', fin: '2030-01-01T11:00:00Z' }, 'barbero mal escrito'],
      [{ profesionalId: null, inicio: '2030-01-01T10:00:00Z', fin: '2030-01-01T11:00:00Z', motivo: 'x'.repeat(201) }, 'motivo largo'],
      [{ profesionalId: null, inicio: '2030-01-01T10:00:00Z', fin: '2030-01-01T11:00:00Z', negocioId: randomUUID() }, 'campo extra'],
    ])('rechaza un bloqueo inválido: %j (%s)', async (cuerpo, _motivo) => {
      expect((await api(duenoA, 'POST', '/bloqueos', cuerpo)).status).toBe(400);
    });

    it('un barbero de otro negocio responde 404', async () => {
      const ajeno = await crearProfesional(b);
      expect((await api(duenoA, 'POST', '/bloqueos', bloqueoDe(ajeno))).status).toBe(404);
    });

    it('lista por rango, con los del barbero y los del negocio, sin mezclar negocios', async () => {
      const n = await crearNegocio('Con lista');
      const token = await sesion(n, 'dueno');
      const uno = await crearProfesional(n);
      const dos = await crearProfesional(n);
      const delUno = (await api(token, 'POST', '/bloqueos', bloqueoDe(uno))).json.bloqueo.id;
      const delDos = (await api(token, 'POST', '/bloqueos', bloqueoDe(dos))).json.bloqueo.id;
      const cierre = (await api(token, 'POST', '/bloqueos', bloqueoDe(null, iso('11:00'), iso('12:00')))).json.bloqueo.id;
      await api(token, 'POST', '/bloqueos', bloqueoDe(uno, iso('09:00', 2), iso('10:00', 2)));
      await crearBloqueo(b, null, instante('09:00'), instante('10:00'));

      const todos = await api(token, 'GET', `/bloqueos?${rangoDelLunes}`);
      expect(ids(todos.json.bloqueos).sort()).toEqual([delUno, delDos, cierre].sort());
      const deUno = await api(token, 'GET', `/bloqueos?${rangoDelLunes}&profesionalId=${uno}`);
      expect(ids(deUno.json.bloqueos).sort()).toEqual([delUno, cierre].sort());
    });

    it('valida el rango de la lista', async () => {
      const q = (desde: string, hasta: string) =>
        `/bloqueos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      expect((await api(duenoA, 'GET', '/bloqueos')).status).toBe(400);
      expect((await api(duenoA, 'GET', q(iso('10:00'), iso('09:00')))).status).toBe(400);
      expect((await api(duenoA, 'GET', q(iso('10:00'), iso('10:00', 63)))).status).toBe(400);
      expect((await api(duenoA, 'GET', `/bloqueos?${rangoDelLunes}&profesionalId=mal`)).status).toBe(400);
    });

    it('el dueño quita un bloqueo; de otro negocio responde 404', async () => {
      const id = await crearProfesional(a);
      const bloqueo = (await api(duenoA, 'POST', '/bloqueos', bloqueoDe(id))).json.bloqueo.id;
      expect((await api(duenoB, 'DELETE', `/bloqueos/${bloqueo}`)).status).toBe(404);
      expect((await api(duenoA, 'DELETE', '/bloqueos/mal')).status).toBe(400);
      expect((await api(duenoA, 'DELETE', `/bloqueos/${bloqueo}`)).status).toBe(204);
      expect((await api(duenoA, 'DELETE', `/bloqueos/${bloqueo}`)).status).toBe(404);
    });

    it.each([['del barbero', false], ['de todo el negocio', true]])(
      'un bloqueo %s espera a la cita que se está creando y la lista',
      async (_nombre, todoElNegocio) => {
        const n = await crearNegocio('En carrera');
        const token = await sesion(n, 'dueno');
        const id = await crearProfesional(n);
        const cliente = await crearCliente(n);
        let avisar!: () => void;
        let soltar!: () => void;
        const bloqueado = new Promise<void>((r) => { avisar = r; });
        const liberado = new Promise<void>((r) => { soltar = r; });

        const enCurso = conNegocio(n.negocioId, async (tx) => {
          await bloquearProfesionalActivo(tx, id);
          avisar();
          await liberado;
          await tx.consultar(
            `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [n.negocioId, n.sedeId, id, cliente, instante('09:00'), instante('09:30')],
          );
        });
        await bloqueado;
        const peticion = api(token, 'POST', '/bloqueos', bloqueoDe(todoElNegocio ? null : id));
        await new Promise((r) => setTimeout(r, 150));
        soltar();
        await enCurso;

        expect((await peticion).json.citasAfectadas).toHaveLength(1);
      },
    );
  });

  describe('empleado', () => {
    it('gestiona los servicios y el horario de su barbero', async () => {
      const suyo = await crearProfesional(a);
      const token = await sesion(a, 'empleado', suyo);
      const servicios = `/profesionales/${suyo}/servicios`;
      const servicio = await api(token, 'POST', servicios, corte);
      expect(servicio.status).toBe(201);
      expect((await api(token, 'PATCH', `${servicios}/${servicio.json.id}`, { precioCop: 1 })).status).toBe(200);
      expect((await api(token, 'POST', `${servicios}/${servicio.json.id}/desactivar`)).status).toBe(200);
      expect((await api(token, 'GET', servicios)).status).toBe(200);

      const horarios = `/profesionales/${suyo}/horarios`;
      const horario = await api(token, 'POST', horarios, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' });
      expect(horario.status).toBe(201);
      expect((await api(token, 'GET', horarios)).status).toBe(200);
      expect((await api(token, 'DELETE', `${horarios}/${horario.json.id}`)).status).toBe(200);
    });

    it('un barbero ajeno responde 404 en servicios y horarios', async () => {
      const token = await sesion(a, 'empleado', await crearProfesional(a));
      const ajeno = await crearProfesional(a);
      const servicio = await crearServicio(a, ajeno);
      const base = `/profesionales/${ajeno}`;
      expect((await api(token, 'GET', `${base}/servicios`)).status).toBe(404);
      expect((await api(token, 'POST', `${base}/servicios`, corte)).status).toBe(404);
      expect((await api(token, 'PATCH', `${base}/servicios/${servicio}`, { precioCop: 1 })).status).toBe(404);
      expect((await api(token, 'POST', `${base}/servicios/${servicio}/desactivar`)).status).toBe(404);
      expect((await api(token, 'GET', `${base}/horarios`)).status).toBe(404);
      expect((await api(token, 'POST', `${base}/horarios`, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' })).status).toBe(404);
      expect((await api(token, 'DELETE', `${base}/horarios/${randomUUID()}`)).status).toBe(404);
    });

    it('crea y quita sus bloqueos, y por defecto son de su barbero', async () => {
      const suyo = await crearProfesional(a);
      const token = await sesion(a, 'empleado', suyo);
      const r = await api(token, 'POST', '/bloqueos', { inicio: iso('09:00'), fin: iso('10:00') });
      expect(r.status).toBe(201);
      expect(r.json.bloqueo.profesionalId).toBe(suyo);
      const explicito = await api(token, 'POST', '/bloqueos', { profesionalId: suyo, inicio: iso('11:00'), fin: iso('12:00') });
      expect(explicito.status).toBe(201);
      expect((await api(token, 'DELETE', `/bloqueos/${r.json.bloqueo.id}`)).status).toBe(204);
    });

    it('no crea bloqueos del negocio ni de otro barbero', async () => {
      const token = await sesion(a, 'empleado', await crearProfesional(a));
      const ajeno = await crearProfesional(a);
      const rango = { inicio: iso('09:00'), fin: iso('10:00') };
      expect((await api(token, 'POST', '/bloqueos', { ...rango, profesionalId: null })).status).toBe(403);
      expect((await api(token, 'POST', '/bloqueos', { ...rango, profesionalId: ajeno })).status).toBe(403);
    });

    it('ve los suyos y los del negocio, pero no los de otro barbero', async () => {
      const n = await crearNegocio('Empleado ve');
      const dueno = await sesion(n, 'dueno');
      const suyo = await crearProfesional(n);
      const ajeno = await crearProfesional(n);
      const token = await sesion(n, 'empleado', suyo);
      const delSuyo = (await api(dueno, 'POST', '/bloqueos', { profesionalId: suyo, inicio: iso('09:00'), fin: iso('10:00') })).json.bloqueo.id;
      const cierre = (await api(dueno, 'POST', '/bloqueos', { profesionalId: null, inicio: iso('11:00'), fin: iso('12:00') })).json.bloqueo.id;
      await api(dueno, 'POST', '/bloqueos', { profesionalId: ajeno, inicio: iso('09:00'), fin: iso('10:00') });

      const lista = await api(token, 'GET', `/bloqueos?${rangoDelLunes}`);
      expect(ids(lista.json.bloqueos).sort()).toEqual([delSuyo, cierre].sort());
      expect((await api(token, 'GET', `/bloqueos?${rangoDelLunes}&profesionalId=${ajeno}`)).status).toBe(403);
    });

    it('no quita un cierre del negocio (403) ni el bloqueo de otro barbero (404)', async () => {
      const suyo = await crearProfesional(a);
      const token = await sesion(a, 'empleado', suyo);
      const ajeno = await crearProfesional(a);
      const cierre = (await api(duenoA, 'POST', '/bloqueos', { profesionalId: null, inicio: iso('20:00', 3), fin: iso('21:00', 3) })).json.bloqueo.id;
      const deOtro = (await api(duenoA, 'POST', '/bloqueos', { profesionalId: ajeno, inicio: iso('09:00'), fin: iso('10:00') })).json.bloqueo.id;

      expect((await api(token, 'DELETE', `/bloqueos/${cierre}`)).status).toBe(403);
      expect((await api(token, 'DELETE', `/bloqueos/${deOtro}`)).status).toBe(404);
      expect((await api(duenoA, 'DELETE', `/bloqueos/${cierre}`)).status).toBe(204);
      expect((await api(duenoA, 'DELETE', `/bloqueos/${deOtro}`)).status).toBe(204);
    });

    it('sin barbero no entra a bloqueos', async () => {
      const token = await sesion(a, 'empleado');
      expect((await api(token, 'GET', `/bloqueos?${rangoDelLunes}`)).status).toBe(403);
      expect((await api(token, 'POST', '/bloqueos', { inicio: iso('09:00'), fin: iso('10:00') })).status).toBe(403);
    });
  });

  describe('acceso y estado', () => {
    it('el superadmin no entra y sin sesión responde 401', async () => {
      const id = await crearProfesional(a);
      expect((await api(admin, 'GET', `/profesionales/${id}/servicios`)).status).toBe(403);
      expect((await api(admin, 'POST', `/profesionales/${id}/horarios`, {})).status).toBe(403);
      expect((await api(admin, 'GET', `/bloqueos?${rangoDelLunes}`)).status).toBe(403);
      expect((await api(admin, 'POST', '/bloqueos', {})).status).toBe(403);
      expect((await api(null, 'GET', `/profesionales/${id}/servicios`)).status).toBe(401);
      expect((await api(null, 'GET', `/bloqueos?${rangoDelLunes}`)).status).toBe(401);
    });

    it('un barbero inexistente responde 404 y uno mal escrito 400', async () => {
      expect((await api(duenoA, 'GET', `/profesionales/${randomUUID()}/servicios`)).status).toBe(404);
      expect((await api(duenoA, 'GET', `/profesionales/${randomUUID()}/horarios`)).status).toBe(404);
      expect((await api(duenoA, 'GET', '/profesionales/mal/servicios')).status).toBe(400);
    });

    it('un barbero desactivado se consulta, pero no se le cambia la agenda', async () => {
      const id = await crearProfesional(a);
      const servicio = await crearServicio(a, id);
      await crearHorario(a, id, 1, '08:00', '12:00');
      await api(duenoA, 'POST', `/profesionales/${id}/desactivar`);
      const base = `/profesionales/${id}`;

      expect((await api(duenoA, 'GET', `${base}/servicios`)).status).toBe(200);
      expect((await api(duenoA, 'GET', `${base}/horarios`)).status).toBe(200);
      expect((await api(duenoA, 'POST', `${base}/servicios`, corte)).status).toBe(409);
      expect((await api(duenoA, 'PATCH', `${base}/servicios/${servicio}`, { precioCop: 1 })).status).toBe(409);
      expect((await api(duenoA, 'POST', `${base}/servicios/${servicio}/activar`)).status).toBe(409);
      expect((await api(duenoA, 'POST', `${base}/horarios`, { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' })).status).toBe(409);
      expect((await api(duenoA, 'POST', '/bloqueos', { profesionalId: id, inicio: iso('09:00'), fin: iso('10:00') })).status).toBe(409);
    });

    it('un negocio suspendido consulta, pero no modifica nada', async () => {
      const n = await crearNegocio('Suspendido');
      const token = await sesion(n, 'dueno');
      const id = await crearProfesional(n);
      const servicio = await crearServicio(n, id);
      const horario = (await api(token, 'POST', `/profesionales/${id}/horarios`, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' })).json.id;
      const bloqueo = (await api(token, 'POST', '/bloqueos', { profesionalId: id, inicio: iso('09:00'), fin: iso('10:00') })).json.bloqueo.id;
      await suspender(n);
      const base = `/profesionales/${id}`;

      expect((await api(token, 'GET', `${base}/servicios`)).status).toBe(200);
      expect((await api(token, 'GET', `${base}/horarios`)).status).toBe(200);
      expect((await api(token, 'GET', `/bloqueos?${rangoDelLunes}`)).status).toBe(200);

      expect((await api(token, 'POST', `${base}/servicios`, corte)).status).toBe(403);
      expect((await api(token, 'PATCH', `${base}/servicios/${servicio}`, { precioCop: 1 })).status).toBe(403);
      expect((await api(token, 'POST', `${base}/servicios/${servicio}/desactivar`)).status).toBe(403);
      expect((await api(token, 'POST', `${base}/horarios`, { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' })).status).toBe(403);
      expect((await api(token, 'DELETE', `${base}/horarios/${horario}`)).status).toBe(403);
      expect((await api(token, 'POST', '/bloqueos', { profesionalId: id, inicio: iso('11:00'), fin: iso('12:00') })).status).toBe(403);
      expect((await api(token, 'POST', '/bloqueos', { profesionalId: null, inicio: iso('11:00'), fin: iso('12:00') })).status).toBe(403);
      expect((await api(token, 'DELETE', `/bloqueos/${bloqueo}`)).status).toBe(403);
    });
  });

  describe('de punta a punta', () => {
    it('sin SQL: barbero, servicio y horario dan disponibilidad; un bloqueo la quita y al borrarlo vuelve', async () => {
      const n = await crearNegocio('Punta a punta');
      const token = await sesion(n, 'dueno');
      const id = (await api(token, 'POST', '/profesionales', { nombre: 'Andrés' })).json.id;
      const servicio = (await api(token, 'POST', `/profesionales/${id}/servicios`, corte)).json.id;
      await api(token, 'POST', `/profesionales/${id}/horarios`, { diaSemana: 1, horaInicio: '09:00', horaFin: '10:00' });

      const horas = async (): Promise<string[]> => {
        const r = await api(token, 'GET', `/citas/disponibilidad?profesionalId=${id}&servicioIds=${servicio}&desde=${fecha}&hasta=${fecha}`);
        expect(r.status).toBe(200);
        return JSON.stringify(r.json).match(/\d\d:\d\d(?=")/g) ?? [];
      };
      const libres = await horas();
      expect(libres.length).toBeGreaterThan(0);

      const bloqueo = await api(token, 'POST', '/bloqueos', { profesionalId: id, inicio: iso('09:00'), fin: iso('10:00') });
      expect(await horas()).toEqual([]);

      await api(token, 'DELETE', `/bloqueos/${bloqueo.json.bloqueo.id}`);
      expect(await horas()).toEqual(libres);

      const agendada = await api(token, 'POST', '/citas', {
        profesionalId: id, servicioIds: [servicio], inicio: iso('09:00'), cliente: { telefono: '3005000001', nombre: 'Ana' },
      });
      expect(agendada.status).toBe(201);
    });
  });
});
