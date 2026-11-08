import { logger } from '../../compartido/logger.js';
import type { RespuestaMeta } from './whatsapp.tipos.js';

/**
 * Único lugar que llama a la API de Meta para enviar mensajes. No toca la base: recibe todo
 * resuelto y devuelve el resultado traducido, sin lanzar por errores de Meta ni de red.
 */

export const URL_GRAPH = 'https://graph.facebook.com/v27.0';
const ESPERA_MAXIMA_MS = 10_000;

export interface DestinoMeta {
  phoneNumberId: string;
  token: string;
}

/** A quién: por teléfono si se conoce; si no, por BSUID (Meta lo admite desde julio de 2026). */
export type Destinatario = { telefono: string } | { waUserId: string };

/** Meta responde 429 cuando se envía demasiado rápido, y 5xx cuando falla de su lado. */
const esReintentable = (estadoHttp: number) => estadoHttp === 429 || estadoHttp >= 500;

/**
 * Solo el código: el `message` de Meta puede repetir datos del destinatario, y esto se guarda
 * en la base y en el log.
 */
function detalleDeError(estadoHttp: number, cuerpo: unknown): string {
  const codigo = (cuerpo as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof codigo === 'number' ? `Meta respondió ${estadoHttp} (código ${codigo})` : `Meta respondió ${estadoHttp}`;
}

/**
 * Fallos de conexión en los que Meta no llegó a procesar la petición: no se pudo conectar, o la
 * conexión que Node reutiliza (keep-alive) ya estaba cerrada por el otro lado. Se reintentan una
 * vez, enseguida, sin volver a llamar a la IA. Un tiempo agotado NO está aquí: Meta pudo haber
 * recibido el mensaje y reintentarlo podría duplicarlo.
 *
 * Con ECONNRESET o UND_ERR_SOCKET queda un riesgo pequeño: que Meta lo procesara y la conexión se
 * cortara antes de responder. Se acepta: es raro, y lo común es el socket viejo, que Meta nunca leyó.
 */
const FALLOS_DE_CONEXION = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Qué falló, sin datos del destinatario: el código de red de Node, o "tiempo agotado". */
export function causaDelFallo(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'tiempo agotado';
  const causa = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof causa?.code === 'string' ? causa.code : 'desconocida';
}

/** POST a Meta con espera máxima y un reintento inmediato si la conexión falló (ver arriba). */
async function postAMeta(url: string, init: Omit<RequestInit, 'signal'>, pedir: typeof fetch): Promise<Response | { causa: string }> {
  for (let intento = 1; ; intento++) {
    try {
      return await pedir(url, { ...init, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
    } catch (error) {
      const causa = causaDelFallo(error);
      if (intento === 1 && FALLOS_DE_CONEXION.has(causa)) {
        logger.info({ causa }, 'Falló la conexión con Meta; se reintenta el envío una vez');
        continue;
      }
      return { causa };
    }
  }
}

const sinRespuesta = (causa: string): RespuestaMeta => ({ ok: false, reintentable: true, detalle: `Sin respuesta de Meta (${causa})` });

export async function enviarTextoAMeta(
  destino: DestinoMeta,
  destinatario: Destinatario,
  texto: string,
  pedir: typeof fetch = fetch,
): Promise<RespuestaMeta> {
  const respuesta = await postAMeta(
    `${URL_GRAPH}/${encodeURIComponent(destino.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${destino.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        // Con ambos, Meta usa `to`; por eso se envía solo uno.
        ...('telefono' in destinatario ? { to: destinatario.telefono } : { recipient: destinatario.waUserId }),
        type: 'text',
        text: { body: texto, preview_url: false },
      }),
    },
    pedir,
  );
  // Sin respuesta (tiempo agotado, o la conexión volvió a fallar) no se sabe si Meta lo recibió;
  // reintentar puede duplicarlo, y quien envía debe tenerlo en cuenta.
  if ('causa' in respuesta) return sinRespuesta(respuesta.causa);

  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    return { ok: false, reintentable: esReintentable(respuesta.status), detalle: detalleDeError(respuesta.status, cuerpo) };
  }
  const id = (cuerpo as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
  if (typeof id !== 'string' || id === '') {
    return { ok: false, reintentable: false, detalle: 'Meta respondió sin id de mensaje' };
  }
  return { ok: true, waMessageId: id };
}

/** Descarga de un archivo que envió el cliente (nota de voz o imagen), ya traducida. */
export type MediaDeMeta =
  | { ok: true; bytes: Buffer; mimeType: string }
  | { ok: false; reintentable: boolean; motivo: 'muy_grande' | 'no_disponible' | 'sin_respuesta'; detalle: string };

/**
 * Dos pasos: Graph devuelve la dirección temporal del archivo (vence en minutos) y luego se
 * descarga, las dos veces con el token de la cuenta. Si Meta informa un tamaño mayor a
 * `maxBytes` no se descarga; y si el archivo resulta más grande de lo informado, se descarta.
 */
export async function descargarMediaDeMeta(
  token: string,
  mediaId: string,
  maxBytes: number,
  pedir: typeof fetch = fetch,
): Promise<MediaDeMeta> {
  const autorizacion = { authorization: `Bearer ${token}` };
  let info: Response;
  try {
    info = await pedir(`${URL_GRAPH}/${encodeURIComponent(mediaId)}`, { headers: autorizacion, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  } catch {
    return { ok: false, reintentable: true, motivo: 'sin_respuesta', detalle: 'Sin respuesta de Meta' };
  }
  const datos = (await info.json().catch(() => null)) as { url?: unknown; mime_type?: unknown; file_size?: unknown } | null;
  if (!info.ok) {
    const reintentable = esReintentable(info.status);
    return { ok: false, reintentable, motivo: reintentable ? 'sin_respuesta' : 'no_disponible', detalle: detalleDeError(info.status, datos) };
  }
  const mimeType = typeof datos?.mime_type === 'string' ? datos.mime_type : '';
  if (typeof datos?.file_size === 'number' && datos.file_size > maxBytes) {
    return { ok: false, reintentable: false, motivo: 'muy_grande', detalle: `El archivo pesa ${datos.file_size} bytes` };
  }
  // El token solo se envía a una dirección HTTPS.
  if (typeof datos?.url !== 'string' || !datos.url.startsWith('https://')) {
    return { ok: false, reintentable: false, motivo: 'no_disponible', detalle: 'Meta respondió sin una dirección HTTPS' };
  }

  let archivo: Response;
  try {
    archivo = await pedir(datos.url, { headers: autorizacion, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  } catch {
    return { ok: false, reintentable: true, motivo: 'sin_respuesta', detalle: 'Sin respuesta al descargar de Meta' };
  }
  if (!archivo.ok) {
    const reintentable = esReintentable(archivo.status);
    return { ok: false, reintentable, motivo: reintentable ? 'sin_respuesta' : 'no_disponible', detalle: `Meta respondió ${archivo.status} al descargar` };
  }
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.length > maxBytes) return { ok: false, reintentable: false, motivo: 'muy_grande', detalle: `El archivo pesa ${bytes.length} bytes` };
  return { ok: true, bytes, mimeType };
}

export interface Plantilla {
  /** Nombre de la plantilla aprobada en la cuenta de WhatsApp Business del negocio. */
  nombre: string;
  idioma: string;
  /** Parámetros con nombre del cuerpo ({{cliente}}, {{motivo}}...). */
  parametros: Record<string, string>;
}

/**
 * Envía una plantilla aprobada a un teléfono. Las plantillas son lo único que WhatsApp deja enviar
 * fuera de la ventana de 24 horas, y Meta cobra cada una. No lanza: traduce el resultado.
 */
export async function enviarPlantillaAMeta(
  destino: DestinoMeta,
  telefono: string,
  plantilla: Plantilla,
  pedir: typeof fetch = fetch,
): Promise<RespuestaMeta> {
  const respuesta = await postAMeta(
    `${URL_GRAPH}/${encodeURIComponent(destino.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${destino.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'template',
        template: {
          name: plantilla.nombre,
          language: { code: plantilla.idioma },
          components: [
            {
              type: 'body',
              parameters: Object.entries(plantilla.parametros).map(([nombre, texto]) => ({ type: 'text', parameter_name: nombre, text: texto })),
            },
          ],
        },
      }),
    },
    pedir,
  );
  if ('causa' in respuesta) return sinRespuesta(respuesta.causa);
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    return { ok: false, reintentable: esReintentable(respuesta.status), detalle: detalleDeError(respuesta.status, cuerpo) };
  }
  const id = (cuerpo as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
  if (typeof id !== 'string' || id === '') return { ok: false, reintentable: false, detalle: 'Meta respondió sin id de mensaje' };
  return { ok: true, waMessageId: id };
}
