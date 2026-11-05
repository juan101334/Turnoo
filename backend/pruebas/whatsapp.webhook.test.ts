import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { logger } from '../src/compartido/logger.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { anonimizarCliente } from '../src/modulos/clientes/clientes.servicio.js';
import { firmaValida } from '../src/modulos/whatsapp/whatsapp.firma.js';
import * as repositorio from '../src/modulos/whatsapp/whatsapp.repositorio.js';
import { procesarEvento } from '../src/modulos/whatsapp/whatsapp.servicio.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

const SECRETO = 'secreto-solo-para-pruebas';
const TOKEN = 'token-solo-para-pruebas';
const AHORA = new Date('2035-03-10T12:00:00Z');
const segundos = (fecha: Date) => String(Math.floor(fecha.getTime() / 1000));
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('webhook de WhatsApp', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let cuentaA: Cuenta;
  let cuentaB: Cuenta;
  let telefonos = 0;

  interface Cuenta {
    id: string;
    phoneNumberId: string;
  }

  async function crearCuenta(n: NegocioDePrueba): Promise<Cuenta> {
    const phoneNumberId = randomUUID();
    const { rows } = await conNegocio(n.negocioId, (tx) =>
      tx.consultar<{ id: string }>(
        `INSERT INTO whatsapp_cuentas (negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
         VALUES ($1, $2, 'waba', '573000000000', 'sin-uso-en-pruebas') RETURNING id`,
        [n.negocioId, phoneNumberId],
      ),
    );
    return { id: rows[0]!.id, phoneNumberId };
  }

  const nuevoTelefono = () => `5731${String(++telefonos).padStart(8, '0')}`;

  function mensajeDeTexto(from: string, cuerpo = 'Hola', extra: object = {}) {
    return { id: `wamid.${randomUUID()}`, from, timestamp: segundos(AHORA), type: 'text', text: { body: cuerpo }, ...extra };
  }

  function evento(cuenta: Cuenta, mensajes: unknown[], contactos?: unknown[]) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '573000000000', phone_number_id: cuenta.phoneNumberId },
                ...(contactos && { contacts: contactos }),
                messages: mensajes,
              },
            },
          ],
        },
      ],
    };
  }

  const firmar = (cuerpo: string | Buffer, secreto = SECRETO) =>
    `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

  const enviar = (cuerpo: string | Buffer, firma: string | null, url = base) =>
    fetch(`${url}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(firma ? { 'x-hub-signature-256': firma } : {}) },
      body: typeof cuerpo === 'string' ? cuerpo : new Uint8Array(cuerpo),
    });

  const enviarEvento = (datos: unknown) => {
    const cuerpo = JSON.stringify(datos);
    return enviar(cuerpo, firmar(cuerpo));
  };

  const mensajesDe = (n: NegocioDePrueba, telefono: string) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<Record<string, unknown>>(
          `SELECT m.* FROM mensajes m
             JOIN conversaciones c ON c.id = m.conversacion_id
             JOIN clientes cl ON cl.id = c.cliente_id
            WHERE cl.telefono = $1 ORDER BY m.creado_en, m.id`,
          [telefono],
        )
      ).rows,
    );

  const clienteDe = (n: NegocioDePrueba, telefono: string) =>
    conNegocio(n.negocioId, async (tx) =>
      (await tx.consultar<{ id: string; nombre: string | null }>('SELECT id, nombre FROM clientes WHERE telefono = $1', [telefono])).rows[0],
    );

  const conversacionDe = (n: NegocioDePrueba, telefono: string) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<Record<string, Date | string | null>>(
          `SELECT c.* FROM conversaciones c JOIN clientes cl ON cl.id = c.cliente_id WHERE cl.telefono = $1`,
          [telefono],
        )
      ).rows[0],
    );

  beforeAll(async () => {
    servidor = crearApp({ whatsapp: { appSecret: SECRETO, verifyToken: TOKEN } }).listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    cuentaA = await crearCuenta(a);
    cuentaB = await crearCuenta(b);
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
  });

  afterEach(() => vi.restoreAllMocks());

  const conApp = async (appSecret: string, verifyToken: string, trabajo: (url: string) => Promise<void>) => {
    const otro = crearApp({ whatsapp: { appSecret, verifyToken } }).listen(0);
    await new Promise((r) => otro.once('listening', r));
    try {
      await trabajo(`http://127.0.0.1:${(otro.address() as AddressInfo).port}`);
    } finally {
      await new Promise((r) => otro.close(r));
    }
  };

  describe('verificación de la URL (GET)', () => {
    const verificar = (parametros: Record<string, string>, url = base) =>
      fetch(`${url}/webhooks/whatsapp?${new URLSearchParams(parametros)}`);

    it('devuelve el challenge en texto plano con el token correcto', async () => {
      const r = await verificar({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '<b>12345</b>' });
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/plain');
      expect(await r.text()).toBe('<b>12345</b>');
    });

    it.each([
      [{ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': 'x' }, 'token incorrecto'],
      [{ 'hub.mode': 'unsubscribe', 'hub.verify_token': TOKEN, 'hub.challenge': 'x' }, 'modo incorrecto'],
      [{ 'hub.mode': 'subscribe', 'hub.challenge': 'x' }, 'sin token'],
      [{ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN }, 'sin challenge'],
      [{}, 'sin parámetros'],
    ])('rechaza %j (%s) y no devuelve el challenge', async (parametros, _motivo) => {
      const r = await verificar(parametros as Record<string, string>);
      expect(r.status).toBe(403);
      expect(await r.text()).not.toBe('x');
    });

    it('sin token configurado rechaza todo, incluso un token vacío', async () => {
      await conApp(SECRETO, '', async (url) => {
        const r = await verificar({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'x' }, url);
        expect(r.status).toBe(403);
      });
    });
  });

  describe('firma (POST)', () => {
    it('sin firma, con firma falsa o de otro secreto responde 401 y no guarda nada', async () => {
      const telefono = nuevoTelefono();
      const cuerpo = JSON.stringify(evento(cuentaA, [mensajeDeTexto(telefono)]));
      for (const firma of [
        null,
        'sha256=abc',
        'md5=abc',
        firmar(cuerpo, 'otro-secreto'),
        firmar(cuerpo).slice(7),
        firmar(`${cuerpo} `),
        `${firmar(cuerpo).slice(0, -1)}${firmar(cuerpo).endsWith('0') ? '1' : '0'}`,
      ]) {
        expect((await enviar(cuerpo, firma)).status).toBe(401);
      }
      expect(await clienteDe(a, telefono)).toBeUndefined();
    });

    it('la firma se calcula sobre los bytes exactos, sin reformatear el JSON', async () => {
      const telefono = nuevoTelefono();
      const cuerpo = Buffer.from(JSON.stringify(evento(cuentaA, [mensajeDeTexto(telefono, 'Ñandú ☕')]), null, 3));
      expect((await enviar(cuerpo, firmar(cuerpo))).status).toBe(200);
      expect((await mensajesDe(a, telefono))[0]!.contenido).toBe('Ñandú ☕');
    });

    it('sin secreto configurado responde 503, aunque firmen con clave vacía', async () => {
      await conApp('', TOKEN, async (url) => {
        const telefono = nuevoTelefono();
        const cuerpo = JSON.stringify(evento(cuentaA, [mensajeDeTexto(telefono)]));
        expect((await enviar(cuerpo, firmar(cuerpo, ''), url)).status).toBe(503);
        expect(await clienteDe(a, telefono)).toBeUndefined();
      });
    });

    it('con clave vacía ninguna firma es válida, ni siquiera la correcta', () => {
      const cuerpo = Buffer.from('{}');
      expect(firmaValida(cuerpo, firmar(cuerpo, ''), '')).toBe(false);
      expect(firmaValida(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
    });

    it('un cuerpo mayor al límite responde 413', async () => {
      const cuerpo = Buffer.alloc(3 * 1024 * 1024 + 1, 'a');
      expect((await enviar(cuerpo, firmar(cuerpo))).status).toBe(413);
    });

    it('el resto de la API sigue leyendo JSON con normalidad', async () => {
      const r = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `${randomUUID()}@prueba.com`, password: 'x' }),
      });
      expect(r.status).toBe(401);
    });
  });

  describe('guardar mensajes', () => {
    it('crea cliente, conversación y mensaje, con el nombre del perfil', async () => {
      const telefono = nuevoTelefono();
      const m = mensajeDeTexto(telefono, 'Quiero una cita');
      const r = await enviarEvento(evento(cuentaA, [m], [{ wa_id: telefono, profile: { name: ' Ana ' } }]));
      expect(r.status).toBe(200);
      expect(await clienteDe(a, telefono)).toMatchObject({ nombre: 'Ana' });
      const [guardado] = await mensajesDe(a, telefono);
      expect(guardado).toMatchObject({
        wa_message_id: m.id,
        direccion: 'entrante',
        emisor: 'cliente',
        tipo: 'texto',
        contenido: 'Quiero una cita',
        media_id: null,
      });
      expect(await conversacionDe(a, telefono)).toMatchObject({ whatsapp_cuenta_id: cuentaA.id, estado: 'bot' });
    });

    it('no pisa el nombre de un cliente existente, y recorta uno muy largo', async () => {
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono)], [{ wa_id: telefono, profile: { name: 'Primero' } }]));
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono)], [{ wa_id: telefono, profile: { name: 'Otro' } }]));
      expect((await clienteDe(a, telefono))!.nombre).toBe('Primero');

      const largo = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(largo)], [{ wa_id: largo, profile: { name: 'x'.repeat(300) } }]));
      expect((await clienteDe(a, largo))!.nombre).toHaveLength(100);
    });

    it('un cliente sin perfil queda sin nombre', async () => {
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono)]));
      expect((await clienteDe(a, telefono))!.nombre).toBeNull();
    });

    it('audio e imagen guardan el id del archivo, y la imagen su texto', async () => {
      const telefono = nuevoTelefono();
      const comun = { timestamp: segundos(AHORA), from: telefono };
      await enviarEvento(
        evento(cuentaA, [
          { ...comun, id: `wamid.${randomUUID()}`, type: 'audio', audio: { id: 'media-audio', mime_type: 'audio/ogg' } },
          { ...comun, id: `wamid.${randomUUID()}`, type: 'image', image: { id: 'media-imagen', caption: 'Este corte' } },
        ]),
      );
      const filas = await mensajesDe(a, telefono);
      expect(filas.map((f) => [f.tipo, f.media_id, f.contenido]).sort()).toEqual([
        ['audio', 'media-audio', null],
        ['imagen', 'media-imagen', 'Este corte'],
      ]);
    });

    it.each(['sticker', 'video', 'document', 'location', 'reaction', 'interactive', 'unknown', 'tipo-nuevo'])(
      'un mensaje %s se guarda como otro, sin contenido',
      async (type) => {
        const telefono = nuevoTelefono();
        const r = await enviarEvento(evento(cuentaA, [{ id: `wamid.${randomUUID()}`, from: telefono, timestamp: segundos(AHORA), type }]));
        expect(r.status).toBe(200);
        expect((await mensajesDe(a, telefono))[0]).toMatchObject({ tipo: 'otro', contenido: null, media_id: null });
      },
    );

    it('varios mensajes y varios clientes en un mismo evento', async () => {
      const uno = nuevoTelefono();
      const dos = nuevoTelefono();
      await enviarEvento(
        evento(cuentaA, [mensajeDeTexto(uno, '1'), mensajeDeTexto(dos, '2'), mensajeDeTexto(uno, '3')], [
          { wa_id: uno, profile: { name: 'Uno' } },
          { wa_id: dos, profile: { name: 'Dos' } },
        ]),
      );
      expect(await mensajesDe(a, uno)).toHaveLength(2);
      expect(await mensajesDe(a, dos)).toHaveLength(1);
      expect((await clienteDe(a, dos))!.nombre).toBe('Dos');
    });

    it('el carácter nulo no bloquea el mensaje para siempre', async () => {
      const telefono = nuevoTelefono();
      const r = await enviarEvento(
        evento(cuentaA, [mensajeDeTexto(telefono, 'Ho\u0000la')], [{ wa_id: telefono, profile: { name: 'A\u0000na' } }]),
      );
      expect(r.status).toBe(200);
      expect((await mensajesDe(a, telefono))[0]!.contenido).toBe('Hola');
      expect((await clienteDe(a, telefono))!.nombre).toBe('Ana');
    });
  });

  describe('reenvíos de Meta', () => {
    it('el mismo mensaje no se guarda dos veces ni cambia las fechas', async () => {
      const telefono = nuevoTelefono();
      const m = mensajeDeTexto(telefono);
      const datos = evento(cuentaA, [m]);
      await enviarEvento(datos);
      const antes = await conversacionDe(a, telefono);
      await espera(5);
      expect((await enviarEvento(datos)).status).toBe(200);
      expect(await mensajesDe(a, telefono)).toHaveLength(1);
      expect((await conversacionDe(a, telefono))!.ultimo_mensaje_en).toEqual(antes!.ultimo_mensaje_en);
    });

    it('a la vez, se guarda uno solo y un solo cliente', async () => {
      const telefono = nuevoTelefono();
      const datos = evento(cuentaA, [mensajeDeTexto(telefono)]);
      const respuestas = await Promise.all(Array.from({ length: 8 }, () => enviarEvento(datos)));
      expect(respuestas.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await mensajesDe(a, telefono)).toHaveLength(1);
      const { rows } = await conNegocio(a.negocioId, (tx) =>
        tx.consultar('SELECT 1 FROM clientes WHERE telefono = $1', [telefono]),
      );
      expect(rows).toHaveLength(1);
    });

    it('si falla un mensaje responde 500, guarda los demás, y el reenvío completa sin duplicar', async () => {
      const telefono = nuevoTelefono();
      const bueno = mensajeDeTexto(telefono, 'Bueno');
      const conFallo = mensajeDeTexto(telefono, 'Falla la primera vez');
      const otro = mensajeDeTexto(telefono, 'Otro');
      const original = repositorio.guardarMensajeEntrante;
      const error = vi.spyOn(logger, 'error');
      const espia = vi.spyOn(repositorio, 'guardarMensajeEntrante');
      espia.mockImplementation(async (tx, n, c, m) => {
        if (m.waMessageId === conFallo.id) {
          throw Object.assign(new Error('fallo pasajero'), { code: '40001', detail: `Failing row contains (${telefono}, ${m.contenido})` });
        }
        return original(tx, n, c, m);
      });
      const datos = evento(cuentaA, [bueno, conFallo, otro]);
      expect((await enviarEvento(datos)).status).toBe(500);
      expect((await mensajesDe(a, telefono)).map((f) => f.contenido).sort()).toEqual(['Bueno', 'Otro']);
      expect(JSON.stringify(error.mock.calls)).not.toContain(telefono);
      expect(JSON.stringify(error.mock.calls)).not.toContain('Falla la primera vez');

      espia.mockRestore();
      expect((await enviarEvento(datos)).status).toBe(200);
      expect(await mensajesDe(a, telefono)).toHaveLength(3);
    });

    it('si falla el mensaje no queda un cliente a medias', async () => {
      const telefono = nuevoTelefono();
      vi.spyOn(repositorio, 'guardarMensajeEntrante').mockRejectedValue(new Error('fallo'));
      expect((await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono)]))).status).toBe(500);
      expect(await clienteDe(a, telefono)).toBeUndefined();
    });
  });

  describe('qué se ignora', () => {
    it('una cuenta desconocida o inactiva responde 200 y no guarda nada', async () => {
      const telefono = nuevoTelefono();
      expect((await enviarEvento(evento({ id: 'x', phoneNumberId: 'desconocida' }, [mensajeDeTexto(telefono)]))).status).toBe(200);

      const inactiva = await crearCuenta(a);
      await conNegocio(a.negocioId, (tx) => tx.consultar('UPDATE whatsapp_cuentas SET activa = false WHERE id = $1', [inactiva.id]));
      expect((await enviarEvento(evento(inactiva, [mensajeDeTexto(telefono)]))).status).toBe(200);
      expect(await clienteDe(a, telefono)).toBeUndefined();
    });

    it('un negocio suspendido responde 200 y no guarda nada', async () => {
      const n = await crearNegocio('Suspendido');
      const cuenta = await crearCuenta(n);
      await conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'suspendido' WHERE id = $1", [n.negocioId]));
      const telefono = nuevoTelefono();
      expect((await enviarEvento(evento(cuenta, [mensajeDeTexto(telefono)]))).status).toBe(200);
      expect(await clienteDe(n, telefono)).toBeUndefined();
    });

    it('un negocio en prueba sí guarda', async () => {
      const n = await crearNegocio('Prueba');
      await conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'prueba' WHERE id = $1", [n.negocioId]));
      const cuenta = await crearCuenta(n);
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuenta, [mensajeDeTexto(telefono)]));
      expect(await mensajesDe(n, telefono)).toHaveLength(1);
    });

    it.each([
      ['otro objeto', { object: 'page', entry: [] }],
      ['sin entry', { object: 'whatsapp_business_account' }],
      ['entry raro', { object: 'whatsapp_business_account', entry: 'x' }],
      ['null', null],
      ['lista', []],
    ])('%s responde 200', async (_nombre, datos) => {
      expect((await enviarEvento(datos)).status).toBe(200);
    });

    it('un evento válido de otro producto no se guarda', async () => {
      const telefono = nuevoTelefono();
      const r = await enviarEvento({ ...evento(cuentaA, [mensajeDeTexto(telefono)]), object: 'page' });
      expect(r.status).toBe(200);
      expect(await clienteDe(a, telefono)).toBeUndefined();
    });

    it('un cuerpo firmado que no es JSON responde 200: reenviarlo no lo arregla', async () => {
      expect((await enviar('no es json', firmar('no es json'))).status).toBe(200);
    });

    it('un evento de estados o de otro campo no guarda nada', async () => {
      const estados = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              { field: 'messages', value: { metadata: { phone_number_id: cuentaA.phoneNumberId }, statuses: [{ id: 'wamid.x', status: 'read' }] } },
              { field: 'account_update', value: {} },
              { field: 'messages' },
            ],
          },
        ],
      };
      expect((await enviarEvento(estados)).status).toBe(200);
    });

    it('un mensaje con datos no válidos se descarta sin frenar a los demás', async () => {
      const telefono = nuevoTelefono();
      const r = await enviarEvento(
        evento(cuentaA, [
          mensajeDeTexto('no-es-telefono'),
          { id: 'wamid.sin-from', type: 'text' },
          'basura',
          mensajeDeTexto(telefono, 'Válido'),
        ]),
      );
      expect(r.status).toBe(200);
      expect(await mensajesDe(a, telefono)).toHaveLength(1);
    });
  });

  describe('aislamiento', () => {
    it('el negocio sale del número que recibió el mensaje', async () => {
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono, 'Para A')]));
      await enviarEvento(evento(cuentaB, [mensajeDeTexto(telefono, 'Para B')]));
      expect((await mensajesDe(a, telefono)).map((f) => f.contenido)).toEqual(['Para A']);
      expect((await mensajesDe(b, telefono)).map((f) => f.contenido)).toEqual(['Para B']);
      expect((await clienteDe(a, telefono))!.id).not.toBe((await clienteDe(b, telefono))!.id);
    });
  });

  describe('fechas y modo humano', () => {
    const textoEn = (telefono: string, fecha: Date) => mensajeDeTexto(telefono, 'Hola', { timestamp: segundos(fecha) });
    const procesar = (cuenta: Cuenta, mensaje: unknown, ahora = AHORA) => procesarEvento(evento(cuenta, [mensaje]), ahora);

    it('usa la hora del mensaje, no la de llegada', async () => {
      const telefono = nuevoTelefono();
      const enviado = new Date('2035-03-10T11:00:00Z');
      await procesar(cuentaA, textoEn(telefono, enviado));
      expect((await mensajesDe(a, telefono))[0]!.creado_en).toEqual(enviado);
      expect(await conversacionDe(a, telefono)).toMatchObject({ ultimo_mensaje_cliente_en: enviado, ultimo_mensaje_en: enviado });
    });

    it.each(['abc', '-5', '', '99999999999999'])('una hora no válida o futura (%s) usa la de llegada', async (timestamp) => {
      const telefono = nuevoTelefono();
      await procesar(cuentaA, mensajeDeTexto(telefono, 'Hola', { timestamp }));
      expect((await mensajesDe(a, telefono))[0]!.creado_en).toEqual(AHORA);
    });

    it('un mensaje atrasado no retrocede las fechas de la conversación', async () => {
      const telefono = nuevoTelefono();
      const reciente = new Date('2035-03-10T11:00:00Z');
      await procesar(cuentaA, textoEn(telefono, reciente));
      await procesar(cuentaA, textoEn(telefono, new Date('2035-03-10T08:00:00Z')));
      expect(await conversacionDe(a, telefono)).toMatchObject({ ultimo_mensaje_cliente_en: reciente, ultimo_mensaje_en: reciente });
      expect(await mensajesDe(a, telefono)).toHaveLength(2);
    });

    async function enModoHumano(telefono: string, desde: Date) {
      await procesar(cuentaA, textoEn(telefono, new Date(desde.getTime() - 60_000)));
      await conNegocio(a.negocioId, (tx) =>
        tx.consultar(
          `UPDATE conversaciones SET estado = 'humano', humano_desde = $2
            WHERE cliente_id = (SELECT id FROM clientes WHERE telefono = $1)`,
          [telefono, desde],
        ),
      );
    }

    it('vuelve a la IA con las 2 h exactas, y un segundo antes sigue en humano', async () => {
      const desde = new Date(AHORA.getTime() - 2 * 3_600_000);
      const justo = nuevoTelefono();
      await enModoHumano(justo, desde);
      await procesar(cuentaA, textoEn(justo, AHORA), new Date(AHORA.getTime() + 1000));
      expect(await conversacionDe(a, justo)).toMatchObject({ estado: 'bot', humano_desde: null });

      const casi = nuevoTelefono();
      await enModoHumano(casi, desde);
      await procesar(cuentaA, textoEn(casi, new Date(AHORA.getTime() - 1000)));
      expect(await conversacionDe(a, casi)).toMatchObject({ estado: 'humano', humano_desde: desde });
    });

    it('respeta las horas de cada negocio', async () => {
      const n = await crearNegocio('Modo humano largo');
      const cuenta = await crearCuenta(n);
      await conNegocio(n.negocioId, (tx) => tx.consultar('UPDATE configuracion_negocio SET horas_modo_humano = 5'));
      const telefono = nuevoTelefono();
      await procesar(cuenta, textoEn(telefono, new Date(AHORA.getTime() - 4 * 3_600_000)));
      await conNegocio(n.negocioId, (tx) =>
        tx.consultar("UPDATE conversaciones SET estado = 'humano', humano_desde = $1", [new Date(AHORA.getTime() - 3 * 3_600_000)]),
      );
      await procesar(cuenta, textoEn(telefono, new Date(AHORA.getTime() - 1000)));
      expect((await conversacionDe(n, telefono))!.estado).toBe('humano');
    });

    it('un mensaje repetido no devuelve la conversación a la IA', async () => {
      const telefono = nuevoTelefono();
      const repetido = textoEn(telefono, new Date(AHORA.getTime() - 3 * 3_600_000));
      await procesar(cuentaA, repetido);
      await conNegocio(a.negocioId, (tx) =>
        tx.consultar(
          `UPDATE conversaciones SET estado = 'humano', humano_desde = $2
            WHERE cliente_id = (SELECT id FROM clientes WHERE telefono = $1)`,
          [telefono, new Date(AHORA.getTime() - 4 * 3_600_000)],
        ),
      );
      await procesar(cuentaA, repetido);
      expect((await conversacionDe(a, telefono))!.estado).toBe('humano');
    });
  });

  describe('datos personales', () => {
    it('no registra el contenido, el teléfono ni el nombre', async () => {
      const telefono = nuevoTelefono();
      const llamadas = [vi.spyOn(logger, 'info'), vi.spyOn(logger, 'warn'), vi.spyOn(logger, 'error')];
      await enviarEvento(
        evento(cuentaA, [mensajeDeTexto(telefono, 'Texto privado'), mensajeDeTexto('no-es-telefono')], [
          { wa_id: telefono, profile: { name: 'Nombre Privado' } },
        ]),
      );
      const registrado = JSON.stringify(llamadas.map((l) => l.mock.calls));
      expect(registrado).toContain('Mensaje de WhatsApp recibido');
      for (const privado of [telefono, 'Texto privado', 'Nombre Privado', 'no-es-telefono']) {
        expect(registrado).not.toContain(privado);
      }
    });

    it('el primer mensaje no registra un consentimiento: primero va el aviso de datos', async () => {
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono)]));
      const cliente = await clienteDe(a, telefono);
      const { rows } = await conNegocio(a.negocioId, (tx) =>
        tx.consultar('SELECT 1 FROM consentimientos WHERE cliente_id = $1', [cliente!.id]),
      );
      expect(rows).toHaveLength(0);
    });

    it('anonimizar borra los mensajes, y si la persona vuelve es un cliente nuevo', async () => {
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono, 'Mensaje viejo')]));
      const viejo = await clienteDe(a, telefono);
      await anonimizarCliente(a.negocioId, viejo!.id);
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono, 'Mensaje nuevo')]));
      expect((await clienteDe(a, telefono))!.id).not.toBe(viejo!.id);
      expect((await mensajesDe(a, telefono)).map((f) => f.contenido)).toEqual(['Mensaje nuevo']);
    });
  });

  describe('clientes por BSUID (nombre de usuario de WhatsApp)', () => {
    let bsuids = 0;
    const nuevoBsuid = () => `CO.${Date.now()}${String(++bsuids).padStart(4, '0')}`;

    /** Mensaje con BSUID y, si se indica, también teléfono. Sin `from` cuando no hay teléfono. */
    function mensajeConBsuid(bsuid: string | null, telefono: string | null, cuerpo = 'Hola') {
      return {
        id: `wamid.${randomUUID()}`,
        ...(telefono !== null && { from: telefono }),
        ...(bsuid !== null && { from_user_id: bsuid }),
        timestamp: segundos(AHORA),
        type: 'text',
        text: { body: cuerpo },
      };
    }

    const contacto = (bsuid: string, nombre: string, telefono?: string) => ({
      profile: { name: nombre, username: 'usuario.de.prueba' },
      user_id: bsuid,
      ...(telefono && { wa_id: telefono }),
    });

    interface FilaCliente {
      id: string;
      nombre: string | null;
      telefono: string | null;
      wa_user_id: string | null;
    }

    const clientesDe = (n: NegocioDePrueba, condicion: string, valor: string) =>
      conNegocio(n.negocioId, async (tx) =>
        (
          await tx.consultar<FilaCliente>(
            `SELECT id, nombre, telefono, wa_user_id FROM clientes WHERE ${condicion} = $1 ORDER BY created_at, id`,
            [valor],
          )
        ).rows,
      );

    const mensajesDelCliente = (n: NegocioDePrueba, clienteId: string) =>
      conNegocio(n.negocioId, async (tx) =>
        (
          await tx.consultar<{ contenido: string }>(
            `SELECT m.contenido FROM mensajes m JOIN conversaciones c ON c.id = m.conversacion_id
              WHERE c.cliente_id = $1 ORDER BY m.creado_en, m.id`,
            [clienteId],
          )
        ).rows.map((f) => f.contenido),
      );

    it('sin teléfono crea el cliente con su BSUID y el nombre de su contacto', async () => {
      const bsuid = nuevoBsuid();
      const r = await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, 'Sin teléfono')], [contacto(bsuid, 'Ana Usuario')]));
      expect(r.status).toBe(200);
      const [cliente, ...otros] = await clientesDe(a, 'wa_user_id', bsuid);
      expect(otros).toEqual([]);
      expect(cliente).toMatchObject({ telefono: null, wa_user_id: bsuid, nombre: 'Ana Usuario' });
      expect(await mensajesDelCliente(a, cliente!.id)).toEqual(['Sin teléfono']);
    });

    it('con teléfono y BSUID guarda ambos; después, solo con BSUID, es el mismo cliente', async () => {
      const bsuid = nuevoBsuid();
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, telefono, 'Uno')], [contacto(bsuid, 'Beto', telefono)]));
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, 'Dos')]));
      const clientes = await clientesDe(a, 'wa_user_id', bsuid);
      expect(clientes).toHaveLength(1);
      expect(clientes[0]).toMatchObject({ telefono, nombre: 'Beto' });
      expect(await mensajesDelCliente(a, clientes[0]!.id)).toEqual(['Uno', 'Dos']);
    });

    it('a un cliente conocido solo por teléfono se le guarda el BSUID cuando llega', async () => {
      const telefono = nuevoTelefono();
      const bsuid = nuevoBsuid();
      await enviarEvento(evento(cuentaA, [mensajeDeTexto(telefono, 'Viejo')]));
      const original = await clienteDe(a, telefono);
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, telefono, 'Con BSUID')]));
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, 'Solo BSUID')]));
      const [cliente, ...otros] = await clientesDe(a, 'wa_user_id', bsuid);
      expect(otros).toEqual([]);
      expect(cliente!.id).toBe(original!.id);
      expect(await mensajesDelCliente(a, cliente!.id)).toEqual(['Viejo', 'Con BSUID', 'Solo BSUID']);
    });

    it('a un cliente conocido solo por BSUID se le completa el teléfono', async () => {
      const bsuid = nuevoBsuid();
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null)]));
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, telefono)]));
      expect(await clientesDe(a, 'wa_user_id', bsuid)).toEqual([expect.objectContaining({ telefono })]);
    });

    it('no le pone a un cliente un teléfono que ya usa otro', async () => {
      const bsuid = nuevoBsuid();
      const telefono = nuevoTelefono();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, 'Por BSUID')]));
      // Otro cliente con ese número, por ejemplo creado desde el panel.
      await conNegocio(a.negocioId, (tx) =>
        tx.consultar(`INSERT INTO clientes (negocio_id, telefono, nombre) VALUES ($1, $2, 'Del panel')`, [a.negocioId, telefono]),
      );
      const r = await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, telefono, 'Con teléfono')]));
      expect(r.status).toBe(200);
      const [porBsuid] = await clientesDe(a, 'wa_user_id', bsuid);
      expect(porBsuid).toMatchObject({ telefono: null });
      expect(await mensajesDelCliente(a, porBsuid!.id)).toEqual(['Por BSUID', 'Con teléfono']);
      expect(await clientesDe(a, 'telefono', telefono)).toEqual([expect.objectContaining({ nombre: 'Del panel', wa_user_id: null })]);
    });

    it('un número reciclado (mismo teléfono, otro BSUID) es una persona nueva y no ve lo anterior', async () => {
      const telefono = nuevoTelefono();
      const viejo = nuevoBsuid();
      const nuevo = nuevoBsuid();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(viejo, telefono, 'De la persona anterior')]));
      const [anterior] = await clientesDe(a, 'wa_user_id', viejo);
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(nuevo, telefono, 'De la persona nueva')]));

      const [persona] = await clientesDe(a, 'wa_user_id', nuevo);
      expect(persona!.id).not.toBe(anterior!.id);
      expect(persona).toMatchObject({ telefono });
      expect(await mensajesDelCliente(a, persona!.id)).toEqual(['De la persona nueva']);
      // La persona anterior conserva su historial y su BSUID, pero ya no el número.
      expect(await clientesDe(a, 'wa_user_id', viejo)).toEqual([expect.objectContaining({ id: anterior!.id, telefono: null })]);
      expect(await mensajesDelCliente(a, anterior!.id)).toEqual(['De la persona anterior']);
    });

    it('un BSUID con otro formato se ignora: con teléfono sigue, sin teléfono se descarta', async () => {
      const telefono = nuevoTelefono();
      for (const malo of ['13491208655302741918', 'co.123', 'CO.', 'CO.12-34', `CO.${'1'.repeat(129)}`, 'US.ENT.123']) {
        expect((await enviarEvento(evento(cuentaA, [mensajeConBsuid(malo, null)]))).status).toBe(200);
        expect(await clientesDe(a, 'wa_user_id', malo)).toEqual([]);
      }
      await enviarEvento(evento(cuentaA, [mensajeConBsuid('co.123', telefono)]));
      expect(await clientesDe(a, 'telefono', telefono)).toEqual([expect.objectContaining({ wa_user_id: null })]);
    });

    it('un teléfono inválido con BSUID válido crea el cliente solo con el BSUID', async () => {
      const bsuid = nuevoBsuid();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, 'no-es-telefono')]));
      expect(await clientesDe(a, 'wa_user_id', bsuid)).toEqual([expect.objectContaining({ telefono: null })]);
    });

    it('mensajes simultáneos de la misma persona sin teléfono crean un solo cliente', async () => {
      const bsuid = nuevoBsuid();
      const respuestas = await Promise.all(
        Array.from({ length: 8 }, (_, i) => enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, `M${i}`)]))),
      );
      expect(respuestas.map((r) => r.status)).toEqual(Array(8).fill(200));
      const clientes = await clientesDe(a, 'wa_user_id', bsuid);
      expect(clientes).toHaveLength(1);
      expect(await mensajesDelCliente(a, clientes[0]!.id)).toHaveLength(8);
    });

    it('el mismo BSUID en dos negocios son dos clientes distintos', async () => {
      const bsuid = nuevoBsuid();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, 'Para A')]));
      await enviarEvento(evento(cuentaB, [mensajeConBsuid(bsuid, null, 'Para B')]));
      const [deA] = await clientesDe(a, 'wa_user_id', bsuid);
      const [deB] = await clientesDe(b, 'wa_user_id', bsuid);
      expect(deA!.id).not.toBe(deB!.id);
      expect(await mensajesDelCliente(a, deA!.id)).toEqual(['Para A']);
    });

    it('anonimizar quita el BSUID, y si la persona vuelve es un cliente nuevo', async () => {
      const bsuid = nuevoBsuid();
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, nuevoTelefono(), 'Antes')]));
      const [viejo] = await clientesDe(a, 'wa_user_id', bsuid);
      await anonimizarCliente(a.negocioId, viejo!.id);
      const anonimizado = await clientesDe(a, 'id', viejo!.id);
      expect(anonimizado).toEqual([{ id: viejo!.id, nombre: null, telefono: null, wa_user_id: null }]);
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null, 'Después')]));
      const [nuevo] = await clientesDe(a, 'wa_user_id', bsuid);
      expect(nuevo!.id).not.toBe(viejo!.id);
      expect(await mensajesDelCliente(a, nuevo!.id)).toEqual(['Después']);
    });

    it('la base exige teléfono o BSUID a un cliente vigente, y ninguno a uno anonimizado', async () => {
      const insertar = (sql: string, ...params: unknown[]) =>
        conNegocio(a.negocioId, (tx) => tx.consultar(sql, [a.negocioId, ...params]));
      await expect(insertar(`INSERT INTO clientes (negocio_id, nombre) VALUES ($1, 'Nadie')`)).rejects.toMatchObject({ code: '23514' });
      await expect(
        insertar(`INSERT INTO clientes (negocio_id, wa_user_id, anonimizado_en) VALUES ($1, $2, now())`, nuevoBsuid()),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(insertar(`INSERT INTO clientes (negocio_id, wa_user_id) VALUES ($1, 'mal')`)).rejects.toMatchObject({ code: '23514' });
      const bsuid = nuevoBsuid();
      await insertar('INSERT INTO clientes (negocio_id, wa_user_id) VALUES ($1, $2)', bsuid);
      await expect(insertar('INSERT INTO clientes (negocio_id, wa_user_id) VALUES ($1, $2)', bsuid)).rejects.toThrow();
    });

    it('el log no lleva el BSUID', async () => {
      const bsuid = nuevoBsuid();
      const lineas: unknown[] = [];
      for (const nivel of ['info', 'warn', 'error'] as const) {
        vi.spyOn(logger, nivel).mockImplementation(((...args: unknown[]) => void lineas.push(args)) as never);
      }
      await enviarEvento(evento(cuentaA, [mensajeConBsuid(bsuid, null)], [contacto(bsuid, 'Nombre Privado')]));
      const todo = JSON.stringify(lineas);
      expect(todo).toContain('Mensaje de WhatsApp recibido');
      expect(todo).not.toContain(bsuid);
      expect(todo).not.toContain('Nombre Privado');
    });
  });
});
