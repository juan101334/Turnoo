/**
 * Llamadas al backend sin depender de Next: se prueban solas (pruebas/backend.test.ts).
 * El panel es el único que habla con el backend; el navegador nunca lo ve.
 */

export type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface PeticionAlBackend {
  metodo?: Metodo;
  cuerpo?: unknown;
  /** Token de la sesión, leído de la cookie. Nunca sale del servidor del panel. */
  token?: string | null;
  /** IP real del usuario (lib/ip.ts). Null si no se conoce. */
  ipCliente?: string | null;
}

/** Error que respondió el backend, con su código y su mensaje (ya en español, apto para mostrar). */
export class ErrorDelBackend extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDelBackend';
  }
}

const ESPERA_MAXIMA_MS = 10_000;

/**
 * Cabeceras que se envían al backend. Se arman desde cero: ninguna cabecera del navegador pasa
 * tal cual. En particular, X-Forwarded-For lleva SOLO la IP que el panel calculó, no la lista que
 * mandó el navegador, para que nadie pueda hacerse pasar por otra IP.
 */
export function cabecerasParaBackend({ token, ipCliente, conCuerpo }: { token?: string | null; ipCliente?: string | null; conCuerpo: boolean }): Headers {
  const cabeceras = new Headers({ Accept: 'application/json' });
  if (conCuerpo) cabeceras.set('Content-Type', 'application/json');
  if (token) cabeceras.set('Authorization', `Bearer ${token}`);
  if (ipCliente) cabeceras.set('X-Forwarded-For', ipCliente);
  return cabeceras;
}

export async function pedirAlBackend<T>(
  baseUrl: string,
  ruta: string,
  { metodo = 'GET', cuerpo, token, ipCliente }: PeticionAlBackend = {},
  pedir: typeof fetch = fetch,
): Promise<T> {
  const conCuerpo = cuerpo !== undefined;
  let respuesta: Response;
  try {
    respuesta = await pedir(new URL(ruta, baseUrl), {
      method: metodo,
      headers: cabecerasParaBackend({ token, ipCliente, conCuerpo }),
      ...(conCuerpo && { body: JSON.stringify(cuerpo) }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    });
  } catch {
    throw new ErrorDelBackend(503, 'SIN_CONEXION', 'No pudimos conectar con el servidor. Intenta de nuevo en un momento.');
  }

  if (respuesta.status === 204) return undefined as T;
  const datos: unknown = await respuesta.json().catch(() => null);
  if (respuesta.ok) return datos as T;

  const error = (datos as { error?: { codigo?: unknown; mensaje?: unknown } } | null)?.error;
  throw new ErrorDelBackend(
    respuesta.status,
    typeof error?.codigo === 'string' ? error.codigo : 'ERROR',
    typeof error?.mensaje === 'string' ? error.mensaje : 'Ocurrió un error inesperado. Intenta de nuevo.',
  );
}
