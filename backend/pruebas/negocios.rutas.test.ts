import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { primerDiaDelMes } from '../src/compartido/tiempo.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { crearNegocio, crearProfesional, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const DIA_MS = 86_400_000;

describe('rutas de negocios', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  const superadmins: string[] = [];
  const negociosPorRuta: string[] = [];
  const planes: string[] = [];
  const tokens = {} as Record<'superadmin' | 'duenoA' | 'duenoB' | 'empleadoA', string>;

  async function usuario(n: NegocioDePrueba | null, rol: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const hash = await argon2.hash(CLAVE);
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
                 VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, hash];
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

  async function crearPorRuta(cuerpo: Record<string, unknown> = { nombre: 'Barbería por ruta' }) {
    const r = await pedir('/negocios', tokens.superadmin, 'POST', cuerpo);
    const datos = await r.json();
    if (r.status === 201) negociosPorRuta.push(datos.id);
    return { r, datos };
  }

  const fijarEstado = (n: NegocioDePrueba, estado: string) =>
    conSistema((tx) => tx.consultar('UPDATE negocios SET estado = $2 WHERE id = $1', [n.negocioId, estado]));

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('Negocio A');
    b = await crearNegocio('Negocio B');
    tokens.superadmin = await usuario(null, 'superadmin');
    tokens.duenoA = await usuario(a, 'dueno');
    tokens.duenoB = await usuario(b, 'dueno');
    tokens.empleadoA = await usuario(a, 'empleado');
  });

  // Cada prueba que suspende al negocio A lo deja como estaba.
  afterEach(() => fijarEstado(a, 'prueba'));

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema(async (tx) => {
      await tx.consultar('DELETE FROM negocios WHERE id = ANY($1::uuid[])', [negociosPorRuta]);
      await tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]);
      await tx.consultar('DELETE FROM planes WHERE id = ANY($1::uuid[])', [planes]);
    });
  });

  describe('superadmin', () => {
    it('crea un negocio en prueba por 15 días, con sede y configuración por defecto', async () => {
      const antes = Date.now();
      const { r, datos } = await crearPorRuta({ nombre: '  Barbería Nueva  ', telefonoAvisos: '3001234567' });
      expect(r.status).toBe(201);
      expect(datos).toMatchObject({
        nombre: 'Barbería Nueva',
        estado: 'prueba',
        zonaHoraria: 'America/Bogota',
        telefonoAvisos: '573001234567',
        planId: null,
      });
      const dias = (new Date(datos.pruebaHasta).getTime() - antes) / DIA_MS;
      expect(dias).toBeGreaterThanOrEqual(15);
      expect(dias).toBeLessThan(15.01);

      const creados = await conNegocio(datos.id, async (tx) => ({
        sedes: (await tx.consultar('SELECT 1 FROM sedes')).rowCount,
        config: (await tx.consultar('SELECT 1 FROM configuracion_negocio')).rowCount,
      }));
      expect(creados).toEqual({ sedes: 1, config: 1 });
    });

    it('rechaza datos inválidos y campos que no le corresponden al crear', async () => {
      const casos = [
        {},
        { nombre: '   ' },
        { nombre: 'X', zonaHoraria: 'Marte/Olimpo' },
        { nombre: 'X', telefonoAvisos: '12' },
        { nombre: 'X', planId: randomUUID() },
        { nombre: 'X', planId: 'no-es-uuid' },
        { nombre: 'X', estado: 'activo' },
      ];
      for (const cuerpo of casos) {
        expect((await crearPorRuta(cuerpo)).r.status, JSON.stringify(cuerpo)).toBe(400);
      }
    });

    it('lista negocios de toda la plataforma y consulta uno', async () => {
      const lista = await (await pedir('/negocios', tokens.superadmin)).json();
      const ids = lista.negocios.map((n: { id: string }) => n.id);
      expect(ids).toEqual(expect.arrayContaining([a.negocioId, b.negocioId]));

      const uno = await pedir(`/negocios/${a.negocioId}`, tokens.superadmin);
      expect(uno.status).toBe(200);
      expect((await uno.json()).nombre).toBe('Negocio A');
    });

    it('la lista dice si el negocio tiene un número de WhatsApp activo', async () => {
      const conectado = (lista: { negocios: { id: string; whatsappConectado: boolean }[] }, id: string) =>
        lista.negocios.find((n) => n.id === id)!.whatsappConectado;
      const leer = async () => (await pedir('/negocios', tokens.superadmin)).json();
      expect(conectado(await leer(), a.negocioId)).toBe(false);

      const telefono = `1${Date.now()}`;
      const [cuenta] = await conSistema(async (tx) =>
        (
          await tx.consultar<{ id: string }>(
            `INSERT INTO whatsapp_cuentas (negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
             VALUES ($1, $2, 'waba', '+57 300', 'x') RETURNING id`,
            [a.negocioId, telefono],
          )
        ).rows,
      );
      expect(conectado(await leer(), a.negocioId)).toBe(true);
      expect(conectado(await leer(), b.negocioId)).toBe(false);

      // Un número desactivado no cuenta como conectado.
      await conSistema((tx) => tx.consultar('UPDATE whatsapp_cuentas SET activa = false WHERE id = $1', [cuenta!.id]));
      expect(conectado(await leer(), a.negocioId)).toBe(false);
      await conSistema((tx) => tx.consultar('DELETE FROM whatsapp_cuentas WHERE id = $1', [cuenta!.id]));
    });

    it('un id inexistente responde 404 y uno mal escrito 400', async () => {
      expect((await pedir(`/negocios/${randomUUID()}`, tokens.superadmin)).status).toBe(404);
      expect((await pedir('/negocios/no-es-uuid', tokens.superadmin)).status).toBe(400);
      const parche = await pedir(`/negocios/${randomUUID()}`, tokens.superadmin, 'PATCH', { estado: 'activo' });
      expect(parche.status).toBe(404);
    });

    it('cambia el estado y el plan, y solo acepta planes activos', async () => {
      const { rows } = await conSistema((tx) =>
        tx.consultar<{ id: string; activo: boolean }>(
          `INSERT INTO planes (nombre, precio_mensual_cop, activo)
           VALUES ($1, 50000, true), ($2, 50000, false) RETURNING id, activo`,
          [`Plan ${randomUUID()}`, `Plan ${randomUUID()}`],
        ),
      );
      planes.push(...rows.map((p) => p.id));
      const activo = rows.find((p) => p.activo)!.id;
      const inactivo = rows.find((p) => !p.activo)!.id;
      const { datos } = await crearPorRuta();
      const ruta = `/negocios/${datos.id}`;

      const cambiado = await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'activo', planId: activo });
      expect(await cambiado.json()).toMatchObject({ estado: 'activo', planId: activo });
      expect((await pedir(ruta, tokens.superadmin, 'PATCH', { planId: inactivo })).status).toBe(400);

      const sinPlan = await pedir(ruta, tokens.superadmin, 'PATCH', { planId: null });
      expect(await sinPlan.json()).toMatchObject({ estado: 'activo', planId: null });
    });

    it('al volver a prueba sin fecha la deja en 30 días; si ya estaba en prueba, no la toca', async () => {
      const { datos } = await crearPorRuta();
      const ruta = `/negocios/${datos.id}`;
      const deCreacion = datos.pruebaHasta;
      // Ya en prueba (la de creación): pedir "prueba" otra vez no le cambia la fecha.
      expect((await (await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'prueba' })).json()).pruebaHasta).toBe(deCreacion);

      await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'activo' });
      const antes = Date.now();
      const vuelta = await (await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'prueba' })).json();
      expect(vuelta.estado).toBe('prueba');
      const dias = (new Date(vuelta.pruebaHasta).getTime() - antes) / DIA_MS;
      expect(dias).toBeGreaterThanOrEqual(30);
      expect(dias).toBeLessThan(30.01);
    });

    it('el superadmin fija el fin de la prueba: al pasar a prueba o después, siempre futuro', async () => {
      const { datos } = await crearPorRuta();
      const ruta = `/negocios/${datos.id}`;
      const en = (dias: number) => new Date(Date.now() + dias * DIA_MS).toISOString();

      const editada = await pedir(ruta, tokens.superadmin, 'PATCH', { pruebaHasta: en(45) });
      expect(editada.status).toBe(200);
      expect(new Date((await editada.json()).pruebaHasta).getTime()).toBeCloseTo(new Date(en(45)).getTime(), -4);

      await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'activo' });
      const conFecha = await (await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'prueba', pruebaHasta: en(7) })).json();
      expect(conFecha.estado).toBe('prueba');
      expect((new Date(conFecha.pruebaHasta).getTime() - Date.now()) / DIA_MS).toBeLessThan(7.01);
    });

    it('rechaza un fin de prueba pasado, de más de un año, sin zona o para un negocio que no queda en prueba', async () => {
      const { datos } = await crearPorRuta();
      const ruta = `/negocios/${datos.id}`;
      const en = (dias: number) => new Date(Date.now() + dias * DIA_MS).toISOString();
      for (const cuerpo of [
        { pruebaHasta: en(-1) },
        { pruebaHasta: en(400) },
        { pruebaHasta: '2030-01-01' },
        { pruebaHasta: null },
        { estado: 'activo', pruebaHasta: en(10) },
      ]) {
        expect((await pedir(ruta, tokens.superadmin, 'PATCH', cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
      }
      await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'activo' });
      expect((await pedir(ruta, tokens.superadmin, 'PATCH', { pruebaHasta: en(10) })).status).toBe(400);
      // Nada de lo rechazado quedó guardado.
      expect((await (await pedir(ruta, tokens.superadmin)).json()).estado).toBe('activo');
    });

    it('el dueño no puede fijarse el fin de la prueba', async () => {
      expect((await pedir('/negocio', tokens.duenoA, 'PATCH', { pruebaHasta: new Date(Date.now() + 90 * DIA_MS).toISOString() })).status).toBe(400);
      expect((await pedir(`/negocios/${a.negocioId}`, tokens.duenoA, 'PATCH', { pruebaHasta: new Date(Date.now() + 90 * DIA_MS).toISOString() })).status).toBe(403);
    });

    it('no acepta un cambio vacío, un estado inválido ni otros campos', async () => {
      const ruta = `/negocios/${a.negocioId}`;
      for (const cuerpo of [{}, { estado: 'borrado' }, { nombre: 'Otro' }, { pagadoHasta: '2030-01-01' }]) {
        expect((await pedir(ruta, tokens.superadmin, 'PATCH', cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
      }
    });

    it('invita al dueño del negocio creado y ese dueño entra a SU negocio', async () => {
      const { datos } = await crearPorRuta({ nombre: 'Alta completa' });
      const email = `${randomUUID()}@prueba.com`;
      const invitacion = await pedir('/auth/usuarios/invitar', tokens.superadmin, 'POST', {
        email, nombre: 'Dueña', rol: 'dueno', negocioId: datos.id,
      });
      expect(invitacion.status).toBe(201);
      const { enlace } = await invitacion.json();
      const token = decodeURIComponent(enlace.split('#token=')[1]);
      expect((await pedir('/auth/aceptar-invitacion', undefined, 'POST', { token, password: CLAVE })).status).toBe(204);

      const login = await pedir('/auth/login', undefined, 'POST', { email, password: CLAVE });
      const sesion = await login.json();
      const mio = await (await pedir('/negocio', sesion.token)).json();
      expect(mio.negocio.id).toBe(datos.id);
    });

    it('invitar a un negocio que no existe responde 404, no un error interno', async () => {
      const r = await pedir('/auth/usuarios/invitar', tokens.superadmin, 'POST', {
        email: `${randomUUID()}@prueba.com`, nombre: 'Nadie', rol: 'dueno', negocioId: randomUUID(),
      });
      expect(r.status).toBe(404);
    });

    it('no opera el negocio: no entra a /negocio', async () => {
      expect((await pedir('/negocio', tokens.superadmin)).status).toBe(403);
      expect((await pedir('/negocio', tokens.superadmin, 'PATCH', { nombre: 'X' })).status).toBe(403);
      expect((await pedir('/negocio/configuracion', tokens.superadmin, 'PATCH', { horasRecordatorio: 5 })).status).toBe(403);
    });
  });

  describe('dueño', () => {
    it('ve su negocio y su configuración, sin datos de otro', async () => {
      const r = await pedir('/negocio', tokens.duenoA);
      expect(r.status).toBe(200);
      const datos = await r.json();
      expect(datos.negocio).toMatchObject({ id: a.negocioId, nombre: 'Negocio A' });
      expect(datos.configuracion).toMatchObject({
        intervaloMinutos: 15,
        maxCitasActivasCliente: 2,
        recordatorioNoAntesDe: '07:00',
        recordatorioNoDespuesDe: '21:00',
      });

      const otro = await (await pedir('/negocio', tokens.duenoB)).json();
      expect(otro.negocio.id).toBe(b.negocioId);
    });

    it('actualiza nombre, teléfono y zona, y no afecta a otro negocio', async () => {
      const r = await pedir('/negocio', tokens.duenoB, 'PATCH', {
        nombre: 'Negocio B renombrado', telefonoAvisos: '+57 300 111 2233', zonaHoraria: 'America/Lima',
      });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        id: b.negocioId, nombre: 'Negocio B renombrado', telefonoAvisos: '573001112233', zonaHoraria: 'America/Lima',
      });

      const borrado = await pedir('/negocio', tokens.duenoB, 'PATCH', { telefonoAvisos: null });
      expect((await borrado.json()).telefonoAvisos).toBeNull();

      const intacto = await (await pedir('/negocio', tokens.duenoA)).json();
      expect(intacto.negocio).toMatchObject({ nombre: 'Negocio A', zonaHoraria: 'America/Bogota' });
    });

    it('no puede cambiar su plan ni su estado', async () => {
      for (const cuerpo of [{ estado: 'activo' }, { planId: null }, { pruebaHasta: '2099-01-01' }, { id: b.negocioId }]) {
        expect((await pedir('/negocio', tokens.duenoA, 'PATCH', cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
      }
      const { negocio } = await (await pedir('/negocio', tokens.duenoA)).json();
      expect(negocio.estado).toBe('prueba');
    });

    it('rechaza datos inválidos de su negocio', async () => {
      for (const cuerpo of [{}, { nombre: '' }, { telefonoAvisos: 'abc' }, { zonaHoraria: 'Marte/Olimpo' }]) {
        expect((await pedir('/negocio', tokens.duenoA, 'PATCH', cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
      }
    });

    it('actualiza solo los campos enviados de la configuración, y null quita el límite', async () => {
      const ruta = '/negocio/configuracion';
      const r = await pedir(ruta, tokens.duenoB, 'PATCH', {
        intervaloMinutos: 30, maxCitasActivasCliente: null, recordatorioNoAntesDe: '08:30',
      });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        intervaloMinutos: 30,
        maxCitasActivasCliente: null,
        recordatorioNoAntesDe: '08:30',
        recordatorioNoDespuesDe: '21:00',
        horasRecordatorio: 11,
      });

      const deA = (await (await pedir('/negocio', tokens.duenoA)).json()).configuracion;
      expect(deA.intervaloMinutos).toBe(15);
    });

    it.each([
      [{}, 'vacío'],
      [{ intervaloMinutos: 7 }, 'intervalo no permitido'],
      [{ anticipacionMinMinutos: -1 }, 'negativo'],
      [{ anticipacionMaxDias: 0 }, 'fuera de rango'],
      [{ horasRecordatorio: 1.5 }, 'no entero'],
      [{ horasRecordatorio: '5' }, 'tipo incorrecto'],
      [{ horasModoHumano: 3_000_000_000 }, 'desborda integer'],
      [{ recordatorioNoAntesDe: '25:00' }, 'hora inexistente'],
      [{ campoInventado: 1 }, 'campo desconocido'],
    ])('rechaza una configuración inválida: %j (%s)', async (cuerpo, _motivo) => {
      expect((await pedir('/negocio/configuracion', tokens.duenoA, 'PATCH', cuerpo)).status).toBe(400);
    });

    it('revisa la coherencia con los valores ya guardados y no deja el cambio a medias', async () => {
      const ruta = '/negocio/configuracion';
      // Por defecto los recordatorios terminan a las 21:00 y la anticipación máxima es de 30 días.
      const horario = await pedir(ruta, tokens.duenoA, 'PATCH', { recordatorioNoAntesDe: '22:00', horasRecordatorio: 5 });
      expect(horario.status).toBe(400);
      const anticipacion = await pedir(ruta, tokens.duenoA, 'PATCH', { anticipacionMinMinutos: 43_200, anticipacionMaxDias: 30 });
      expect(anticipacion.status).toBe(400);

      const { configuracion } = await (await pedir('/negocio', tokens.duenoA)).json();
      expect(configuracion).toMatchObject({ recordatorioNoAntesDe: '07:00', horasRecordatorio: 11, anticipacionMinMinutos: 60 });
    });
  });

  describe('acceso', () => {
    it('sin sesión responde 401', async () => {
      for (const ruta of ['/negocios', '/negocio']) {
        expect((await pedir(ruta, undefined)).status).toBe(401);
      }
    });

    it('dueño y empleado no administran la plataforma', async () => {
      for (const token of [tokens.duenoA, tokens.empleadoA]) {
        expect((await pedir('/negocios', token)).status).toBe(403);
        expect((await pedir('/negocios', token, 'POST', { nombre: 'X' })).status).toBe(403);
        expect((await pedir(`/negocios/${a.negocioId}`, token)).status).toBe(403);
        expect((await pedir(`/negocios/${a.negocioId}`, token, 'PATCH', { estado: 'activo' })).status).toBe(403);
      }
    });

    it('el empleado no ve ni cambia la configuración del negocio', async () => {
      expect((await pedir('/negocio', tokens.empleadoA)).status).toBe(403);
      expect((await pedir('/negocio', tokens.empleadoA, 'PATCH', { nombre: 'X' })).status).toBe(403);
      expect((await pedir('/negocio/configuracion', tokens.empleadoA, 'PATCH', { horasRecordatorio: 5 })).status).toBe(403);
    });
  });

  describe('negocio suspendido', () => {
    it('su dueño aún inicia sesión y consulta, pero no modifica su negocio', async () => {
      await fijarEstado(a, 'suspendido');
      expect((await pedir('/auth/yo', tokens.duenoA)).status).toBe(200);
      expect((await pedir('/negocio', tokens.duenoA)).status).toBe(200);
      expect((await pedir('/negocio', tokens.duenoA, 'PATCH', { nombre: 'No debe' })).status).toBe(403);
      expect((await pedir('/negocio/configuracion', tokens.duenoA, 'PATCH', { horasRecordatorio: 5 })).status).toBe(403);

      const { negocio, configuracion } = await (await pedir('/negocio', tokens.duenoA)).json();
      expect(negocio.nombre).toBe('Negocio A');
      expect(configuracion.horasRecordatorio).toBe(11);
    });

    it('el superadmin lo suspende y lo reactiva por la ruta', async () => {
      const ruta = `/negocios/${a.negocioId}`;
      await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'suspendido' });
      expect((await pedir('/negocio', tokens.duenoA, 'PATCH', { nombre: 'No debe' })).status).toBe(403);

      await pedir(ruta, tokens.superadmin, 'PATCH', { estado: 'activo' });
      const r = await pedir('/negocio', tokens.duenoA, 'PATCH', { nombre: 'Negocio A' });
      expect(r.status).toBe(200);
    });

    it('agendar por el panel no deja un cliente creado', async () => {
      await fijarEstado(a, 'suspendido');
      const telefono = `5730${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const r = await pedir('/citas', tokens.duenoA, 'POST', {
        profesionalId: randomUUID(),
        servicioIds: [randomUUID()],
        inicio: '2030-06-10T14:00:00Z',
        cliente: { telefono, nombre: 'Nueva' },
      });
      expect(r.status).toBe(403);
      const { rowCount } = await conNegocio(a.negocioId, (tx) =>
        tx.consultar('SELECT 1 FROM clientes WHERE telefono = $1', [telefono]),
      );
      expect(rowCount).toBe(0);
    });

    it('su dueño no invita ni genera recuperación; el superadmin sí puede', async () => {
      await fijarEstado(a, 'suspendido');
      const invitar = {
        email: `${randomUUID()}@prueba.com`, nombre: 'Nueva', rol: 'empleado', profesionalId: await crearProfesional(a),
      };
      expect((await pedir('/auth/usuarios/invitar', tokens.duenoA, 'POST', invitar)).status).toBe(403);

      const hecha = await pedir('/auth/usuarios/invitar', tokens.superadmin, 'POST', { ...invitar, negocioId: a.negocioId });
      expect(hecha.status).toBe(201);

      // La recuperación es para usuarios activos: uno recién invitado todavía no lo está.
      const { rows } = await conNegocio(a.negocioId, (tx) =>
        tx.consultar<{ id: string }>(
          `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
           VALUES ($1, $2, 'Activa', 'empleado', true, 'hash') RETURNING id`,
          [a.negocioId, `${randomUUID()}@prueba.com`],
        ),
      );
      const ruta = `/auth/usuarios/${rows[0]!.id}/recuperacion`;
      expect((await pedir(ruta, tokens.duenoA, 'POST', {})).status).toBe(403);
      expect((await pedir(ruta, tokens.superadmin, 'POST', { negocioId: a.negocioId })).status).toBe(201);
    });
  });

  describe('lo que necesita el panel', () => {
    const negocioEnLaBase = async (n: NegocioDePrueba) => {
      const { rows } = await conSistema((tx) =>
        tx.consultar<{ nombre: string; zona_horaria: string }>('SELECT nombre, zona_horaria FROM negocios WHERE id = $1', [n.negocioId]),
      );
      return { nombre: rows[0]!.nombre, zonaHoraria: rows[0]!.zona_horaria };
    };

    it('GET /auth/yo trae el nombre y la zona horaria del negocio, también al empleado', async () => {
      const r = await pedir('/auth/yo', tokens.empleadoA);
      expect(r.status).toBe(200);
      const datos = await r.json();
      expect(datos.usuario).toMatchObject({ rol: 'empleado', negocioId: a.negocioId });
      expect(datos.negocio).toEqual(await negocioEnLaBase(a));
    });

    it('el negocio de /auth/yo es siempre el de la sesión', async () => {
      const datos = await (await pedir('/auth/yo', tokens.duenoB)).json();
      expect(datos.negocio).toEqual(await negocioEnLaBase(b));
    });

    it('al superadmin no le trae negocio', async () => {
      const datos = await (await pedir('/auth/yo', tokens.superadmin)).json();
      expect(datos).toMatchObject({ usuario: { rol: 'superadmin', negocioId: null }, negocio: null });
    });

    it('GET /negocio/uso sin plan y sin uso: todo en cero y sin límites', async () => {
      const r = await pedir('/negocio/uso', tokens.duenoA);
      expect(r.status).toBe(200);
      const { zonaHoraria } = await negocioEnLaBase(a);
      expect(await r.json()).toEqual({
        periodo: primerDiaDelMes(new Date(), zonaHoraria),
        plan: null,
        uso: { conversacionesIa: 0, citasCreadas: 0, plantillasEnviadas: 0 },
      });
    });

    it('GET /negocio/uso trae el mes actual del negocio con los límites de su plan', async () => {
      const nombrePlan = `Plan ${randomUUID()}`;
      const { rows } = await conSistema((tx) =>
        tx.consultar<{ id: string }>(
          'INSERT INTO planes (nombre, precio_mensual_cop, max_conversaciones_ia_mes, max_citas_mes) VALUES ($1, 50000, 100, 300) RETURNING id',
          [nombrePlan],
        ),
      );
      planes.push(rows[0]!.id);
      const { zonaHoraria } = await negocioEnLaBase(b);
      const periodo = primerDiaDelMes(new Date(), zonaHoraria);
      try {
        await conSistema((tx) => tx.consultar('UPDATE negocios SET plan_id = $2 WHERE id = $1', [b.negocioId, rows[0]!.id]));
        await conNegocio(b.negocioId, async (tx) => {
          await tx.consultar(
            `INSERT INTO uso_mensual (negocio_id, periodo, conversaciones_ia, citas_creadas, plantillas_enviadas)
             VALUES ($1, $2::date, 80, 12, 5), ($1, $2::date - interval '1 month', 999, 999, 999)`,
            [b.negocioId, periodo],
          );
        });
        expect(await (await pedir('/negocio/uso', tokens.duenoB)).json()).toEqual({
          periodo,
          plan: { nombre: nombrePlan, maxConversacionesIa: 100, maxCitasMes: 300 },
          uso: { conversacionesIa: 80, citasCreadas: 12, plantillasEnviadas: 5 },
        });
        // El uso de B no se ve desde A.
        expect((await (await pedir('/negocio/uso', tokens.duenoA)).json()).uso.conversacionesIa).toBe(0);
      } finally {
        await conSistema(async (tx) => {
          await tx.consultar('UPDATE negocios SET plan_id = NULL WHERE id = $1', [b.negocioId]);
          await tx.consultar('DELETE FROM uso_mensual WHERE negocio_id = $1', [b.negocioId]);
        });
      }
    });

    it('solo el dueño ve el uso', async () => {
      expect((await pedir('/negocio/uso', tokens.empleadoA)).status).toBe(403);
      expect((await pedir('/negocio/uso', tokens.superadmin)).status).toBe(403);
      expect((await pedir('/negocio/uso', undefined)).status).toBe(401);
    });
  });
});
