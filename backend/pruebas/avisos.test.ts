import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import {
  avisarDerivaciones,
  avisarLimitesDelPlan,
  MAX_INTENTOS_AVISO,
  parametro,
  PLANTILLA_DERIVACION,
  PLANTILLA_LIMITE,
  plantillaDeDerivacion,
} from '../src/modulos/avisos/avisos.servicio.js';
import { derivarConversacion } from '../src/modulos/conversaciones/conversaciones.servicio.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

/** Viernes 16 de marzo de 2035, 9:00 a. m. en Bogotá. */
const T = new Date('2035-03-16T14:00:00Z');
const HORA = 3_600_000;
const TOKEN = 'EAAtoken-de-prueba-avisos';
const DUENO = '573009998877';

/** Meta simulado: anota cada plantilla enviada y responde según `estado`. */
function metaFalso(estado = 200, codigo?: number) {
  const enviados: { url: string; autorizacion: string; cuerpo: Record<string, any> }[] = [];
  const pedir = vi.fn<typeof fetch>(async (url, init) => {
    enviados.push({ url: String(url), autorizacion: String((init!.headers as Record<string, string>).authorization), cuerpo: JSON.parse(String(init!.body)) });
    if (estado !== 200) return new Response(JSON.stringify({ error: { code: codigo ?? 1 } }), { status: estado });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 });
  });
  const parametros = (i = 0) =>
    Object.fromEntries((enviados[i]!.cuerpo.template.components[0].parameters as { parameter_name: string; text: string }[]).map((p) => [p.parameter_name, p.text]));
  return { pedir, enviados, parametros };
}

