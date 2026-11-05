import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/compartido/logger.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { enviarAvisoDeDatos } from '../src/modulos/whatsapp/whatsapp.aviso.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { procesarEvento } from '../src/modulos/whatsapp/whatsapp.servicio.js';
import {
  ESPERAS_REINTENTO_MS,
  iniciarProcesador,
  procesarPendientes,
  TEXTO_DERIVACION_POR_ERROR,
  type Atender,
  type ConversacionPendiente,
} from '../src/procesador/procesador.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const T = new Date('2035-03-10T12:00:00Z');
const en = (s: number) => new Date(T.getTime() + s * 1000);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('procesador de conversaciones pendientes', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let cuentaA: { id: string; phoneNumberId: string };
  let cuentaB: { id: string };
  let telefonos = 0;

  const nuevoTelefono = () => `5734${String(++telefonos).padStart(8, '0')}`;

  interface Pendiente {
    conversacionId: string;
    clienteId: string;
    telefono: string;
  }

  /** Conversación de un cliente que ya aceptó, con mensajes sin responder entre `desde` y `hasta`. */
  async function pendiente(desde: Date | null, hasta: Date | null = desde, n = a, cuentaId = cuentaA.id): Promise<Pendiente> {
    const telefono = nuevoTelefono();
    return conNegocio(n.negocioId, async (tx) => {
      const cliente = await tx.consultar<{ id: string }>(
        `INSERT INTO clientes (negocio_id, telefono) VALUES ($1, $2) RETURNING id`,
        [n.negocioId, telefono],
      );
      const { rows } = await tx.consultar<{ id: string }>(
        `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en,
                                     ia_pendiente_desde, ia_pendiente_en)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [n.negocioId, cliente.rows[0]!.id, cuentaId, hasta ?? T, desde, hasta],
      );
      return { conversacionId: rows[0]!.id, clienteId: cliente.rows[0]!.id, telefono };
    });
  }

  const estado = (p: Pendiente, n = a) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<{
          estado: string;
          humano_desde: Date | null;
          ia_pendiente_desde: Date | null;
          ia_pendiente_en: Date | null;
          ia_procesando_hasta: Date | null;
          ia_intentos: number;
          ia_reintentar_en: Date | null;
        }>(
          `SELECT estado, humano_desde, ia_pendiente_desde, ia_pendiente_en, ia_procesando_hasta, ia_intentos, ia_reintentar_en
             FROM conversaciones WHERE id = $1`,
          [p.conversacionId],
        )
      ).rows[0]!,
    );

  const cambiar = (p: Pendiente, sql: string, ...params: unknown[]) =>
    conNegocio(a.negocioId, (tx) => tx.consultar(`UPDATE conversaciones SET ${sql} WHERE id = $1`, [p.conversacionId, ...params]));

  /** `atender` que anota a quién atendió; solo cuenta las conversaciones de esta prueba. */
  function registro(propias: Pendiente[], trabajo: (c: ConversacionPendiente) => Promise<void> = async () => {}) {
    const ids = new Set(propias.map((p) => p.conversacionId));
    const atendidas: string[] = [];
    const atender: Atender = async (c) => {
      if (!ids.has(c.conversacionId)) return;
      atendidas.push(c.conversacionId);
      await trabajo(c);
    };
    return { atender, atendidas };
  }

  const metaAcepta = () =>
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 }));

  beforeAll(async () => {
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    const phoneNumberId = `${Date.now()}6`;
    const cuenta = await registrarCuenta(a.negocioId, { phoneNumberId, wabaId: '1', numeroVisible: '3000000000', token: 'EAAtoken-de-prueba-procesador' });
    cuentaA = { id: cuenta.id, phoneNumberId };
    cuentaB = await registrarCuenta(b.negocioId, { phoneNumberId: `${Date.now()}7`, wabaId: '1', numeroVisible: '3000000001', token: 'EAAtoken-de-prueba-procesador' });
  });

  // Ninguna prueba debe dejar pendientes que atienda la siguiente.
  afterEach(async () => {
    vi.restoreAllMocks();
    await conSistema((tx) =>
      tx.consultar(
        `UPDATE conversaciones SET ia_pendiente_desde = NULL, ia_pendiente_en = NULL, ia_procesando_hasta = NULL,
                                   ia_intentos = 0, ia_reintentar_en = NULL
          WHERE negocio_id = ANY($1::uuid[])`,
        [[a.negocioId, b.negocioId]],
      ),
    );
    await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'prueba' WHERE id = $1`, [a.negocioId]));
  });

  afterAll(() => limpiar());

  describe('qué marca el webhook', () => {
    const evento = (telefono: string, momento: Date) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: cuentaA.phoneNumberId },
                messages: [{ id: `wamid.${randomUUID()}`, from: telefono, timestamp: String(Math.floor(momento.getTime() / 1000)), type: 'text', text: { body: 'Hola' } }],
              },
            },
          ],
        },
      ],
    });
    const conversacionDe = (telefono: string) =>
      conNegocio(a.negocioId, async (tx) =>
        (
          await tx.consultar<{ id: string; ia_pendiente_desde: Date | null; ia_pendiente_en: Date | null }>(
            `SELECT c.id, c.ia_pendiente_desde, c.ia_pendiente_en FROM conversaciones c JOIN clientes cl ON cl.id = c.cliente_id WHERE cl.telefono = $1`,
            [telefono],
          )
        ).rows[0]!,
      );

    it('antes de aceptar no queda pendiente; después, sí, con la hora de llegada', async () => {
      const telefono = nuevoTelefono();
      const { avisos } = await procesarEvento(evento(telefono, en(0)), en(1));
      expect(await conversacionDe(telefono)).toMatchObject({ ia_pendiente_desde: null, ia_pendiente_en: null });
      await enviarAvisoDeDatos(avisos[0]!, { pedir: metaAcepta(), reloj: () => en(5) });

      // Escrito a los 10 s, llega a los 12 s: cuenta la llegada.
      await procesarEvento(evento(telefono, en(10)), en(12));
      expect(await conversacionDe(telefono)).toMatchObject({ ia_pendiente_desde: en(12), ia_pendiente_en: en(12) });
      await procesarEvento(evento(telefono, en(14)), en(15));
      expect(await conversacionDe(telefono)).toMatchObject({ ia_pendiente_desde: en(12), ia_pendiente_en: en(15) });
    });

    it('en modo humano no queda pendiente', async () => {
      const telefono = nuevoTelefono();
      const { avisos } = await procesarEvento(evento(telefono, en(0)), en(1));
      await enviarAvisoDeDatos(avisos[0]!, { pedir: metaAcepta(), reloj: () => en(5) });
      const { id } = await conversacionDe(telefono);
      await conNegocio(a.negocioId, (tx) => tx.consultar(`UPDATE conversaciones SET estado = 'humano', humano_desde = $2 WHERE id = $1`, [id, en(6)]));
      await procesarEvento(evento(telefono, en(10)), en(12));
      expect(await conversacionDe(telefono)).toMatchObject({ ia_pendiente_en: null });
    });
  });

  describe('cuándo se atiende', () => {
    it('espera 5 s desde el último mensaje para juntar los seguidos', async () => {
      const p = await pendiente(en(0), en(0));
      const { atender, atendidas } = registro([p]);
      await procesarPendientes(en(4.9), { atender });
      expect(atendidas).toEqual([]);
      await procesarPendientes(en(5), { atender });
      expect(atendidas).toEqual([p.conversacionId]);
    });

    it('si el cliente no para de escribir, responde a los 30 s del primero', async () => {
      const p = await pendiente(en(0), en(28));
      const { atender, atendidas } = registro([p]);
      await procesarPendientes(en(29.9), { atender });
      expect(atendidas).toEqual([]);
      await procesarPendientes(en(30), { atender });
      expect(atendidas).toEqual([p.conversacionId]);
    });

    it('le pasa a atender el negocio, la conversación y el cliente', async () => {
      const p = await pendiente(en(0));
      const recibido: ConversacionPendiente[] = [];
      const { atender } = registro([p], async (c) => void recibido.push(c));
      await procesarPendientes(en(10), { atender });
      expect(recibido).toEqual([{ negocioId: a.negocioId, conversacionId: p.conversacionId, clienteId: p.clienteId }]);
    });

    it('atendida, ya no queda nada pendiente', async () => {
      const p = await pendiente(en(0));
      const { atender, atendidas } = registro([p]);
      await procesarPendientes(en(10), { atender });
      expect(await estado(p)).toMatchObject({ ia_pendiente_desde: null, ia_pendiente_en: null, ia_procesando_hasta: null, ia_intentos: 0 });
      await procesarPendientes(en(20), { atender });
      expect(atendidas).toHaveLength(1);
    });

    it('lo que llega mientras se atiende queda pendiente para la vuelta siguiente', async () => {
      const p = await pendiente(en(0));
      const { atender, atendidas } = registro([p], async () => {
        await cambiar(p, 'ia_pendiente_en = $2', en(12));
      });
      await procesarPendientes(en(10), { atender });
      expect(await estado(p)).toMatchObject({ ia_pendiente_desde: en(12), ia_pendiente_en: en(12), ia_procesando_hasta: null });
      await procesarPendientes(en(17), { atender });
      expect(atendidas).toEqual([p.conversacionId, p.conversacionId]);
    });

    it('no toma más que el límite por vuelta', async () => {
      const propias = await Promise.all([1, 2, 3].map(() => pendiente(en(0))));
      const { atender, atendidas } = registro(propias);
      // Las de otras pruebas ya están limpias: las únicas pendientes son estas tres.
      await procesarPendientes(en(10), { atender, limite: 2 });
      expect(atendidas).toHaveLength(2);
      await procesarPendientes(en(11), { atender, limite: 2 });
      expect(new Set(atendidas).size).toBe(3);
    });

    it('no atiende las de un negocio suspendido', async () => {
      const p = await pendiente(en(0));
      await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'suspendido' WHERE id = $1`, [a.negocioId]));
      const { atender, atendidas } = registro([p]);
      await procesarPendientes(en(10), { atender });
      expect(atendidas).toEqual([]);
    });

    it('atiende las de cualquier negocio, cada una con el suyo', async () => {
      const deA = await pendiente(en(0));
      const deB = await pendiente(en(0), en(0), b, cuentaB.id);
      const negocios: string[] = [];
      const { atender } = registro([deA, deB], async (c) => void negocios.push(c.negocioId));
      await procesarPendientes(en(10), { atender });
      expect(negocios.sort()).toEqual([a.negocioId, b.negocioId].sort());
    });
  });

  describe('una a la vez', () => {
    it('dos vueltas simultáneas no atienden la misma conversación', async () => {
      const p = await pendiente(en(0));
      const { atender, atendidas } = registro([p], async () => {
        await espera(200);
      });
      await Promise.all([procesarPendientes(en(10), { atender }), procesarPendientes(en(10), { atender }), procesarPendientes(en(10), { atender })]);
      expect(atendidas).toEqual([p.conversacionId]);
    });

    it('una conversación reservada no se toma; si la reserva venció (API caída), sí', async () => {
      const p = await pendiente(en(0));
      await cambiar(p, 'ia_procesando_hasta = $2', en(60));
      const { atender, atendidas } = registro([p]);
      await procesarPendientes(en(59), { atender });
      expect(atendidas).toEqual([]);
      await procesarPendientes(en(60), { atender });
      expect(atendidas).toEqual([p.conversacionId]);
    });

    it('la reserva dura 5 minutos', async () => {
      const p = await pendiente(en(0));
      let durante: Date | null = null;
      const { atender } = registro([p], async () => {
        durante = (await estado(p)).ia_procesando_hasta;
      });
      await procesarPendientes(en(10), { atender });
      expect(durante).toEqual(en(10 + 300));
    });
  });

  describe('fallos', () => {
    const falla = (propias: Pendiente[]) =>
      registro(propias, async () => {
        throw new Error('La IA no respondió');
      });

    it('un fallo suelta la reserva y reintenta a los 30 s, luego a 1 y 2 minutos', async () => {
      const p = await pendiente(en(0));
      const { atender, atendidas } = falla([p]);
      expect(await procesarPendientes(en(10), { atender })).toMatchObject({ reintentos: 1 });
      expect(await estado(p)).toMatchObject({ ia_intentos: 1, ia_reintentar_en: en(40), ia_procesando_hasta: null, ia_pendiente_en: en(0) });

      await procesarPendientes(en(39), { atender });
      expect(atendidas).toHaveLength(1);
      await procesarPendientes(en(40), { atender });
      expect(await estado(p)).toMatchObject({ ia_intentos: 2, ia_reintentar_en: en(100) });
      await procesarPendientes(en(100), { atender });
      expect(await estado(p)).toMatchObject({ ia_intentos: 3, ia_reintentar_en: en(220) });
      expect(ESPERAS_REINTENTO_MS).toEqual([30_000, 60_000, 120_000]);
    });

    it('un éxito después de un fallo reinicia los intentos', async () => {
      const p = await pendiente(en(0));
      let fallar = true;
      const { atender } = registro([p], async () => {
        if (fallar) throw new Error('Falla una vez');
      });
      await procesarPendientes(en(10), { atender });
      fallar = false;
      await procesarPendientes(en(40), { atender });
      expect(await estado(p)).toMatchObject({ ia_intentos: 0, ia_reintentar_en: null, ia_pendiente_en: null });
    });

    it('agotados los 3 reintentos, deriva a una persona con motivo error y avisa al cliente', async () => {
      const p = await pendiente(en(0));
      const { atender, atendidas } = falla([p]);
      const pedir = metaAcepta();
      for (const s of [10, 40, 100]) await procesarPendientes(en(s), { atender, envio: { pedir } });
      expect(pedir).not.toHaveBeenCalled();
      expect(await procesarPendientes(en(220), { atender, envio: { pedir } })).toMatchObject({ derivadas: 1 });
      expect(atendidas).toHaveLength(4);

      expect(await estado(p)).toMatchObject({
        estado: 'humano',
        humano_desde: en(220),
        ia_pendiente_en: null,
        ia_intentos: 0,
        ia_reintentar_en: null,
        ia_procesando_hasta: null,
      });
      const derivaciones = await conNegocio(a.negocioId, async (tx) =>
        (await tx.consultar<{ motivo: string }>('SELECT motivo FROM derivaciones WHERE conversacion_id = $1', [p.conversacionId])).rows,
      );
      expect(derivaciones).toEqual([{ motivo: 'error' }]);
      expect(pedir).toHaveBeenCalledTimes(1);
      const cuerpo = JSON.parse(String(pedir.mock.calls[0]![1]?.body));
      expect(cuerpo).toMatchObject({ to: p.telefono, text: { body: TEXTO_DERIVACION_POR_ERROR } });

      // Derivada, la IA calla: no se vuelve a atender.
      await procesarPendientes(en(400), { atender });
      expect(atendidas).toHaveLength(4);
    });

    it('si el aviso de la derivación no sale, igual queda derivada', async () => {
      const p = await pendiente(en(0));
      await cambiar(p, 'ia_intentos = 3');
      const { atender } = falla([p]);
      const caida = vi.fn<typeof fetch>(async () => new Response('{}', { status: 500 }));
      expect(await procesarPendientes(en(10), { atender, envio: { pedir: caida } })).toMatchObject({ derivadas: 1 });
      expect((await estado(p)).estado).toBe('humano');
    });

    it('si el aviso de la derivación ni siquiera se puede intentar (error al enviar), igual queda derivada', async () => {
      const p = await pendiente(en(0));
      await cambiar(p, 'ia_intentos = 3');
      const { atender } = falla([p]);
      const sinClave = () => {
        throw new Error('sin clave');
      };
      const pedir = metaAcepta();
      expect(await procesarPendientes(en(10), { atender, envio: { pedir, clave: sinClave } })).toMatchObject({ derivadas: 1 });
      expect(pedir).not.toHaveBeenCalled();
      expect((await estado(p)).estado).toBe('humano');
    });

    it('el log del fallo no lleva el texto del error del cliente ni su teléfono', async () => {
      const p = await pendiente(en(0));
      await cambiar(p, 'ia_intentos = 3');
      const lineas: unknown[] = [];
      for (const nivel of ['info', 'warn', 'error'] as const) {
        vi.spyOn(logger, nivel).mockImplementation(((...args: unknown[]) => void lineas.push(args)) as never);
      }
      const { atender } = falla([p]);
      await procesarPendientes(en(10), { atender, envio: { pedir: metaAcepta() } });
      const todo = JSON.stringify(lineas);
      expect(todo).toContain('Conversación derivada a una persona por fallos seguidos');
      expect(todo).not.toContain(p.telefono);
    });
  });

  describe('lo que ya no se responde', () => {
    it('descarta las pendientes de una conversación en modo humano', async () => {
      const p = await pendiente(en(0));
      await cambiar(p, `estado = 'humano', humano_desde = $2`, en(1));
      const { atender, atendidas } = registro([p]);
      expect((await procesarPendientes(en(10), { atender })).descartadas).toBeGreaterThanOrEqual(1);
      expect(atendidas).toEqual([]);
      expect(await estado(p)).toMatchObject({ ia_pendiente_en: null, ia_pendiente_desde: null });
    });

    it('descarta lo que lleva 24 horas sin responder: WhatsApp ya no admite respuesta libre', async () => {
      const viejo = await pendiente(en(-86_400));
      const casi = await pendiente(en(-86_399));
      const { atender, atendidas } = registro([viejo, casi]);
      await procesarPendientes(en(0), { atender });
      expect(atendidas).toEqual([casi.conversacionId]);
      expect(await estado(viejo)).toMatchObject({ ia_pendiente_en: null });
    });

    it('no descarta una conversación reservada', async () => {
      const p = await pendiente(en(0));
      await cambiar(p, `estado = 'humano', humano_desde = $2, ia_procesando_hasta = $3`, en(1), en(100));
      await procesarPendientes(en(10), { atender: async () => {} });
      expect(await estado(p)).toMatchObject({ ia_pendiente_en: en(0) });
    });
  });

  describe('iniciarProcesador', () => {
    it('detener a mitad de una vuelta espera a que termine y no programa otra', async () => {
      const hace = new Date(Date.now() - 60_000);
      const p = await pendiente(hace);
      let empezo = false;
      const { atender, atendidas } = registro([p], async () => {
        empezo = true;
        await espera(150);
      });
      const procesador = iniciarProcesador({ atender, cadaMs: 10 });
      await vi.waitFor(() => expect(empezo).toBe(true));
      await procesador.detener();
      expect(await estado(p)).toMatchObject({ ia_pendiente_en: null });
      await cambiar(p, 'ia_pendiente_desde = $2, ia_pendiente_en = $2', hace);
      await espera(100);
      expect(atendidas).toHaveLength(1);
    });

    it('una vuelta que falla en la base no detiene las siguientes', async () => {
      const hace = new Date(Date.now() - 60_000);
      const p = await pendiente(hace);
      const { atender, atendidas } = registro([p]);
      let vueltas = 0;
      // La primera vuelta pide una espera que PostgreSQL rechaza (NaN); las demás, una normal.
      const tiempos = {
        get esperaMs() {
          vueltas += 1;
          return vueltas === 1 ? Number.NaN : 5_000;
        },
        esperaMaximaMs: 30_000,
        reservaMs: 300_000,
      };
      const errores = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
      const procesador = iniciarProcesador({ atender, cadaMs: 10, tiempos });
      await vi.waitFor(() => expect(atendidas).toEqual([p.conversacionId]));
      await procesador.detener();
      expect(vueltas).toBeGreaterThan(1);
      expect(JSON.stringify(errores.mock.calls)).toContain('Falló una vuelta del procesador de conversaciones');
    });

    it('corre vueltas seguidas y se detiene', async () => {
      // Pendiente hace un minuto según la hora real, que es la que usa el procesador.
      const hace = new Date(Date.now() - 60_000);
      const p = await pendiente(hace);
      const { atender, atendidas } = registro([p]);
      const procesador = iniciarProcesador({ atender, cadaMs: 10 });
      await vi.waitFor(() => expect(atendidas).toEqual([p.conversacionId]));
      await procesador.detener();
      await cambiar(p, 'ia_pendiente_desde = $2, ia_pendiente_en = $2', hace);
      await espera(50);
      expect(atendidas).toHaveLength(1);
    });

    it('un fallo al atender no detiene el procesador', async () => {
      const hace = new Date(Date.now() - 60_000);
      const p = await pendiente(hace);
      let vueltas = 0;
      const atender: Atender = async (c) => {
        if (c.conversacionId !== p.conversacionId) return;
        vueltas += 1;
        if (vueltas === 1) throw new Error('falla');
      };
      const procesador = iniciarProcesador({ atender, cadaMs: 10 });
      await vi.waitFor(() => expect(vueltas).toBe(1));
      await cambiar(p, 'ia_reintentar_en = NULL');
      await vi.waitFor(() => expect(vueltas).toBe(2));
      await procesador.detener();
    });
  });
});
