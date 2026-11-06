import { createHash } from 'node:crypto';
import { NoConfigurado } from '../../compartido/errores.js';
import { entorno } from '../../config/entorno.js';

/**
 * ÚNICO archivo que habla con el proveedor de IA (OpenAI): las respuestas (Responses API) y la
 * transcripción de notas de voz. Cambiar de proveedor
 * es reescribir este archivo y nada más: el resto del código solo conoce los tipos de aquí.
 *
 * - `store: false`: OpenAI no guarda la conversación; en cada llamada se le manda todo.
 * - Con `store: false`, los items de razonamiento llegan cifrados y se devuelven tal cual en la
 *   llamada siguiente, junto con las llamadas a funciones y sus resultados.
 * - `strict: true` en cada función: los argumentos siempre cumplen el esquema (salidas
 *   estructuradas). Igual se validan del lado nuestro, porque es texto que genera el modelo.
 * - La clave nunca se registra ni se devuelve en un error.
 */

export const URL_RESPUESTAS = 'https://api.openai.com/v1/responses';
/** Por llamada. Varias llamadas seguidas deben caber en la reserva de 5 minutos del procesador. */
const ESPERA_MAXIMA_MS = 25_000;
/** Incluye los tokens de razonamiento. Una respuesta de WhatsApp es corta. */
const MAX_TOKENS_SALIDA = 2_000;

export interface Herramienta {
  nombre: string;
  descripcion: string;
  /** Esquema JSON en modo estricto: additionalProperties false y todo en required. */
  parametros: Record<string, unknown>;
}

/** Un item de la entrada: un mensaje, o algo que el modelo devolvió y se le vuelve a pasar. */
export type ItemEntrada =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  /** Items de salida del modelo (razonamiento, llamadas, mensajes), tal como llegaron. */
  | Record<string, unknown>;

export interface LlamadaAFuncion {
  callId: string;
  nombre: string;
  /** JSON en texto, como lo generó el modelo. */
  argumentos: string;
}

export interface UsoDeTokens {
  entrada: number;
  entradaEnCache: number;
  salida: number;
  razonamiento: number;
}

export interface RespuestaDelModelo {
  /** Para volver a enviarlos en la llamada siguiente. */
  salida: Record<string, unknown>[];
  llamadas: LlamadaAFuncion[];
  /** El texto para el cliente; vacío si el modelo solo pidió funciones. */
  texto: string;
  uso: UsoDeTokens;
}

export interface PeticionAlModelo {
  instrucciones: string;
  entrada: ItemEntrada[];
  herramientas: Herramienta[];
  /** Identifica al cliente ante OpenAI sin datos personales (se envía un hash). */
  identificador: string;
}

export interface DependenciasModelo {
  pedir?: typeof fetch;
  clave?: () => string;
  modelo?: string;
  esfuerzo?: string;
}

/** Falló la llamada al modelo. El procesador reintenta y, si sigue fallando, deriva. */
export class ErrorDelModelo extends Error {
  constructor(
    mensaje: string,
    readonly reintentable: boolean,
  ) {
    super(mensaje);
    this.name = 'ErrorDelModelo';
  }
}

function claveDeOpenAI(): string {
  if (!entorno.OPENAI_API_KEY) throw new NoConfigurado('Falta OPENAI_API_KEY: la IA no está configurada');
  return entorno.OPENAI_API_KEY;
}

const numero = (valor: unknown) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0);

function leerUso(cuerpo: Record<string, unknown>): UsoDeTokens {
  const uso = (cuerpo.usage ?? {}) as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
    output_tokens_details?: { reasoning_tokens?: unknown };
  };
  return {
    entrada: numero(uso.input_tokens),
    entradaEnCache: numero(uso.input_tokens_details?.cached_tokens),
    salida: numero(uso.output_tokens),
    razonamiento: numero(uso.output_tokens_details?.reasoning_tokens),
  };
}

