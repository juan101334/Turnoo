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

export async function enviarTextoAMeta(
  destino: DestinoMeta,
  telefono: string,
  texto: string,
  pedir: typeof fetch = fetch,
): Promise<RespuestaMeta> {
  let respuesta: Response;
  try {
    respuesta = await pedir(`${URL_GRAPH}/${encodeURIComponent(destino.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${destino.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'text',
        text: { body: texto, preview_url: false },
      }),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    });
  } catch {
    // Sin respuesta (red caída o tiempo agotado) no se sabe si Meta lo recibió; reintentar puede
    // duplicarlo, y quien envía debe tenerlo en cuenta.
    return { ok: false, reintentable: true, detalle: 'Sin respuesta de Meta' };
  }

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
