import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { logger } from '../src/compartido/logger.js';
import { conNegocio } from '../src/db/contexto.js';
import { anonimizarCliente } from '../src/modulos/clientes/clientes.servicio.js';
import { enviarAvisoDeDatos, textoDelAviso, VERSION_AVISO } from '../src/modulos/whatsapp/whatsapp.aviso.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { procesarEvento } from '../src/modulos/whatsapp/whatsapp.servicio.js';
import type { AvisoPendiente } from '../src/modulos/whatsapp/whatsapp.tipos.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const SECRETO = 'secreto-solo-para-pruebas';
const T0 = new Date('2035-03-10T12:00:00Z');
const seg = (s: number) => new Date(T0.getTime() + s * 1000);
const segundosUnix = (fecha: Date) => String(Math.floor(fecha.getTime() / 1000));

describe('aviso de tratamiento de datos y consentimiento', () => {
  let a: NegocioDePrueba;
  let phoneNumberId: string;
  let telefonos = 0;

  const nuevoTelefono = () => `5733${String(++telefonos).padStart(8, '0')}`;

  function evento(mensajes: { telefono: string; cuerpo?: string; en: Date; id?: string }[]) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: phoneNumberId },
                messages: mensajes.map((m) => ({
                  id: m.id ?? `wamid.${randomUUID()}`,
                  from: m.telefono,
                  timestamp: segundosUnix(m.en),
                  type: 'text',
                  text: { body: m.cuerpo ?? 'Hola' },
                })),
              },
            },
          ],
        },
      ],
    };
  }

  /** Procesa un mensaje como si llegara un minuto después de escrito. */
  const recibir = (telefono: string, en: Date, extra: { cuerpo?: string; id?: string } = {}) =>
    procesarEvento(evento([{ telefono, en, ...extra }]), new Date(en.getTime() + 60_000));

  const metaAcepta = () =>
    vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

  const enviarAviso = (aviso: AvisoPendiente, pedir: typeof fetch, en: Date) =>
    enviarAvisoDeDatos(aviso, { pedir, reloj: () => en });

  const datosCliente = (telefono: string) =>
    conNegocio(a.negocioId, async (tx) =>
      (
        await tx.consultar<{
          id: string;
          aviso_datos_version: string | null;
          aviso_datos_enviado_en: Date | null;
          aviso_datos_pedido_en: Date | null;
        }>('SELECT id, aviso_datos_version, aviso_datos_enviado_en, aviso_datos_pedido_en FROM clientes WHERE telefono = $1', [telefono])
      ).rows[0]!,
    );

  const consentimientos = (clienteId: string) =>
    conNegocio(a.negocioId, async (tx) =>
      (
        await tx.consultar<{ version_politica: string; aceptado_en: Date; wa_message_id: string }>(
          'SELECT version_politica, aceptado_en, wa_message_id FROM consentimientos WHERE cliente_id = $1',
          [clienteId],
        )
      ).rows,
    );

  const salientes = (clienteId: string) =>
    conNegocio(a.negocioId, async (tx) =>
      (
        await tx.consultar<{ emisor: string; contenido: string; estado_entrega: string | null }>(
          `SELECT m.emisor, m.contenido, m.estado_entrega FROM mensajes m
             JOIN conversaciones c ON c.id = m.conversacion_id
            WHERE c.cliente_id = $1 AND m.direccion = 'saliente' ORDER BY m.creado_en, m.id`,
          [clienteId],
        )
      ).rows,
    );

  /** Primer mensaje y aviso confirmado por Meta a los 5 segundos. */
  async function clienteConAviso(): Promise<{ telefono: string; clienteId: string }> {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    expect(await enviarAviso(avisos[0]!, metaAcepta(), seg(5))).toBe('enviado');
    return { telefono, clienteId: avisos[0]!.clienteId };
  }

  beforeAll(async () => {
    a = await crearNegocio('Barbería El Corte');
    phoneNumberId = `${Date.now()}5`;
    await registrarCuenta(a.negocioId, {
      phoneNumberId,
      wabaId: '1',
      numeroVisible: '3000000000',
      token: 'EAAtoken-de-prueba-para-el-aviso',
    });
  });

  afterAll(() => limpiar());
  afterEach(() => vi.restoreAllMocks());

  it('el texto nombra al negocio, a Meta y a OpenAI, y explica cómo se acepta', () => {
    const texto = textoDelAviso('Barbería El Corte');
    for (const parte of ['Barbería El Corte', 'WhatsApp (Meta)', 'OpenAI', 'fuera de Colombia', 'borremos tus datos', 'Si sigues escribiendo']) {
      expect(texto).toContain(parte);
    }
    expect(VERSION_AVISO).toBe('2026-11-v1');
  });

  it('el primer mensaje pide el aviso; al enviarlo queda guardado y anotado, sin consentimiento', async () => {
    const telefono = nuevoTelefono();
    const { avisos, fallidos } = await recibir(telefono, seg(0));
    expect(fallidos).toBe(0);
    expect(avisos).toEqual([{ negocioId: a.negocioId, conversacionId: expect.any(String), clienteId: expect.any(String) }]);

    const pedir = metaAcepta();
    expect(await enviarAviso(avisos[0]!, pedir, seg(5))).toBe('enviado');
    const cuerpo = JSON.parse(String(pedir.mock.calls[0]![1]?.body));
    expect(cuerpo).toMatchObject({ to: telefono, text: { body: textoDelAviso('Barbería El Corte') } });

    const cliente = await datosCliente(telefono);
    expect(cliente).toMatchObject({ aviso_datos_version: VERSION_AVISO, aviso_datos_enviado_en: seg(5), aviso_datos_pedido_en: null });
    expect(await salientes(cliente.id)).toEqual([
      { emisor: 'sistema', contenido: textoDelAviso('Barbería El Corte'), estado_entrega: 'enviado' },
    ]);
    expect(await consentimientos(cliente.id)).toEqual([]);
  });

  it('volver a escribir después del aviso es la aceptación: se registra con ese mensaje', async () => {
    const { telefono, clienteId } = await clienteConAviso();
    const { avisos } = await recibir(telefono, seg(10), { id: 'wamid.acepta-1' + randomUUID() });
    expect(avisos).toEqual([]);
    const [consentimiento, ...otros] = await consentimientos(clienteId);
    expect(otros).toEqual([]);
    expect(consentimiento).toMatchObject({ version_politica: VERSION_AVISO, aceptado_en: seg(10) });
    expect(consentimiento!.wa_message_id).toMatch(/^wamid\.acepta-1/);
  });

  it('un mensaje escrito antes de que Meta confirmara el aviso no es aceptación ni pide otro aviso', async () => {
    const { telefono, clienteId } = await clienteConAviso();
    for (const en of [seg(3), seg(5)]) {
      expect((await recibir(telefono, en)).avisos).toEqual([]);
    }
    expect(await consentimientos(clienteId)).toEqual([]);
  });

  it('ya aceptado, los mensajes siguientes no piden aviso ni duplican el consentimiento', async () => {
    const { telefono, clienteId } = await clienteConAviso();
    await recibir(telefono, seg(10));
    for (const s of [20, 30]) expect((await recibir(telefono, seg(s))).avisos).toEqual([]);
    expect(await consentimientos(clienteId)).toHaveLength(1);
  });

  it('un reenvío de Meta del primer mensaje no pide el aviso otra vez', async () => {
    const telefono = nuevoTelefono();
    const id = `wamid.${randomUUID()}`;
    const { avisos } = await recibir(telefono, seg(0), { id });
    await enviarAviso(avisos[0]!, metaAcepta(), seg(5));
    expect((await recibir(telefono, seg(0), { id })).avisos).toEqual([]);
  });

  it('varios mensajes del mismo cliente en un evento piden un solo aviso', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await procesarEvento(
      evento([
        { telefono, en: seg(0), cuerpo: 'Hola' },
        { telefono, en: seg(1), cuerpo: 'Quiero una cita' },
      ]),
      seg(60),
    );
    expect(avisos).toHaveLength(1);
  });

  it('si Meta falla, libera la reserva y el siguiente mensaje lo vuelve a intentar', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    const falla = vi.fn<typeof fetch>(async () => new Response('{}', { status: 500 }));
    expect(await enviarAviso(avisos[0]!, falla, seg(5))).toBe('fallido');
    expect(await datosCliente(telefono)).toMatchObject({ aviso_datos_version: null, aviso_datos_enviado_en: null, aviso_datos_pedido_en: null });

    const otraVez = await recibir(telefono, seg(10));
    expect(otraVez.avisos).toHaveLength(1);
    expect(await enviarAviso(otraVez.avisos[0]!, metaAcepta(), seg(15))).toBe('enviado');
    expect(await consentimientos(otraVez.avisos[0]!.clienteId)).toEqual([]);
  });

  it('un error al enviar no se propaga: devuelve fallido y libera la reserva', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    const lanza = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    const sinClave = () => {
      throw new Error('sin clave');
    };
    await expect(enviarAvisoDeDatos(avisos[0]!, { pedir: lanza, clave: sinClave, reloj: () => seg(5) })).resolves.toBe('fallido');
    expect(lanza).not.toHaveBeenCalled();
    expect((await datosCliente(telefono)).aviso_datos_pedido_en).toBeNull();
  });

  it('dos envíos a la vez para el mismo cliente mandan un solo aviso', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    const pedir = metaAcepta();
    const resultados = await Promise.all([1, 2, 3].map(() => enviarAviso(avisos[0]!, pedir, seg(5))));
    expect(resultados.filter((r) => r === 'enviado')).toHaveLength(1);
    expect(resultados.filter((r) => r === 'omitido')).toHaveLength(2);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('una reserva vieja (proceso caído) vence a los 2 minutos; una reciente no', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    const fijarReserva = (en: Date) =>
      conNegocio(a.negocioId, (tx) => tx.consultar('UPDATE clientes SET aviso_datos_pedido_en = $2 WHERE telefono = $1', [telefono, en]));
    await fijarReserva(seg(-60));
    expect(await enviarAviso(avisos[0]!, metaAcepta(), seg(5))).toBe('omitido');
    await fijarReserva(seg(-115));
    expect(await enviarAviso(avisos[0]!, metaAcepta(), seg(5))).toBe('enviado');
  });

  it('ya enviado, no se vuelve a enviar aunque lo pidan otra vez', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    await enviarAviso(avisos[0]!, metaAcepta(), seg(5));
    const pedir = metaAcepta();
    expect(await enviarAviso(avisos[0]!, pedir, seg(500))).toBe('omitido');
    expect(pedir).not.toHaveBeenCalled();
  });

  it('una versión nueva del aviso se vuelve a enviar a quien aceptó la anterior', async () => {
    const { telefono, clienteId } = await clienteConAviso();
    await conNegocio(a.negocioId, async (tx) => {
      await tx.consultar(`UPDATE clientes SET aviso_datos_version = 'version-vieja' WHERE id = $1`, [clienteId]);
      await tx.consultar(`UPDATE consentimientos SET version_politica = 'version-vieja' WHERE cliente_id = $1`, [clienteId]);
    });
    await recibir(telefono, seg(10));
    const { avisos } = await recibir(telefono, seg(20));
    expect(avisos).toHaveLength(1);
    expect(await enviarAviso(avisos[0]!, metaAcepta(), seg(25))).toBe('enviado');
  });

  it('a un cliente anonimizado entretanto no se le envía', async () => {
    const telefono = nuevoTelefono();
    const { avisos } = await recibir(telefono, seg(0));
    await anonimizarCliente(a.negocioId, avisos[0]!.clienteId);
    const pedir = metaAcepta();
    expect(await enviarAviso(avisos[0]!, pedir, seg(5))).toBe('omitido');
    expect(pedir).not.toHaveBeenCalled();
  });

  it('el log no lleva el texto del aviso ni el teléfono', async () => {
    const telefono = nuevoTelefono();
    const lineas: unknown[] = [];
    for (const nivel of ['info', 'warn', 'error'] as const) {
      vi.spyOn(logger, nivel).mockImplementation(((...args: unknown[]) => void lineas.push(args)) as never);
    }
    const { avisos } = await recibir(telefono, seg(0));
    await enviarAviso(avisos[0]!, metaAcepta(), seg(5));
    const todo = JSON.stringify(lineas);
    expect(todo).toContain('Aviso de datos enviado');
    expect(todo).not.toContain(telefono);
    expect(todo).not.toContain('OpenAI');
  });

  it('por HTTP: el webhook responde 200 y después envía el aviso', async () => {
    const pedir = metaAcepta();
    const servidor = crearApp({ whatsapp: { appSecret: SECRETO, verifyToken: 'x', pedir } }).listen(0);
    await new Promise((r) => servidor.once('listening', r));
    try {
      const telefono = nuevoTelefono();
      // Un mensaje reciente: el envío usa la hora real para la ventana de 24 h.
      const cuerpo = JSON.stringify(evento([{ telefono, en: new Date(Date.now() - 5_000) }]));
      const r = await fetch(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/webhooks/whatsapp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}`,
        },
        body: cuerpo,
      });
      expect(r.status).toBe(200);
      await vi.waitFor(async () => expect((await datosCliente(telefono)).aviso_datos_version).toBe(VERSION_AVISO));
      expect(pedir).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise((r) => servidor.close(r));
    }
  });
});
