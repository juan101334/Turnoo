import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { entorno } from '../src/config/entorno.js';
import { conNegocio } from '../src/db/contexto.js';
import { borrarArchivos } from '../src/modulos/adjuntos/adjuntos.archivos.js';
import { duracionOggOpus, formatoDeAudio, tipoDeImagen } from '../src/modulos/adjuntos/adjuntos.formatos.js';
import {
  MAX_ADJUNTOS_POR_ATENCION,
  MAX_BYTES_AUDIO_SIN_DURACION,
  MAX_BYTES_IMAGEN,
  MAX_SEGUNDOS_AUDIO,
  prepararAdjuntos,
} from '../src/modulos/adjuntos/adjuntos.servicio.js';
import { iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import { anonimizarCliente } from '../src/modulos/clientes/clientes.servicio.js';
import { crearAtender } from '../src/modulos/ia/ia.servicio.js';
import { URL_TRANSCRIPCIONES } from '../src/modulos/ia/ia.proveedor.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { crearNegocio, crearProfesional, crearServicio, limpiar, type NegocioDePrueba } from './ayudas.js';

/** Viernes 16 de marzo de 2035, 9:00 a. m. en Bogotá. */
const T = new Date('2035-03-16T14:00:00Z');
const TOKEN = 'EAAtoken-de-prueba-adjuntos';
const BASE = resolve(entorno.ARCHIVOS_DIR);

// ---------------------------------------------------------------------
// Archivos mínimos, armados en memoria
// ---------------------------------------------------------------------

/** Un ogg/opus con la cabecera OpusHead y una última página que dura `segundos`. */
function ogg(segundos: number, preSkip = 312): Buffer {
  const pagina = (granulo: bigint) => {
    const b = Buffer.alloc(27);
    b.write('OggS', 0, 'latin1');
    b.writeBigUInt64LE(granulo, 6);
    return b;
  };
  const cabecera = Buffer.alloc(19);
  cabecera.write('OpusHead', 0, 'latin1');
  cabecera[8] = 1;
  cabecera[9] = 1;
  cabecera.writeUInt16LE(preSkip, 10);
  return Buffer.concat([pagina(0n), cabecera, Buffer.alloc(200, 7), pagina(BigInt(Math.round(segundos * 48_000)) + BigInt(preSkip)), Buffer.alloc(20)]);
}
const jpg = (tamano = 1000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(tamano - 4, 1)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);
const webp = () => Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBPVP8 ', 'latin1'), Buffer.alloc(50)]);
const gif = () => Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(100)]);
const mp3 = (tamano = 1000) => Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(tamano - 3, 3)]);

interface ArchivoDeMeta {
  bytes: Buffer;
  mime: string;
  /** Lo que Meta informa; por defecto, el tamaño real. null = no lo informa. */
  tamano?: number | null;
  estadoInfo?: number;
  estadoDescarga?: number;
  url?: string;
}

/** Meta simulado: Graph devuelve la dirección de cada archivo y luego se descarga. */
function metaFalso(archivos: Record<string, ArchivoDeMeta>) {
  const llamadas: { url: string; autorizacion: string }[] = [];
  const pedir = vi.fn<typeof fetch>(async (entrada, init) => {
    const url = String(entrada);
    llamadas.push({ url, autorizacion: String((init?.headers as Record<string, string>).authorization) });
    const graph = url.match(/graph\.facebook\.com\/v[\d.]+\/([^/?]+)$/);
    if (graph) {
      const a = archivos[decodeURIComponent(graph[1]!)];
      if (!a) return new Response(JSON.stringify({ error: { code: 100 } }), { status: 404 });
      if (a.estadoInfo) return new Response(JSON.stringify({ error: { code: 1 } }), { status: a.estadoInfo });
      return new Response(
        JSON.stringify({
          url: a.url ?? `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${graph[1]}`,
          mime_type: a.mime,
          ...(a.tamano !== null && { file_size: a.tamano ?? a.bytes.length }),
        }),
        { status: 200 },
      );
    }
    const mid = new URL(url).searchParams.get('mid');
    const a = mid ? archivos[mid] : undefined;
    if (!a) return new Response('no', { status: 404 });
    if (a.estadoDescarga) return new Response('error', { status: a.estadoDescarga });
    return new Response(new Uint8Array(a.bytes), { status: 200 });
  });
  return { pedir, llamadas };
}

