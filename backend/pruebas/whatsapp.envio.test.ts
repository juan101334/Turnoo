import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cifrar } from '../src/compartido/cifrado.js';
import { Conflicto, DatosInvalidos, NoConfigurado, NoEncontrado, Prohibido } from '../src/compartido/errores.js';
import { logger } from '../src/compartido/logger.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { anonimizarCliente } from '../src/modulos/clientes/clientes.servicio.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { enviarMensaje, MAX_TEXTO } from '../src/modulos/whatsapp/whatsapp.envio.js';
import { enviarPlantillaAMeta, URL_GRAPH } from '../src/modulos/whatsapp/whatsapp.meta.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const AHORA = new Date('2035-03-10T12:00:00Z');
const HORA_MS = 3_600_000;
const TOKEN_META = 'EAAtoken-de-prueba-que-nunca-sale';

describe('envío de mensajes por WhatsApp', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let cuentaA: { id: string; phoneNumberId: string };
  let telefonos = 0;

  interface Conversacion {
    id: string;
    telefono: string;
    clienteId: string;
  }

  /** Conversación de A cuyo último mensaje del cliente fue hace `horas`. */
  async function conversacion(horas: number | null = 1, n = a, cuentaId = cuentaA.id): Promise<Conversacion> {
    const telefono = `5732${String(++telefonos).padStart(8, '0')}`;
    return conNegocio(n.negocioId, async (tx) => {
      const cliente = await tx.consultar<{ id: string }>(
        `INSERT INTO clientes (negocio_id, nombre, telefono) VALUES ($1, 'Cliente', $2) RETURNING id`,
        [n.negocioId, telefono],
      );
      const clienteId = cliente.rows[0]!.id;
      const { rows } = await tx.consultar<{ id: string }>(
        `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en, ultimo_mensaje_en)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [n.negocioId, clienteId, cuentaId, horas === null ? null : new Date(AHORA.getTime() - horas * HORA_MS)],
      );
      return { id: rows[0]!.id, telefono, clienteId };
    });
  }

  const respuestaMeta = (estado: number, cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } });

  const metaAcepta = (id = `wamid.${randomUUID()}`) =>
    vi.fn<typeof fetch>(async () => respuestaMeta(200, { messaging_product: 'whatsapp', messages: [{ id }] }));

  const mensajesDe = (c: Conversacion, n = a) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<Record<string, unknown>>(
          'SELECT * FROM mensajes WHERE conversacion_id = $1 ORDER BY creado_en, id',
          [c.id],
        )
      ).rows,
    );

  const datosConversacion = (c: Conversacion) =>
    conNegocio(a.negocioId, async (tx) =>
      (
        await tx.consultar<{ ultimo_mensaje_en: Date; ultimo_mensaje_cliente_en: Date | null }>(
          'SELECT ultimo_mensaje_en, ultimo_mensaje_cliente_en FROM conversaciones WHERE id = $1',
          [c.id],
        )
      ).rows[0]!,
    );

  const enviar = (c: Conversacion, pedir: typeof fetch, texto = 'Hola, ¿en qué te ayudo?', n = a) =>
    enviarMensaje({ negocioId: n.negocioId, conversacionId: c.id, texto, emisor: 'ia' }, AHORA, { pedir });

  beforeAll(async () => {
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    const phoneNumberId = String(Date.now()) + String(Math.floor(Math.random() * 1000));
    const cuenta = await registrarCuenta(a.negocioId, {
      phoneNumberId,
      wabaId: '1234567890',
      numeroVisible: '3000000000',
      token: TOKEN_META,
    });
    cuentaA = { id: cuenta.id, phoneNumberId };
  });

  afterAll(() => limpiar());
  afterEach(async () => {
    vi.restoreAllMocks();
    await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'prueba' WHERE id = $1`, [a.negocioId]));
  });

  it('envía a Meta el texto con el token descifrado y lo guarda como enviado', async () => {
    const c = await conversacion();
    const pedir = metaAcepta('wamid.prueba-1');
    const resultado = await enviar(c, pedir, '  Hola ☕  ');

    expect(resultado).toMatchObject({ estado: 'enviado', waMessageId: 'wamid.prueba-1' });
    expect(pedir).toHaveBeenCalledTimes(1);
    const [url, opciones] = pedir.mock.calls[0]!;
    expect(url).toBe(`${URL_GRAPH}/${cuentaA.phoneNumberId}/messages`);
    expect(opciones?.method).toBe('POST');
    expect((opciones?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN_META}`);
    expect(JSON.parse(String(opciones?.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: c.telefono,
      type: 'text',
      text: { body: 'Hola ☕', preview_url: false },
    });

    const [mensaje] = await mensajesDe(c);
    expect(mensaje).toMatchObject({
      id: (resultado as { mensajeId: string }).mensajeId,
      direccion: 'saliente',
      emisor: 'ia',
      tipo: 'texto',
      contenido: 'Hola ☕',
      wa_message_id: 'wamid.prueba-1',
      estado_entrega: 'enviado',
      error: null,
    });
    expect(mensaje!.creado_en).toEqual(AHORA);
  });

  describe('destinatario', () => {
    /** Cambia cómo se conoce al cliente de la conversación: teléfono, BSUID o ambos. */
    const fijarIdentidad = (c: Conversacion, telefono: string | null, waUserId: string | null) =>
      conNegocio(a.negocioId, (tx) =>
        tx.consultar('UPDATE clientes SET telefono = $2, wa_user_id = $3 WHERE id = $1', [c.clienteId, telefono, waUserId]),
      );
    const cuerpoEnviado = (pedir: ReturnType<typeof metaAcepta>) => JSON.parse(String(pedir.mock.calls[0]![1]?.body));

    it('con solo BSUID envía a `recipient` y sin `to`', async () => {
      const c = await conversacion();
      await fijarIdentidad(c, null, 'CO.88880000000001');
      const pedir = metaAcepta();
      expect((await enviar(c, pedir)).estado).toBe('enviado');
      const cuerpo = cuerpoEnviado(pedir);
      expect(cuerpo.recipient).toBe('CO.88880000000001');
      expect(cuerpo).not.toHaveProperty('to');
    });

    it('con teléfono y BSUID envía solo `to`, que es lo que Meta usa', async () => {
      const c = await conversacion();
      await fijarIdentidad(c, c.telefono, 'CO.88880000000002');
      const pedir = metaAcepta();
      await enviar(c, pedir);
      const cuerpo = cuerpoEnviado(pedir);
      expect(cuerpo.to).toBe(c.telefono);
      expect(cuerpo).not.toHaveProperty('recipient');
    });

    it('el log no lleva el BSUID', async () => {
      const c = await conversacion();
      await fijarIdentidad(c, null, 'CO.88880000000003');
      const lineas: unknown[] = [];
      for (const nivel of ['info', 'warn', 'error'] as const) {
        vi.spyOn(logger, nivel).mockImplementation(((...args: unknown[]) => void lineas.push(args)) as never);
      }
      await enviar(c, metaAcepta());
      expect(JSON.stringify(lineas)).not.toContain('CO.88880000000003');
    });
  });

  it('actualiza el último mensaje de la conversación, pero no el del cliente (la ventana de 24 h)', async () => {
    const c = await conversacion(2);
    const antes = await datosConversacion(c);
    await enviar(c, metaAcepta());
    const despues = await datosConversacion(c);
    expect(despues.ultimo_mensaje_en).toEqual(AHORA);
    expect(despues.ultimo_mensaje_cliente_en).toEqual(antes.ultimo_mensaje_cliente_en);
  });

  it('guarda el emisor indicado', async () => {
    const c = await conversacion();
    await enviarMensaje({ negocioId: a.negocioId, conversacionId: c.id, texto: 'Aviso', emisor: 'sistema' }, AHORA, {
      pedir: metaAcepta(),
    });
    expect((await mensajesDe(c))[0]!.emisor).toBe('sistema');
  });

  it.each([
    [null, 'el cliente nunca escribió'],
    [24, 'justo 24 horas'],
    [30, 'más de 24 horas'],
  ])('fuera de la ventana de 24 h (%s: %s) rechaza sin llamar a Meta ni guardar', async (horas, _caso) => {
    const c = await conversacion(horas);
    const pedir = metaAcepta();
    await expect(enviar(c, pedir)).rejects.toThrow(Conflicto);
    expect(pedir).not.toHaveBeenCalled();
    expect(await mensajesDe(c)).toEqual([]);
  });

  it('dentro de la ventana, casi al límite, sí envía', async () => {
    const c = await conversacion(23.9);
    expect((await enviar(c, metaAcepta())).estado).toBe('enviado');
  });

  it('rechaza un texto vacío o demasiado largo sin llamar a Meta', async () => {
    const c = await conversacion();
    const pedir = metaAcepta();
    await expect(enviar(c, pedir, '   \u0000 ')).rejects.toThrow(DatosInvalidos);
    await expect(enviar(c, pedir, 'x'.repeat(MAX_TEXTO + 1))).rejects.toThrow(DatosInvalidos);
    expect((await enviar(c, pedir, 'x'.repeat(MAX_TEXTO))).estado).toBe('enviado');
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('no envía a un cliente anonimizado', async () => {
    const c = await conversacion();
    await anonimizarCliente(a.negocioId, c.clienteId);
    // Anonimizar borra sus conversaciones; se crea otra para probar que tampoco se le escribe.
    const nueva = await conNegocio(a.negocioId, async (tx) =>
      (
        await tx.consultar<{ id: string }>(
          `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [a.negocioId, c.clienteId, cuentaA.id, AHORA],
        )
      ).rows[0]!.id,
    );
    const pedir = metaAcepta();
    await expect(enviar({ ...c, id: nueva }, pedir)).rejects.toThrow(Conflicto);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('no envía si el negocio está suspendido', async () => {
    const c = await conversacion();
    await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'suspendido' WHERE id = $1`, [a.negocioId]));
    const pedir = metaAcepta();
    await expect(enviar(c, pedir)).rejects.toThrow(Prohibido);
    expect(pedir).not.toHaveBeenCalled();
    expect(await mensajesDe(c)).toEqual([]);
  });

  it('no envía si la cuenta de WhatsApp está desactivada', async () => {
    const otra = await registrarCuenta(a.negocioId, {
      phoneNumberId: `${Date.now()}9`,
      wabaId: '1',
      numeroVisible: '3000000001',
      token: TOKEN_META,
    });
    await conNegocio(a.negocioId, (tx) => tx.consultar('UPDATE whatsapp_cuentas SET activa = false WHERE id = $1', [otra.id]));
    const c = await conversacion(1, a, otra.id);
    const pedir = metaAcepta();
    await expect(enviar(c, pedir)).rejects.toThrow(Conflicto);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('una conversación de otro negocio no existe para este', async () => {
    const cuentaB = await registrarCuenta(b.negocioId, {
      phoneNumberId: `${Date.now()}8`,
      wabaId: '1',
      numeroVisible: '3000000002',
      token: TOKEN_META,
    });
    const deB = await conversacion(1, b, cuentaB.id);
    const pedir = metaAcepta();
    await expect(enviar(deB, pedir, 'Hola', a)).rejects.toThrow(NoEncontrado);
    await expect(enviar({ ...deB, id: 'no-es-uuid' }, pedir)).rejects.toThrow(NoEncontrado);
    expect(pedir).not.toHaveBeenCalled();
    expect(await mensajesDe(deB, b)).toEqual([]);
  });

  it('un token que no se puede descifrar se rechaza sin llamar a Meta', async () => {
    const rota = await registrarCuenta(a.negocioId, {
      phoneNumberId: `${Date.now()}7`,
      wabaId: '1',
      numeroVisible: '3000000003',
      token: TOKEN_META,
    });
    const c = await conversacion(1, a, rota.id);
    const pedir = metaAcepta();
    for (const valor of ['sin-uso-por-ahora', cifrar(TOKEN_META, Buffer.alloc(32, 9))]) {
      await conNegocio(a.negocioId, (tx) =>
        tx.consultar('UPDATE whatsapp_cuentas SET token_acceso_cifrado = $2 WHERE id = $1', [rota.id, valor]),
      );
      await expect(enviar(c, pedir)).rejects.toThrow(Conflicto);
    }
    expect(pedir).not.toHaveBeenCalled();
    expect(await mensajesDe(c)).toEqual([]);
  });

  it('sin clave configurada responde que falta configurar, sin guardar', async () => {
    const c = await conversacion();
    const pedir = metaAcepta();
    const sinClave = () => {
      throw new NoConfigurado('Falta CLAVE_CIFRADO_TOKENS');
    };
    await expect(
      enviarMensaje({ negocioId: a.negocioId, conversacionId: c.id, texto: 'Hola', emisor: 'ia' }, AHORA, { pedir, clave: sinClave }),
    ).rejects.toThrow(NoConfigurado);
    expect(pedir).not.toHaveBeenCalled();
    expect(await mensajesDe(c)).toEqual([]);
  });

  describe('cuando Meta falla', () => {
    it.each([
      [400, { error: { code: 131030, message: 'Recipient phone number 573200000000 not in allowed list' } }, false, 'Meta respondió 400 (código 131030)'],
      [401, { error: { code: 190 } }, false, 'Meta respondió 401 (código 190)'],
      [429, { error: { code: 130429 } }, true, 'Meta respondió 429 (código 130429)'],
      [500, 'no es json', true, 'Meta respondió 500'],
      [503, null, true, 'Meta respondió 503'],
      [200, { messages: [] }, false, 'Meta respondió sin id de mensaje'],
    ])('HTTP %i: queda fallido, reintentable=%s, con solo el código', async (estado, cuerpo, reintentable, detalle) => {
      const c = await conversacion();
      const pedir = vi.fn<typeof fetch>(async () =>
        typeof cuerpo === 'string' ? new Response(cuerpo, { status: estado }) : respuestaMeta(estado, cuerpo),
      );
      const resultado = await enviar(c, pedir);
      expect(resultado).toEqual({ estado: 'fallido', mensajeId: expect.any(String), reintentable });
      const [mensaje] = await mensajesDe(c);
      expect(mensaje).toMatchObject({ estado_entrega: 'fallido', error: detalle, wa_message_id: null });
      // El mensaje de Meta puede repetir el teléfono: no se guarda.
      expect(String(mensaje!.error)).not.toContain('5732');
    });

    /** Como lo lanza el fetch de Node: TypeError('fetch failed') con el código de red en `cause`. */
    const falloDeRed = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('red'), { code }) });

    it('tiempo agotado: queda fallido y reintentable, sin reintentar el envío (Meta pudo recibirlo)', async () => {
      const c = await conversacion();
      const pedir = vi.fn<typeof fetch>(async () => {
        throw new DOMException('Se agotó el tiempo', 'TimeoutError');
      });
      expect(await enviar(c, pedir)).toMatchObject({ estado: 'fallido', reintentable: true });
      expect(pedir).toHaveBeenCalledTimes(1);
      expect((await mensajesDe(c))[0]).toMatchObject({ estado_entrega: 'fallido', error: 'Sin respuesta de Meta (tiempo agotado)' });
    });

    it.each(['ECONNRESET', 'UND_ERR_SOCKET', 'ECONNREFUSED'])(
      'conexión caída (%s): reintenta el envío una vez, enseguida, y queda enviado',
      async (codigo) => {
        const c = await conversacion();
        const acepta = metaAcepta();
        const pedir = vi.fn<typeof fetch>(async (...args) => {
          if (pedir.mock.calls.length === 1) throw falloDeRed(codigo);
          return acepta(...args);
        });
        expect(await enviar(c, pedir)).toMatchObject({ estado: 'enviado' });
        expect(pedir).toHaveBeenCalledTimes(2);
        // El mismo mensaje, enviado una sola vez a la base: no hay un segundo registro.
        expect(await mensajesDe(c)).toHaveLength(1);
        expect((await mensajesDe(c))[0]).toMatchObject({ estado_entrega: 'enviado' });
      },
    );

    it('si la conexión vuelve a fallar, no insiste: queda fallido con la causa', async () => {
      const c = await conversacion();
      const pedir = vi.fn<typeof fetch>(async () => {
        throw falloDeRed('ECONNRESET');
      });
      expect(await enviar(c, pedir)).toMatchObject({ estado: 'fallido', reintentable: true });
      expect(pedir).toHaveBeenCalledTimes(2);
      expect((await mensajesDe(c))[0]).toMatchObject({ error: 'Sin respuesta de Meta (ECONNRESET)' });
    });

    it('un fallo de red sin código conocido no se reintenta', async () => {
      const c = await conversacion();
      const pedir = vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed');
      });
      expect(await enviar(c, pedir)).toMatchObject({ estado: 'fallido', reintentable: true });
      expect(pedir).toHaveBeenCalledTimes(1);
      expect((await mensajesDe(c))[0]).toMatchObject({ error: 'Sin respuesta de Meta (desconocida)' });
    });

    it('las plantillas también reintentan una vez si la conexión cayó', async () => {
      const pedir = vi.fn<typeof fetch>(async () => {
        if (pedir.mock.calls.length === 1) throw falloDeRed('UND_ERR_SOCKET');
        return respuestaMeta(200, { messages: [{ id: 'wamid.plantilla' }] });
      });
      const plantilla = { nombre: 'turnoo_derivacion', idioma: 'es_CO', parametros: { cliente: 'Laura' } };
      expect(await enviarPlantillaAMeta({ phoneNumberId: '1', token: 't' }, '573000000000', plantilla, pedir)).toEqual({ ok: true, waMessageId: 'wamid.plantilla' });
      expect(pedir).toHaveBeenCalledTimes(2);
    });

    it('limita la espera a Meta con una señal de tiempo', async () => {
      const c = await conversacion();
      const pedir = metaAcepta();
      await enviar(c, pedir);
      expect(pedir.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    });
  });

  it('el log no lleva teléfono, texto ni token', async () => {
    const c = await conversacion();
    const lineas: unknown[] = [];
    for (const nivel of ['info', 'warn', 'error'] as const) {
      vi.spyOn(logger, nivel).mockImplementation(((...args: unknown[]) => void lineas.push(args)) as never);
    }
    await enviar(c, metaAcepta(), 'Texto privado del cliente');
    await enviar(c, vi.fn<typeof fetch>(async () => respuestaMeta(400, { error: { code: 1, message: c.telefono } })), 'Texto privado del cliente');
    const todo = JSON.stringify(lineas);
    expect(lineas.length).toBe(2);
    expect(todo).not.toContain(c.telefono);
    expect(todo).not.toContain('Texto privado');
    expect(todo).not.toContain(TOKEN_META);
  });
});