/** Solo el estado y el código: el mensaje de error podría repetir parte de lo que se envió. */
function detalleDeError(estadoHttp: number, cuerpo: unknown): string {
  const codigo = (cuerpo as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof codigo === 'string' ? `OpenAI respondió ${estadoHttp} (${codigo})` : `OpenAI respondió ${estadoHttp}`;
}

/** 429 por ritmo y 5xx se reintentan; 429 por saldo o cuota agotados no, porque no se arregla solo. */
function esReintentable(estadoHttp: number, cuerpo: unknown): boolean {
  const codigo = (cuerpo as { error?: { code?: unknown } } | null)?.error?.code;
  if (estadoHttp === 429) return codigo !== 'insufficient_quota' && !/spend|balance|usage_limit/.test(String(codigo));
  return estadoHttp >= 500;
}

export async function llamarModelo(
  peticion: PeticionAlModelo,
  {
    pedir = fetch,
    clave = claveDeOpenAI,
    modelo = entorno.OPENAI_MODELO,
    esfuerzo = entorno.OPENAI_ESFUERZO,
  }: DependenciasModelo = {},
): Promise<RespuestaDelModelo> {
  const cuerpoPeticion = {
    model: modelo,
    instructions: peticion.instrucciones,
    input: peticion.entrada,
    tools: peticion.herramientas.map((h) => ({
      type: 'function',
      name: h.nombre,
      description: h.descripcion,
      parameters: h.parametros,
      strict: true,
    })),
    tool_choice: 'auto',
    // De a una función por vez: el modelo ve el resultado antes de decidir lo siguiente.
    parallel_tool_calls: false,
    store: false,
    reasoning: { effort: esfuerzo },
    max_output_tokens: MAX_TOKENS_SALIDA,
    safety_identifier: createHash('sha256').update(peticion.identificador).digest('hex').slice(0, 32),
  };

  let respuesta: Response;
  try {
    respuesta = await pedir(URL_RESPUESTAS, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave()}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpoPeticion),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    });
  } catch (error) {
    if (error instanceof NoConfigurado) throw error;
    throw new ErrorDelModelo('Sin respuesta de OpenAI', true);
  }

  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorDelModelo(detalleDeError(respuesta.status, cuerpo), esReintentable(respuesta.status, cuerpo));
  }
  if (cuerpo === null || typeof cuerpo !== 'object') throw new ErrorDelModelo('OpenAI respondió sin JSON', true);
  const datos = cuerpo as Record<string, unknown>;
  if (datos.status !== 'completed') {
    const motivo = (datos.incomplete_details as { reason?: unknown } | null)?.reason;
    throw new ErrorDelModelo(`La respuesta quedó ${String(datos.status)}${motivo ? ` (${String(motivo)})` : ''}`, true);
  }

  const salida = Array.isArray(datos.output) ? (datos.output as Record<string, unknown>[]) : [];
  const llamadas: LlamadaAFuncion[] = [];
  const textos: string[] = [];
  for (const item of salida) {
    if (item.type === 'function_call') {
      if (typeof item.call_id !== 'string' || typeof item.name !== 'string' || typeof item.arguments !== 'string') {
        throw new ErrorDelModelo('Llamada a función mal formada', true);
      }
      llamadas.push({ callId: item.call_id, nombre: item.name, argumentos: item.arguments });
    } else if (item.type === 'message' && Array.isArray(item.content)) {
      for (const parte of item.content as { type?: unknown; text?: unknown }[]) {
        if (parte.type === 'refusal') throw new ErrorDelModelo('El modelo se negó a responder', false);
        if (parte.type === 'output_text' && typeof parte.text === 'string') textos.push(parte.text);
      }
    }
  }
  return { salida, llamadas, texto: textos.join('\n').trim(), uso: leerUso(datos) };
}

// ---------------------------------------------------------------------
// Notas de voz a texto (POST /v1/audio/transcriptions)
// ---------------------------------------------------------------------

export const URL_TRANSCRIPCIONES = 'https://api.openai.com/v1/audio/transcriptions';
const ESPERA_MAXIMA_AUDIO_MS = 30_000;

export interface Transcripcion {
  texto: string;
  /** Lo que factura OpenAI (usage.seconds). 0 si no lo informa. */
  segundos: number;
}

export interface DependenciasAudio {
  pedir?: typeof fetch;
  clave?: () => string;
  modelo?: string;
}

/**
 * Transcribe un audio en español. Se probó con una nota de voz real de WhatsApp (ogg/opus): la
 * API la acepta tal cual, aunque ogg no aparece en su lista de formatos.
 */
export async function transcribirAudio(
  audio: { bytes: Buffer; mimeType: string; nombreArchivo: string },
  { pedir = fetch, clave = claveDeOpenAI, modelo = entorno.OPENAI_MODELO_AUDIO }: DependenciasAudio = {},
): Promise<Transcripcion> {
  const formulario = new FormData();
  formulario.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }), audio.nombreArchivo);
  formulario.append('model', modelo);
  formulario.append('languages[]', 'es');

  let respuesta: Response;
  try {
    respuesta = await pedir(URL_TRANSCRIPCIONES, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave()}` },
      body: formulario,
      signal: AbortSignal.timeout(ESPERA_MAXIMA_AUDIO_MS),
    });
  } catch (error) {
    if (error instanceof NoConfigurado) throw error;
    throw new ErrorDelModelo('Sin respuesta de OpenAI al transcribir', true);
  }
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorDelModelo(detalleDeError(respuesta.status, cuerpo), esReintentable(respuesta.status, cuerpo));
  }
  const datos = (cuerpo ?? {}) as { text?: unknown; usage?: { seconds?: unknown } };
  if (typeof datos.text !== 'string') throw new ErrorDelModelo('OpenAI respondió sin texto de transcripción', true);
  return { texto: datos.text.trim(), segundos: Math.ceil(numero(datos.usage?.seconds)) };
}