/** OpenAI simulado para las transcripciones. */
function transcriptorFalso(texto = 'quiero un corte mañana a las once', segundos = 5, estado = 200) {
  const archivos: { nombre: string; tipo: string; modelo: string; idioma: string }[] = [];
  const pedir = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe(URL_TRANSCRIPCIONES);
    const formulario = init!.body as FormData;
    const archivo = formulario.get('file') as File;
    archivos.push({ nombre: archivo.name, tipo: archivo.type, modelo: String(formulario.get('model')), idioma: String(formulario.get('languages[]')) });
    if (estado !== 200) return new Response(JSON.stringify({ error: { code: 'x' } }), { status: estado });
    return new Response(JSON.stringify({ text: ` ${texto} `, languages: [{ code: 'es' }], usage: { type: 'duration', seconds: segundos } }), { status: 200 });
  });
  return { pedir, archivos };
}

describe('notas de voz e imágenes', () => {
  let n: NegocioDePrueba;
  let cuentaId: string;
  let barbero: string;
  let corte: string;
  let telefonos = 0;
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let dueno: string;
  let empleadoOtro: string;

  interface Conversacion {
    conversacionId: string;
    clienteId: string;
  }

  const sql = async <F extends object>(texto: string, params: unknown[] = []) =>
    (await conNegocio(n.negocioId, (tx) => tx.consultar<F>(texto, params))).rows;

  async function conversacion(): Promise<Conversacion> {
    const [cliente] = await sql<{ id: string }>('INSERT INTO clientes (negocio_id, telefono) VALUES ($1, $2) RETURNING id', [
      n.negocioId,
      `5737${String(++telefonos).padStart(8, '0')}`,
    ]);
    const [c] = await sql<{ id: string }>(
      'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en) VALUES ($1, $2, $3, $4) RETURNING id',
      [n.negocioId, cliente!.id, cuentaId, T],
    );
    return { conversacionId: c!.id, clienteId: cliente!.id };
  }

  let segundosMensaje = 0;
  async function mensaje(c: Conversacion, tipo: 'audio' | 'imagen', mediaId: string | null, momento?: Date, pie: string | null = null): Promise<string> {
    const [m] = await sql<{ id: string }>(
      `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, media_id, creado_en)
       VALUES ($1, $2, 'entrante', 'cliente', $3, $4, $5, $6) RETURNING id`,
      [n.negocioId, c.conversacionId, tipo, pie, mediaId, momento ?? new Date(T.getTime() - 60_000 + ++segundosMensaje)],
    );
    return m!.id;
  }

  const fila = async (mensajeId: string) =>
    (await sql<{ transcripcion: string | null; archivo_ruta: string | null; adjunto_error: string | null; cita_id: string | null }>(
      'SELECT transcripcion, archivo_ruta, adjunto_error, cita_id FROM mensajes WHERE id = $1',
      [mensajeId],
    ))[0]!;

  const preparar = (c: Conversacion, meta: ReturnType<typeof metaFalso>, audio = transcriptorFalso()) =>
    prepararAdjuntos(n.negocioId, c.conversacionId, 'America/Bogota', T, { meta: meta.pedir, audio: { pedir: audio.pedir, clave: () => 'sk-prueba' } });

  const existe = (ruta: string) => stat(join(BASE, ruta)).then(() => true, () => false);

  async function sesion(rol: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    await sql(`INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Persona', $3, true, $4)`, [
      n.negocioId,
      email,
      rol,
      await argon2.hash('clave-de-prueba-1'),
    ]);
    return (await iniciarSesion(email, 'clave-de-prueba-1')).token;
  }

  const api = async (token: string, ruta: string) => {
    const r = await fetch(base + ruta, { headers: { authorization: `Bearer ${token}` } });
    return { status: r.status, headers: r.headers, bytes: Buffer.from(await r.arrayBuffer()) };
  };

  beforeAll(async () => {
    await rm(BASE, { recursive: true, force: true });
    n = await crearNegocio('Negocio de adjuntos');
    cuentaId = (await registrarCuenta(n.negocioId, { phoneNumberId: `${Date.now()}5`, wabaId: '1', numeroVisible: '3000000005', token: TOKEN })).id;
    barbero = await crearProfesional(n, 'Carlos');
    corte = await crearServicio(n, barbero, 'Corte', 30, 25000);
    for (let dia = 1; dia <= 7; dia += 1) {
      await sql(`INSERT INTO horarios_trabajo (negocio_id, profesional_id, dia_semana, hora_inicio, hora_fin) VALUES ($1, $2, $3, '08:00', '18:00')`, [n.negocioId, barbero, dia]);
    }
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    dueno = await sesion('dueno');
    const otro = await crearProfesional(n, 'Otro');
    empleadoOtro = await sesion('empleado');
    await sql(`UPDATE profesionales SET usuario_id = (SELECT id FROM usuarios WHERE negocio_id = $1 AND rol = 'empleado' LIMIT 1) WHERE id = $2`, [n.negocioId, otro]);
  });

  beforeEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await rm(BASE, { recursive: true, force: true });
  });

  describe('formatos (por los bytes, no por lo que dice el remitente)', () => {
    it('reconoce jpg, png y webp, y nada más', () => {
      expect(tipoDeImagen(jpg())?.extension).toBe('jpg');
      expect(tipoDeImagen(png())?.extension).toBe('png');
      expect(tipoDeImagen(webp())?.extension).toBe('webp');
      expect(tipoDeImagen(gif())).toBeNull();
      expect(tipoDeImagen(Buffer.from('<svg></svg>'))).toBeNull();
      expect(tipoDeImagen(Buffer.alloc(0))).toBeNull();
    });

    it('lee la duración de un ogg/opus', () => {
      expect(duracionOggOpus(ogg(4.4))).toBeCloseTo(4.4, 2);
      expect(duracionOggOpus(ogg(121, 0))).toBeCloseTo(121, 2);
      expect(duracionOggOpus(mp3())).toBeNull();
      expect(duracionOggOpus(Buffer.from('OggS'))).toBeNull();
    });

    it('reconoce los audios que acepta la transcripción', () => {
      expect(formatoDeAudio(ogg(3))).toEqual({ nombreArchivo: 'nota.ogg', mimeType: 'audio/ogg' });
      expect(formatoDeAudio(mp3())).toEqual({ nombreArchivo: 'audio.mp3', mimeType: 'audio/mpeg' });
      expect(formatoDeAudio(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'latin1')]))?.mimeType).toBe('audio/mp4');
      expect(formatoDeAudio(Buffer.from('#!AMR\n', 'latin1'))).toBeNull();
    });
  });

  describe('notas de voz', () => {
    it('descarga con el token de la cuenta, transcribe y guarda solo el texto', async () => {
      const c = await conversacion();
      const id = await mensaje(c, 'audio', 'media-audio-1');
      const meta = metaFalso({ 'media-audio-1': { bytes: ogg(4.4), mime: 'audio/ogg; codecs=opus' } });
      const audio = transcriptorFalso('quiero un corte', 5);
      expect(await preparar(c, meta, audio)).toBe(1);

      expect(meta.llamadas.map((l) => l.autorizacion)).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]);
      expect(audio.archivos).toEqual([{ nombre: 'nota.ogg', tipo: 'audio/ogg', modelo: 'gpt-transcribe', idioma: 'es' }]);
      expect(await fila(id)).toMatchObject({ transcripcion: 'quiero un corte', archivo_ruta: null, adjunto_error: null });
      const [uso] = await sql<{ s: number }>(`SELECT segundos_audio_transcritos AS s FROM uso_mensual WHERE periodo = '2035-03-01'`);
      expect(uso!.s).toBeGreaterThanOrEqual(5);
    });

    it(`una nota de más de ${MAX_SEGUNDOS_AUDIO} segundos no se transcribe (ni se paga)`, async () => {
      const c = await conversacion();
      const id = await mensaje(c, 'audio', 'media-larga');
      const audio = transcriptorFalso();
      await preparar(c, metaFalso({ 'media-larga': { bytes: ogg(MAX_SEGUNDOS_AUDIO + 1), mime: 'audio/ogg' } }), audio);
      expect(audio.pedir).not.toHaveBeenCalled();
      expect(await fila(id)).toMatchObject({ transcripcion: null, adjunto_error: 'audio_muy_largo' });
      // Con el error anotado no se vuelve a descargar en las atenciones siguientes.
      const otraVez = metaFalso({ 'media-larga': { bytes: ogg(MAX_SEGUNDOS_AUDIO + 1), mime: 'audio/ogg' } });
      expect(await preparar(c, otraVez, audio)).toBe(0);
      expect(otraVez.pedir).not.toHaveBeenCalled();
    });

    it('un audio sin duración legible tiene tope por tamaño', async () => {
      const c = await conversacion();
      const corto = await mensaje(c, 'audio', 'mp3-corto');
      const largo = await mensaje(c, 'audio', 'mp3-largo');
      const audio = transcriptorFalso();
      await preparar(c, metaFalso({
        'mp3-corto': { bytes: mp3(), mime: 'audio/mpeg' },
        'mp3-largo': { bytes: mp3(MAX_BYTES_AUDIO_SIN_DURACION + 1), mime: 'audio/mpeg' },
      }), audio);
      expect(audio.archivos.map((a) => a.nombre)).toEqual(['audio.mp3']);
      expect((await fila(corto)).transcripcion).toBeTruthy();
      expect((await fila(largo)).adjunto_error).toBe('audio_muy_largo');
    });

    it('un formato que no se reconoce, o que OpenAI rechaza, queda como no soportado', async () => {
      const c = await conversacion();
      const amr = await mensaje(c, 'audio', 'amr');
      const rechazado = await mensaje(c, 'audio', 'rechazado');
      await preparar(c, metaFalso({ amr: { bytes: Buffer.from('#!AMR\n....', 'latin1'), mime: 'audio/amr' }, rechazado: { bytes: ogg(3), mime: 'audio/ogg' } }), transcriptorFalso('x', 1, 400));
      expect((await fila(amr)).adjunto_error).toBe('audio_no_soportado');
      expect((await fila(rechazado)).adjunto_error).toBe('audio_no_soportado');
    });

    it('si OpenAI o Meta fallan de forma pasajera, lanza sin marcar nada y el reintento lo completa', async () => {
      const c = await conversacion();
      const id = await mensaje(c, 'audio', 'pasajero');
      const archivos = { pasajero: { bytes: ogg(3), mime: 'audio/ogg' } };
      await expect(preparar(c, metaFalso(archivos), transcriptorFalso('x', 1, 503))).rejects.toThrow();
      await expect(preparar(c, metaFalso({ pasajero: { ...archivos.pasajero, estadoInfo: 500 } }))).rejects.toThrow(/adjunto/);
      expect(await fila(id)).toMatchObject({ transcripcion: null, adjunto_error: null });
      await preparar(c, metaFalso(archivos));
      expect((await fila(id)).transcripcion).toBeTruthy();
    });

    it('un archivo que Meta ya no tiene queda como no disponible', async () => {
      const c = await conversacion();
      const id = await mensaje(c, 'audio', 'borrado');
      await preparar(c, metaFalso({}));
      expect((await fila(id)).adjunto_error).toBe('no_disponible');
    });

    it('no repite lo ya procesado', async () => {
      const c = await conversacion();
      await mensaje(c, 'audio', 'una-vez');
      const audio = transcriptorFalso();
      const meta = metaFalso({ 'una-vez': { bytes: ogg(2), mime: 'audio/ogg' } });
      await preparar(c, meta, audio);
      expect(await preparar(c, meta, audio)).toBe(0);
      expect(audio.pedir).toHaveBeenCalledTimes(1);
    });

    it(`procesa como máximo ${MAX_ADJUNTOS_POR_ATENCION} por atención, y solo de las últimas 24 horas`, async () => {
      const c = await conversacion();
      const archivos: Record<string, ArchivoDeMeta> = {};
      for (let i = 0; i < MAX_ADJUNTOS_POR_ATENCION + 2; i += 1) {
        await mensaje(c, 'audio', `lote-${i}`);
        archivos[`lote-${i}`] = { bytes: ogg(1), mime: 'audio/ogg' };
      }
      const viejo = await mensaje(c, 'audio', 'viejo', new Date(T.getTime() - 25 * 3_600_000));
      archivos.viejo = { bytes: ogg(1), mime: 'audio/ogg' };
      const audio = transcriptorFalso();
      expect(await preparar(c, metaFalso(archivos), audio)).toBe(MAX_ADJUNTOS_POR_ATENCION);
      expect(await preparar(c, metaFalso(archivos), audio)).toBe(2);
      expect(await preparar(c, metaFalso(archivos), audio)).toBe(0);
      expect(await fila(viejo)).toMatchObject({ transcripcion: null, adjunto_error: null });
    });
  });

  describe('imágenes', () => {
    it('guarda jpg, png y webp en el disco, solo para el dueño del proceso, sin llamar a OpenAI', async () => {
      const c = await conversacion();
      const ids = [await mensaje(c, 'imagen', 'img-jpg'), await mensaje(c, 'imagen', 'img-png'), await mensaje(c, 'imagen', 'img-webp')];
      const audio = transcriptorFalso();
      // El tipo que informa Meta no importa: manda lo que dicen los bytes.
      await preparar(c, metaFalso({ 'img-jpg': { bytes: jpg(), mime: 'image/png' }, 'img-png': { bytes: png(), mime: 'image/png' }, 'img-webp': { bytes: webp(), mime: 'image/webp' } }), audio);
      expect(audio.pedir).not.toHaveBeenCalled();
      const rutas = await Promise.all(ids.map(async (id) => (await fila(id)).archivo_ruta!));
      expect(rutas).toEqual(ids.map((id, i) => `imagenes/${n.negocioId}/${id}.${['jpg', 'png', 'webp'][i]}`));
      for (const r of rutas) expect(await existe(r)).toBe(true);
      expect((await stat(join(BASE, rutas[0]!))).mode & 0o777).toBe(0o600);
    });

    it('rechaza otros formatos aunque digan ser imagen, y las de más de 5 MB', async () => {
      const c = await conversacion();
      const falsa = await mensaje(c, 'imagen', 'img-gif');
      const pesada = await mensaje(c, 'imagen', 'img-pesada');
      const mentirosa = await mensaje(c, 'imagen', 'img-mentirosa');
      const meta = metaFalso({
        'img-gif': { bytes: gif(), mime: 'image/jpeg' },
        'img-pesada': { bytes: jpg(), mime: 'image/jpeg', tamano: MAX_BYTES_IMAGEN + 1 },
        // Meta no informa el tamaño y el archivo resulta más grande.
        'img-mentirosa': { bytes: jpg(MAX_BYTES_IMAGEN + 1), mime: 'image/jpeg', tamano: null },
      });
      await preparar(c, meta);
      expect(await fila(falsa)).toMatchObject({ archivo_ruta: null, adjunto_error: 'imagen_no_soportada' });
      expect(await fila(pesada)).toMatchObject({ archivo_ruta: null, adjunto_error: 'imagen_muy_grande' });
      expect(await fila(mentirosa)).toMatchObject({ archivo_ruta: null, adjunto_error: 'imagen_muy_grande' });
      // La pesada ni se descargó: solo se pidió su información.
      expect(meta.llamadas.filter((l) => l.url.includes('img-pesada'))).toHaveLength(1);
    });

    it('nunca envía el token a una dirección que no sea HTTPS', async () => {
      const c = await conversacion();
      const id = await mensaje(c, 'imagen', 'img-http');
      const meta = metaFalso({ 'img-http': { bytes: jpg(), mime: 'image/jpeg', url: 'http://lookaside.fbsbx.com/?mid=img-http' } });
      await preparar(c, meta);
      expect(meta.llamadas.map((l) => l.url).some((u) => u.startsWith('http://'))).toBe(false);
      expect((await fila(id)).adjunto_error).toBe('no_disponible');
    });

    it('las rutas no pueden salir de la carpeta de archivos', async () => {
      await expect(borrarArchivos(['../fuera.txt'])).rejects.toThrow(/fuera/);
      await expect(borrarArchivos(['/etc/passwd'])).rejects.toThrow(/fuera/);
    });
  });

  describe('con la IA', () => {
    function modeloQueVe(pasos: ({ llamadas: { nombre: string; args: unknown }[] } | { texto: string })[]) {
      const entradas: unknown[][] = [];
      const pedir = vi.fn<typeof fetch>(async (_url, init) => {
        entradas.push(JSON.parse(String(init!.body)).input);
        const paso = pasos[entradas.length - 1]!;
        const output =
          'llamadas' in paso
            ? paso.llamadas.map((l, i) => ({ type: 'function_call', call_id: `call_${randomUUID()}_${i}`, name: l.nombre, arguments: JSON.stringify(l.args) }))
            : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: paso.texto }] }];
        return new Response(JSON.stringify({ status: 'completed', output, usage: { input_tokens: 10, output_tokens: 2 } }), { status: 200 });
      });
      return { pedir, entradas };
    }
    const metaWhatsapp = () => vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 }));

    it('la IA lee la transcripción y, al agendar, la imagen queda adjunta a la cita', async () => {
      const c = await conversacion();
      const imagen = await mensaje(c, 'imagen', 'ia-img', undefined, 'así lo quiero');
      await mensaje(c, 'audio', 'ia-audio');
      const modelo = modeloQueVe([
        { llamadas: [{ nombre: 'crear_cita', args: { profesional_id: barbero, servicio_ids: [corte], fecha: '2035-03-17', hora: '10:00' } }] },
        { texto: 'Listo' },
      ]);
      const meta = metaFalso({ 'ia-img': { bytes: jpg(), mime: 'image/jpeg' }, 'ia-audio': { bytes: ogg(3), mime: 'audio/ogg' } });
      await crearAtender({
        modelo: { pedir: modelo.pedir, clave: () => 'sk-prueba' },
        envio: { pedir: metaWhatsapp() },
        adjuntos: { meta: meta.pedir, audio: { pedir: transcriptorFalso('agéndame mañana a las diez').pedir, clave: () => 'sk-prueba' } },
        reloj: () => T,
      })({ negocioId: n.negocioId, ...c });

      const contenidos = (modelo.entradas[0] as { content?: string }[]).map((i) => i.content);
      expect(contenidos[0]).toContain('Quedó guardada');
      expect(contenidos[0]).toContain('así lo quiero');
      expect(contenidos[1]).toBe('[Nota de voz del cliente, transcrita]: agéndame mañana a las diez');
      // Nada de la imagen va al modelo: ni bytes ni la ruta del archivo.
      expect(JSON.stringify(modelo.entradas)).not.toContain('imagenes/');
      const [cita] = await sql<{ id: string }>('SELECT id FROM citas WHERE cliente_id = $1', [c.clienteId]);
      expect((await fila(imagen)).cita_id).toBe(cita!.id);
      const resultado = (modelo.entradas[1] as { type?: string; output?: string }[]).find((i) => i.type === 'function_call_output');
      expect(JSON.parse(resultado!.output!)).toMatchObject({ ok: true, imagenes_adjuntas: 1 });
    });

    it('el panel lista y entrega las imágenes de la cita, solo a quien puede verla', async () => {
      const c = await conversacion();
      const imagen = await mensaje(c, 'imagen', 'panel-img');
      await preparar(c, metaFalso({ 'panel-img': { bytes: png(), mime: 'image/png' } }));
      const [cita] = await sql<{ id: string }>(
        `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [n.negocioId, n.sedeId, barbero, c.clienteId, new Date('2035-03-20T15:00:00Z'), new Date('2035-03-20T15:30:00Z')],
      );
      await sql('UPDATE mensajes SET cita_id = $2 WHERE id = $1', [imagen, cita!.id]);

      const lista = await api(dueno, `/citas/${cita!.id}/imagenes`);
      expect(lista.status).toBe(200);
      expect(JSON.parse(lista.bytes.toString())).toMatchObject({ imagenes: [{ id: imagen, mimeType: 'image/png' }] });
      const archivo = await api(dueno, `/citas/${cita!.id}/imagenes/${imagen}`);
      expect(archivo.status).toBe(200);
      expect(archivo.bytes.equals(png())).toBe(true);
      expect(archivo.headers.get('content-type')).toBe('image/png');
      expect(archivo.headers.get('cache-control')).toBe('private, no-store');
      expect(archivo.headers.get('x-content-type-options')).toBe('nosniff');

      // El empleado de otro barbero no ve la cita; una imagen de otra cita no se entrega.
      expect((await api(empleadoOtro, `/citas/${cita!.id}/imagenes`)).status).toBe(404);
      expect((await api(empleadoOtro, `/citas/${cita!.id}/imagenes/${imagen}`)).status).toBe(404);
      expect((await api(dueno, `/citas/${cita!.id}/imagenes/${randomUUID()}`)).status).toBe(404);
      expect((await api(dueno, `/citas/${cita!.id}/imagenes/no-uuid`)).status).toBe(404);
    });

    it('al anonimizar al cliente se borran sus imágenes del disco', async () => {
      const c = await conversacion();
      const imagen = await mensaje(c, 'imagen', 'anon-img');
      const otra = await conversacion();
      const ajena = await mensaje(otra, 'imagen', 'anon-ajena');
      await preparar(c, metaFalso({ 'anon-img': { bytes: jpg(), mime: 'image/jpeg' } }));
      await preparar(otra, metaFalso({ 'anon-ajena': { bytes: jpg(), mime: 'image/jpeg' } }));
      const ruta = (await fila(imagen)).archivo_ruta!;
      const rutaAjena = (await fila(ajena)).archivo_ruta!;
      expect(await existe(ruta)).toBe(true);

      await anonimizarCliente(n.negocioId, c.clienteId);
      expect(await existe(ruta)).toBe(false);
      expect(await existe(rutaAjena)).toBe(true);
    });
  });
});