describe('avisos al dueño', () => {
  const planes: string[] = [];
  let telefonos = 0;

  interface Escena {
    n: NegocioDePrueba;
    cuentaId: string;
    phoneNumberId: string;
  }

  /** Cada prueba con su negocio: las tareas cruzan negocios y así no se pisan los conteos. */
  async function escena(telefonoAvisos: string | null = DUENO): Promise<Escena> {
    const n = await crearNegocio('Barbería La 70');
    const phoneNumberId = `${Date.now()}${++telefonos}`;
    const cuenta = await registrarCuenta(n.negocioId, { phoneNumberId, wabaId: '1', numeroVisible: '3000000003', token: TOKEN });
    if (telefonoAvisos) await conSistema((tx) => tx.consultar('UPDATE negocios SET telefono_avisos = $2 WHERE id = $1', [n.negocioId, telefonoAvisos]));
    return { n, cuentaId: cuenta.id, phoneNumberId };
  }

  const sql = async <F extends object>(e: Escena, texto: string, params: unknown[] = []) =>
    (await conNegocio(e.n.negocioId, (tx) => tx.consultar<F>(texto, params))).rows;

  async function conversacion(e: Escena, cliente: { nombre: string | null; telefono: string | null; waUserId?: string }) {
    const [c] = await sql<{ id: string }>(e, 'INSERT INTO clientes (negocio_id, nombre, telefono, wa_user_id) VALUES ($1, $2, $3, $4) RETURNING id', [
      e.n.negocioId,
      cliente.nombre,
      cliente.telefono,
      cliente.waUserId ?? null,
    ]);
    const [conv] = await sql<{ id: string }>(
      e,
      'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en) VALUES ($1, $2, $3, $4) RETURNING id',
      [e.n.negocioId, c!.id, e.cuentaId, T],
    );
    return { conversacionId: conv!.id, clienteId: c!.id };
  }

  async function derivada(e: Escena, momento = T, motivo: 'cliente_pidio_humano' | 'sin_informacion' = 'sin_informacion', detalle: string | null = 'Precio de las ceras') {
    const c = await conversacion(e, { nombre: 'Laura', telefono: `5730${String(++telefonos).padStart(8, '0')}` });
    await derivarConversacion(e.n.negocioId, c.conversacionId, motivo, detalle, momento);
    return c;
  }

  const aviso = async (e: Escena, conversacionId: string) =>
    (await sql<{ aviso_resultado: string | null; aviso_intentos: number; avisada_en: Date | null }>(
      e,
      'SELECT aviso_resultado, aviso_intentos, avisada_en FROM derivaciones WHERE conversacion_id = $1',
      [conversacionId],
    ))[0]!;

  /** Solo cuenta los envíos de esta escena: las tareas recorren todos los negocios. */
  const deEscena = (e: Escena, meta: ReturnType<typeof metaFalso>) => meta.enviados.filter((m) => m.url.includes(e.phoneNumberId));

  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM planes WHERE id = ANY($1::uuid[])', [planes]));
  });

  describe('texto de la plantilla', () => {
    it('cada parámetro queda en una línea, sin espacios de sobra, corto y nunca vacío', () => {
      expect(parametro('  hola\n\nmundo\t\tcon   espacios ')).toBe('hola mundo con espacios');
      expect(parametro('')).toBe('-');
      expect(parametro(null)).toBe('-');
      expect(parametro('🙂'.repeat(300), 10)).toBe(`${'🙂'.repeat(9)}…`);
    });

    it('dice quién es, por qué, qué pidió y cómo contactarlo', () => {
      const p = plantillaDeDerivacion({ motivo: 'cliente_pidio_humano', detalle: 'Quiere\nhablar', clienteNombre: 'Laura', clienteTelefono: '573001234567', horasModoHumano: 2 });
      expect(p).toEqual({
        nombre: PLANTILLA_DERIVACION,
        idioma: 'es_CO',
        parametros: { cliente: 'Laura', motivo: 'Pidió hablar con una persona', detalle: 'Quiere hablar', contacto: '+573001234567', horas: '2' },
      });
    });

    it('sin nombre, sin detalle o sin teléfono, igual se entiende', () => {
      const p = plantillaDeDerivacion({ motivo: 'error', detalle: null, clienteNombre: null, clienteTelefono: null, horasModoHumano: 5 });
      expect(p.parametros).toEqual({
        cliente: 'Sin nombre',
        motivo: 'El asistente falló varias veces seguidas',
        detalle: 'No lo indicó',
        contacto: 'No comparte su número. Respóndele desde Turnoo',
        horas: '5',
      });
    });
  });

  describe('derivaciones', () => {
    it('envía la plantilla al teléfono de avisos, por la cuenta del negocio, una sola vez', async () => {
      const e = await escena();
      const c = await derivada(e, T, 'cliente_pidio_humano', 'Quiere hablar con alguien');
      const meta = metaFalso();
      await avisarDerivaciones(T, { pedir: meta.pedir });
      const propios = deEscena(e, meta);
      expect(propios).toHaveLength(1);
      expect(propios[0]!.url).toContain(`/${e.phoneNumberId}/messages`);
      expect(propios[0]!.autorizacion).toBe(`Bearer ${TOKEN}`);
      expect(propios[0]!.cuerpo).toMatchObject({ to: DUENO, type: 'template', template: { name: PLANTILLA_DERIVACION, language: { code: 'es_CO' } } });
      expect(meta.parametros(meta.enviados.indexOf(propios[0]!))).toMatchObject({ cliente: 'Laura', motivo: 'Pidió hablar con una persona', detalle: 'Quiere hablar con alguien', horas: '2' });
      expect(await aviso(e, c.conversacionId)).toMatchObject({ aviso_resultado: 'enviado', avisada_en: T });
      // Cuenta como plantilla, no como conversación de IA: no gasta el cupo del plan.
      expect(await sql(e, `SELECT plantillas_enviadas, conversaciones_ia FROM uso_mensual WHERE periodo = '2035-03-01'`)).toEqual([
        { plantillas_enviadas: 1, conversaciones_ia: 0 },
      ]);

      const otra = metaFalso();
      await avisarDerivaciones(new Date(T.getTime() + 60_000), { pedir: otra.pedir });
      expect(deEscena(e, otra)).toHaveLength(0);
    });

    it('con un cliente sin teléfono, le indica responder desde Turnoo', async () => {
      const e = await escena();
      const c = await conversacion(e, { nombre: 'Sin número', telefono: null, waUserId: 'CO.abc123' });
      await derivarConversacion(e.n.negocioId, c.conversacionId, 'sin_comprension', null, T);
      const meta = metaFalso();
      await avisarDerivaciones(T, { pedir: meta.pedir });
      const i = meta.enviados.indexOf(deEscena(e, meta)[0]!);
      expect(meta.parametros(i).contacto).toBe('No comparte su número. Respóndele desde Turnoo');
      // El BSUID no va en el aviso: no le sirve al dueño.
      expect(JSON.stringify(meta.enviados[i])).not.toContain('CO.abc123');
    });

    it('sin teléfono de avisos queda pendiente, y sale si el dueño lo configura antes de 24 horas', async () => {
      const e = await escena(null);
      const c = await derivada(e);
      const meta = metaFalso();
      await avisarDerivaciones(new Date(T.getTime() + HORA), { pedir: meta.pedir });
      expect(deEscena(e, meta)).toHaveLength(0);
      expect((await aviso(e, c.conversacionId)).aviso_resultado).toBeNull();

      await conSistema((tx) => tx.consultar('UPDATE negocios SET telefono_avisos = $2 WHERE id = $1', [e.n.negocioId, DUENO]));
      await avisarDerivaciones(new Date(T.getTime() + 23 * HORA), { pedir: meta.pedir });
      expect(deEscena(e, meta)).toHaveLength(1);
    });

    it('las pendientes sin teléfono de avisos no le quitan el turno a las demás', async () => {
      const sinTelefono = await escena(null);
      // Más que los cupos de una vuelta, y más viejas que la que sí se puede avisar.
      for (let i = 0; i < 25; i += 1) await derivada(sinTelefono, new Date(T.getTime() - 60_000 + i));
      const conTelefono = await escena();
      await derivada(conTelefono);
      const meta = metaFalso();
      await avisarDerivaciones(T, { pedir: meta.pedir });
      expect(deEscena(conTelefono, meta)).toHaveLength(1);
    });

    it('pasadas 24 horas se da por vencido y no se envía', async () => {
      const e = await escena(null);
      const c = await derivada(e);
      await conSistema((tx) => tx.consultar('UPDATE negocios SET telefono_avisos = $2 WHERE id = $1', [e.n.negocioId, DUENO]));
      const meta = metaFalso();
      await avisarDerivaciones(new Date(T.getTime() + 24 * HORA), { pedir: meta.pedir });
      expect(deEscena(e, meta)).toHaveLength(0);
      expect((await aviso(e, c.conversacionId)).aviso_resultado).toBe('vencido');
    });

    it(`un fallo pasajero se reintenta; tras ${MAX_INTENTOS_AVISO} intentos queda fallido`, async () => {
      const e = await escena();
      const c = await derivada(e);
      const caido = metaFalso(500);
      for (let i = 1; i <= MAX_INTENTOS_AVISO; i += 1) {
        await avisarDerivaciones(new Date(T.getTime() + i * 60_000), { pedir: caido.pedir });
        expect(await aviso(e, c.conversacionId)).toMatchObject({ aviso_intentos: i, aviso_resultado: i < MAX_INTENTOS_AVISO ? null : 'fallido' });
      }
      const sano = metaFalso();
      await avisarDerivaciones(new Date(T.getTime() + 10 * 60_000), { pedir: sano.pedir });
      expect(deEscena(e, sano)).toHaveLength(0);
    });

    it('un rechazo definitivo (plantilla no aprobada) queda fallido de una vez', async () => {
      const e = await escena();
      const c = await derivada(e);
      await avisarDerivaciones(T, { pedir: metaFalso(400, 132001).pedir });
      expect(await aviso(e, c.conversacionId)).toMatchObject({ aviso_intentos: 1, aviso_resultado: 'fallido' });
    });

    it('no avisa a un negocio suspendido ni por una cuenta desactivada', async () => {
      const suspendido = await escena();
      await derivada(suspendido);
      await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'suspendido' WHERE id = $1`, [suspendido.n.negocioId]));
      const inactiva = await escena();
      const c = await derivada(inactiva);
      await sql(inactiva, 'UPDATE whatsapp_cuentas SET activa = false WHERE id = $1', [inactiva.cuentaId]);
      const meta = metaFalso();
      await avisarDerivaciones(T, { pedir: meta.pedir });
      expect([...deEscena(suspendido, meta), ...deEscena(inactiva, meta)]).toHaveLength(0);
      expect((await aviso(inactiva, c.conversacionId)).aviso_resultado).toBe('fallido');
    });

    it('dos vueltas a la vez no avisan dos veces', async () => {
      const e = await escena();
      await derivada(e);
      const meta = metaFalso();
      await Promise.all([avisarDerivaciones(T, { pedir: meta.pedir }), avisarDerivaciones(T, { pedir: meta.pedir }), avisarDerivaciones(T, { pedir: meta.pedir })]);
      expect(deEscena(e, meta)).toHaveLength(1);
    });
  });

  describe('80% del límite del plan', () => {
    async function conPlan(e: Escena, limite: number, usadas: number, periodo = '2035-03-01') {
      const { rows } = await conSistema((tx) =>
        tx.consultar<{ id: string }>('INSERT INTO planes (nombre, precio_mensual_cop, max_conversaciones_ia_mes) VALUES ($1, 50000, $2) RETURNING id', [`Plan ${randomUUID()}`, limite]),
      );
      planes.push(rows[0]!.id);
      await conSistema((tx) => tx.consultar('UPDATE negocios SET plan_id = $2 WHERE id = $1', [e.n.negocioId, rows[0]!.id]));
      await sql(e, 'INSERT INTO uso_mensual (negocio_id, periodo, conversaciones_ia) VALUES ($1, $2, $3) ON CONFLICT (negocio_id, periodo) DO UPDATE SET conversaciones_ia = $3', [e.n.negocioId, periodo, usadas]);
    }
    const usar = (e: Escena, usadas: number, periodo = '2035-03-01') =>
      sql(e, 'UPDATE uso_mensual SET conversaciones_ia = $3 WHERE negocio_id = $1 AND periodo = $2', [e.n.negocioId, periodo, usadas]);

    it('avisa una sola vez al llegar al 80%, con lo usado y el límite', async () => {
      const e = await escena();
      await conPlan(e, 10, 7);
      const meta = metaFalso();
      await avisarLimitesDelPlan(T, { pedir: meta.pedir });
      expect(deEscena(e, meta)).toHaveLength(0);

      await usar(e, 8);
      await avisarLimitesDelPlan(T, { pedir: meta.pedir });
      const propios = deEscena(e, meta);
      expect(propios).toHaveLength(1);
      expect(propios[0]!.cuerpo).toMatchObject({ to: DUENO, template: { name: PLANTILLA_LIMITE } });
      expect(meta.parametros(meta.enviados.indexOf(propios[0]!))).toEqual({ negocio: 'Barbería La 70', usadas: '8', limite: '10' });
      // El aviso cuenta como plantilla; las conversaciones de IA siguen en las 8 usadas.
      expect(await sql(e, `SELECT plantillas_enviadas, conversaciones_ia FROM uso_mensual WHERE periodo = '2035-03-01'`)).toEqual([
        { plantillas_enviadas: 1, conversaciones_ia: 8 },
      ]);

      await usar(e, 9);
      await avisarLimitesDelPlan(T, { pedir: meta.pedir });
      expect(deEscena(e, meta)).toHaveLength(1);
      expect((await sql<{ p: number }>(e, `SELECT plantillas_enviadas AS p FROM uso_mensual WHERE periodo = '2035-03-01'`))[0]!.p).toBe(1);
    });

    it('el mes es el del negocio: el de UTC no cuenta', async () => {
      const e = await escena();
      await conPlan(e, 10, 9, '2035-03-01');
      const meta = metaFalso();
      // 1 de abril a las 3:00 UTC todavía es 31 de marzo en Bogotá.
      await avisarLimitesDelPlan(new Date('2035-04-01T03:00:00Z'), { pedir: meta.pedir });
      expect(deEscena(e, meta)).toHaveLength(1);
      const abril = await escena();
      await conPlan(abril, 10, 9, '2035-03-01');
      await avisarLimitesDelPlan(new Date('2035-04-01T06:00:00Z'), { pedir: meta.pedir });
      expect(deEscena(abril, meta)).toHaveLength(0);
    });

    it('un fallo pasajero se reintenta en la vuelta siguiente; uno definitivo no', async () => {
      const pasajero = await escena();
      await conPlan(pasajero, 10, 8);
      await avisarLimitesDelPlan(T, { pedir: metaFalso(500).pedir });
      const meta = metaFalso();
      await avisarLimitesDelPlan(T, { pedir: meta.pedir });
      expect(deEscena(pasajero, meta)).toHaveLength(1);

      const definitivo = await escena();
      await conPlan(definitivo, 10, 8);
      await avisarLimitesDelPlan(T, { pedir: metaFalso(400, 132001).pedir });
      const otra = metaFalso();
      await avisarLimitesDelPlan(T, { pedir: otra.pedir });
      expect(deEscena(definitivo, otra)).toHaveLength(0);
    });

    it('sin plan con límite o sin teléfono de avisos, no avisa', async () => {
      const sinPlan = await escena();
      await sql(sinPlan, `INSERT INTO uso_mensual (negocio_id, periodo, conversaciones_ia) VALUES ($1, '2035-03-01', 1000)`, [sinPlan.n.negocioId]);
      const sinTelefono = await escena(null);
      await conPlan(sinTelefono, 10, 10);
      const meta = metaFalso();
      await avisarLimitesDelPlan(T, { pedir: meta.pedir });
      expect([...deEscena(sinPlan, meta), ...deEscena(sinTelefono, meta)]).toHaveLength(0);
    });
  });

  describe('rutas del panel', () => {
    let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
    let base: string;
    let e: Escena;
    let otro: Escena;
    let dueno: string;
    let duenoOtro: string;
    let empleado: string;
    const metaPanel = metaFalso();
    const superadmins: string[] = [];

    async function sesion(n: NegocioDePrueba | null, rol: string): Promise<string> {
      const email = `${randomUUID()}@prueba.com`;
      const consulta = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
      const params = [n?.negocioId ?? null, email, rol, await argon2.hash('clave-de-prueba-1')];
      const { rows } = n ? await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(consulta, params)) : await conSistema((tx) => tx.consultar<{ id: string }>(consulta, params));
      if (!n) superadmins.push(rows[0]!.id);
      return (await iniciarSesion(email, 'clave-de-prueba-1')).token;
    }

    const api = async (token: string, metodo: string, ruta: string, cuerpo?: unknown) => {
      const r = await fetch(base + ruta, {
        method: metodo,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      return { status: r.status, json: texto ? JSON.parse(texto) : null };
    };

    beforeAll(async () => {
      servidor = crearApp({ envio: { pedir: metaPanel.pedir } }).listen(0);
      await new Promise((r) => servidor.once('listening', r));
      base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      e = await escena();
      otro = await escena();
      dueno = await sesion(e.n, 'dueno');
      duenoOtro = await sesion(otro.n, 'dueno');
      empleado = await sesion(e.n, 'empleado');
    });
    afterAll(async () => {
      await new Promise((r) => servidor.close(r));
      await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
    });

    it('solo el dueño entra, y solo ve las conversaciones de su negocio', async () => {
      const c = await derivada(e);
      expect((await api(empleado, 'GET', '/conversaciones')).status).toBe(403);
      expect((await api(await sesion(null, 'superadmin'), 'GET', '/conversaciones')).status).toBe(403);
      expect((await api(duenoOtro, 'GET', `/conversaciones/${c.conversacionId}/mensajes`)).status).toBe(404);
      expect((await api(duenoOtro, 'POST', `/conversaciones/${c.conversacionId}/mensajes`, { texto: 'Hola' })).status).toBe(404);
      const lista = await api(duenoOtro, 'GET', '/conversaciones');
      expect(lista.json.conversaciones.map((x: { id: string }) => x.id)).not.toContain(c.conversacionId);
    });

    it('lista las derivadas con el cliente y el motivo', async () => {
      const c = await derivada(e, T, 'cliente_pidio_humano', 'Quiere hablar');
      await conversacion(e, { nombre: 'En bot', telefono: '573000000111' });
      const r = await api(dueno, 'GET', '/conversaciones?estado=humano');
      expect(r.status).toBe(200);
      const fila = r.json.conversaciones.find((x: { id: string }) => x.id === c.conversacionId);
      expect(fila).toMatchObject({ estado: 'humano', cliente: { nombre: 'Laura' }, ultimaDerivacion: { motivo: 'cliente_pidio_humano', detalle: 'Quiere hablar' } });
      expect(r.json.conversaciones.every((x: { estado: string }) => x.estado === 'humano')).toBe(true);
      expect((await api(dueno, 'GET', '/conversaciones?estado=otro')).status).toBe(400);
    });

    it('trae una conversación por id; la de otro negocio o un id inválido responden 404', async () => {
      const c = await derivada(e, T, 'sin_informacion', 'Pregunta por parqueadero');
      const r = await api(dueno, 'GET', `/conversaciones/${c.conversacionId}`);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({
        id: c.conversacionId,
        estado: 'humano',
        cliente: { nombre: 'Laura' },
        ultimaDerivacion: { motivo: 'sin_informacion', detalle: 'Pregunta por parqueadero' },
      });
      expect((await api(duenoOtro, 'GET', `/conversaciones/${c.conversacionId}`)).status).toBe(404);
      expect((await api(dueno, 'GET', '/conversaciones/no-es-un-id')).status).toBe(404);
      expect((await api(empleado, 'GET', `/conversaciones/${c.conversacionId}`)).status).toBe(403);
    });

    it('muestra los mensajes en orden, del más viejo al más nuevo', async () => {
      const c = await derivada(e);
      for (const [i, texto] of ['uno', 'dos', 'tres'].entries()) {
        await sql(e, `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, creado_en) VALUES ($1, $2, 'entrante', 'cliente', 'texto', $3, $4)`, [
          e.n.negocioId,
          c.conversacionId,
          texto,
          new Date(T.getTime() + i * 1000),
        ]);
      }
      const r = await api(dueno, 'GET', `/conversaciones/${c.conversacionId}/mensajes?limite=2`);
      expect(r.json.mensajes.map((m: { contenido: string }) => m.contenido)).toEqual(['dos', 'tres']);
    });

    it('responder toma la conversación, reinicia el modo humano y envía como persona del negocio', async () => {
      const c = await conversacion(e, { nombre: 'Ana', telefono: '573000000222' });
      // Con algo pendiente para la IA: al tomarla, la IA ya no lo atiende.
      await sql(e, 'UPDATE conversaciones SET ultimo_mensaje_cliente_en = now(), ia_pendiente_desde = now(), ia_pendiente_en = now() WHERE id = $1', [c.conversacionId]);
      const r = await api(dueno, 'POST', `/conversaciones/${c.conversacionId}/mensajes`, { texto: 'Hola Ana, soy Carlos' });
      expect(r.status).toBe(201);
      expect(r.json.estado).toBe('enviado');
      const [conv] = await sql<{ estado: string; humano_desde: Date; ia_pendiente_en: Date | null }>(e, 'SELECT estado, humano_desde, ia_pendiente_en FROM conversaciones WHERE id = $1', [c.conversacionId]);
      expect(conv).toMatchObject({ estado: 'humano', ia_pendiente_en: null });
      expect(Math.abs(conv!.humano_desde.getTime() - Date.now())).toBeLessThan(60_000);
      expect(await sql(e, `SELECT emisor, contenido FROM mensajes WHERE conversacion_id = $1 AND direccion = 'saliente'`, [c.conversacionId])).toEqual([{ emisor: 'humano', contenido: 'Hola Ana, soy Carlos' }]);
    });

    it('fuera de la ventana de 24 horas no deja enviar texto libre', async () => {
      const c = await conversacion(e, { nombre: 'Vieja', telefono: '573000000333' });
      await sql(e, `UPDATE conversaciones SET ultimo_mensaje_cliente_en = now() - interval '25 hours' WHERE id = $1`, [c.conversacionId]);
      expect((await api(dueno, 'POST', `/conversaciones/${c.conversacionId}/mensajes`, { texto: 'Hola' })).status).toBe(409);
    });

    it('rechaza un texto vacío, campos de más o una conversación que no existe', async () => {
      const c = await conversacion(e, { nombre: 'Beto', telefono: '573000000444' });
      await sql(e, 'UPDATE conversaciones SET ultimo_mensaje_cliente_en = now() WHERE id = $1', [c.conversacionId]);
      expect((await api(dueno, 'POST', `/conversaciones/${c.conversacionId}/mensajes`, { texto: '  ' })).status).toBe(400);
      expect((await api(dueno, 'POST', `/conversaciones/${c.conversacionId}/mensajes`, { texto: 'Hola', emisor: 'ia' })).status).toBe(400);
      expect((await api(dueno, 'POST', `/conversaciones/${randomUUID()}/mensajes`, { texto: 'Hola' })).status).toBe(404);
      expect((await api(dueno, 'POST', '/conversaciones/no-uuid/mensajes', { texto: 'Hola' })).status).toBe(404);
    });

    it('un negocio suspendido no puede responder', async () => {
      const s = await escena();
      const token = await sesion(s.n, 'dueno');
      const c = await conversacion(s, { nombre: 'Cami', telefono: '573000000555' });
      await sql(s, 'UPDATE conversaciones SET ultimo_mensaje_cliente_en = now() WHERE id = $1', [c.conversacionId]);
      await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'suspendido' WHERE id = $1`, [s.n.negocioId]));
      expect((await api(token, 'POST', `/conversaciones/${c.conversacionId}/mensajes`, { texto: 'Hola' })).status).toBe(403);
      expect((await sql<{ estado: string }>(s, 'SELECT estado FROM conversaciones WHERE id = $1', [c.conversacionId]))[0]!.estado).toBe('bot');
    });
  });
});
