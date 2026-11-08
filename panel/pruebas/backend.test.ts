import { describe, expect, it } from 'vitest';
import { cabecerasParaBackend, ErrorDelBackend, pedirAlBackend } from '@/lib/backend-nucleo';

const BASE = 'http://backend.prueba';

/** fetch falso: guarda lo que se le pidió y responde lo indicado. */
function fetchFalso(respuesta: Response | Error) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const pedir = (async (url: URL, init: RequestInit) => {
    llamadas.push({ url: String(url), init });
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  }) as unknown as typeof fetch;
  return { pedir, llamadas };
}

const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

describe('cabeceras hacia el backend', () => {
  it('X-Forwarded-For lleva solo la IP calculada por el panel', () => {
    const cabeceras = cabecerasParaBackend({ token: null, ipCliente: '203.0.113.10', conCuerpo: false });
    expect(cabeceras.get('x-forwarded-for')).toBe('203.0.113.10');
  });

  it('sin IP conocida no se envía X-Forwarded-For', () => {
    expect(cabecerasParaBackend({ token: null, ipCliente: null, conCuerpo: false }).has('x-forwarded-for')).toBe(false);
  });

  it('el token va como Bearer y el cuerpo como JSON', () => {
    const cabeceras = cabecerasParaBackend({ token: 'abc', ipCliente: null, conCuerpo: true });
    expect(cabeceras.get('authorization')).toBe('Bearer abc');
    expect(cabeceras.get('content-type')).toBe('application/json');
  });
});

describe('pedirAlBackend', () => {
  it('envía método, cuerpo, token e IP, y devuelve el JSON', async () => {
    const { pedir, llamadas } = fetchFalso(json({ ok: 1 }));
    const datos = await pedirAlBackend(BASE, '/auth/login', { metodo: 'POST', cuerpo: { a: 1 }, token: 't', ipCliente: '198.51.100.20' }, pedir);
    expect(datos).toEqual({ ok: 1 });
    const { url, init } = llamadas[0]!;
    expect(url).toBe(`${BASE}/auth/login`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    const cabeceras = init.headers as Headers;
    expect(cabeceras.get('authorization')).toBe('Bearer t');
    expect(cabeceras.get('x-forwarded-for')).toBe('198.51.100.20');
  });

  it('un 204 no tiene cuerpo', async () => {
    const { pedir } = fetchFalso(new Response(null, { status: 204 }));
    await expect(pedirAlBackend(BASE, '/auth/logout', { metodo: 'POST' }, pedir)).resolves.toBeUndefined();
  });

  it('convierte el error del backend en ErrorDelBackend con su código y mensaje', async () => {
    const { pedir } = fetchFalso(json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Vuelve a intentar en 15 minuto(s)' } }, 429));
    const error = await pedirAlBackend(BASE, '/auth/login', {}, pedir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDelBackend);
    expect(error).toMatchObject({ estado: 429, codigo: 'DEMASIADOS_INTENTOS', message: expect.stringContaining('Demasiados intentos') });
  });

  it('una respuesta de error sin el formato esperado da un mensaje genérico', async () => {
    const { pedir } = fetchFalso(new Response('<html>', { status: 502 }));
    await expect(pedirAlBackend(BASE, '/x', {}, pedir)).rejects.toMatchObject({ estado: 502, codigo: 'ERROR' });
  });

  it('si el backend no responde, avisa que no hay conexión', async () => {
    const { pedir } = fetchFalso(new TypeError('fetch failed'));
    await expect(pedirAlBackend(BASE, '/x', {}, pedir)).rejects.toMatchObject({ estado: 503, codigo: 'SIN_CONEXION' });
  });
});
