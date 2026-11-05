import { z } from 'zod';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { conNegocio } from '../../db/contexto.js';
import { buscarCuentaWhatsapp, type CuentaWhatsapp } from '../../db/previas.js';
import * as repositorioClientes from '../clientes/clientes.repositorio.js';
import { normalizarTelefono } from '../clientes/clientes.servicio.js';
import * as repositorio from './whatsapp.repositorio.js';
import type { MensajeEntrante, ResultadoEvento, TipoMensaje } from './whatsapp.tipos.js';

const MAX_NOMBRE = 100;

// El formato es de Meta y puede crecer: solo se exige lo que se usa y lo demás se ignora.
const esquemaEvento = z.object({
  object: z.string(),
  entry: z.array(z.object({ changes: z.array(z.unknown()) })),
});

const esquemaCambio = z.object({
  field: z.literal('messages'),
  value: z.object({
    metadata: z.object({ phone_number_id: z.string().min(1) }),
    contacts: z
      .array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() }))
      .optional()
      .catch(undefined),
    // Los `statuses` (entregado, leído) llegan aparte y se ignoran: aún no se envían mensajes.
    messages: z.array(z.unknown()).optional(),
  }),
});

const esquemaMensaje = z.object({
  id: z.string().min(1).max(1000),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional().catch(undefined),
  image: z.object({ id: z.string(), caption: z.string().optional() }).optional().catch(undefined),
  audio: z.object({ id: z.string() }).optional().catch(undefined),
});

/** PostgreSQL no admite el carácter nulo en un texto: rechazaría el mensaje en cada reenvío. */
const textoGuardable = (texto: string | undefined) => texto?.replaceAll('\u0000', '').trim() || null;

const TIPOS: Record<string, TipoMensaje> = { text: 'texto', audio: 'audio', image: 'imagen' };

/** La hora del mensaje según Meta; si no sirve o está en el futuro, la de llegada. */
function horaDeEnvio(timestamp: string, ahora: Date): Date {
  const milisegundos = Number(timestamp) * 1000;
  return Number.isFinite(milisegundos) && milisegundos > 0 && milisegundos < ahora.getTime()
    ? new Date(milisegundos)
    : ahora;
}

function aMensajeEntrante(
  crudo: z.infer<typeof esquemaMensaje>,
  nombres: Map<string, string>,
  ahora: Date,
): MensajeEntrante {
  return {
    waMessageId: crudo.id,
    telefono: normalizarTelefono(crudo.from),
    nombre: textoGuardable(nombres.get(crudo.from))?.slice(0, MAX_NOMBRE) ?? null,
    tipo: TIPOS[crudo.type] ?? 'otro',
    contenido: textoGuardable(crudo.type === 'text' ? crudo.text?.body : crudo.type === 'image' ? crudo.image?.caption : undefined),
    mediaId: (crudo.type === 'audio' ? crudo.audio?.id : crudo.type === 'image' ? crudo.image?.id : undefined) ?? null,
    enviadoEn: horaDeEnvio(crudo.timestamp, ahora),
  };
}

/** Cliente, conversación y mensaje van juntos: o queda todo o no queda nada y Meta lo reenvía. */
async function guardarMensaje(cuenta: CuentaWhatsapp, mensaje: MensajeEntrante): Promise<void> {
  const { negocioId, cuentaId } = cuenta;
  const nuevo = await conNegocio(negocioId, async (tx) => {
    const cliente = await repositorioClientes.obtenerOCrear(tx, negocioId, mensaje.telefono, mensaje.nombre);
    const conversacionId = await repositorio.obtenerOCrearConversacion(tx, negocioId, cliente.id, cuentaId);
    const guardado = await repositorio.guardarMensajeEntrante(tx, negocioId, conversacionId, mensaje);
    if (guardado) await repositorio.registrarMensajeDelCliente(tx, conversacionId, mensaje.enviadoEn);
    return guardado;
  });
  logger.info({ negocioId, tipo: mensaje.tipo, duplicado: !nuevo }, 'Mensaje de WhatsApp recibido');
}

async function procesarCambio(crudo: unknown, ahora: Date): Promise<number> {
  const cambio = esquemaCambio.safeParse(crudo);
  if (!cambio.success) return 0;
  const { metadata, contacts, messages = [] } = cambio.data.value;
  if (messages.length === 0) return 0;

  const cuenta = await buscarCuentaWhatsapp(metadata.phone_number_id);
  if (!cuenta) {
    logger.warn({ phoneNumberId: metadata.phone_number_id }, 'Webhook de una cuenta de WhatsApp desconocida o inactiva');
    return 0;
  }
  if (cuenta.estadoNegocio === 'suspendido') {
    logger.info({ negocioId: cuenta.negocioId }, 'Webhook ignorado: negocio suspendido');
    return 0;
  }

  const nombres = new Map(
    (contacts ?? []).flatMap((c) => (c.profile ? [[c.wa_id, c.profile.name] as const] : [])),
  );
  let fallidos = 0;
  for (const elemento of messages) {
    const crudoMensaje = esquemaMensaje.safeParse(elemento);
    let mensaje: MensajeEntrante;
    try {
      if (!crudoMensaje.success) throw new Error('Formato de mensaje no válido');
      mensaje = aMensajeEntrante(crudoMensaje.data, nombres, ahora);
    } catch {
      // Reenviarlo no lo arreglaría, así que no se pide a Meta que reintente.
      logger.warn({ negocioId: cuenta.negocioId }, 'Mensaje de WhatsApp descartado por datos no válidos');
      continue;
    }
    try {
      await guardarMensaje(cuenta, mensaje);
    } catch (error) {
      fallidos += 1;
      logger.error({ negocioId: cuenta.negocioId, fallo: errorParaLog(error) }, 'No se pudo guardar un mensaje de WhatsApp');
    }
  }
  return fallidos;
}

/**
 * Guarda los mensajes de un evento ya verificado. Un fallo no frena a los demás: se responde error y
 * Meta reenvía el evento completo, y lo ya guardado no se duplica.
 */
export async function procesarEvento(datos: unknown, ahora: Date = new Date()): Promise<ResultadoEvento> {
  const evento = esquemaEvento.safeParse(datos);
  if (!evento.success || evento.data.object !== 'whatsapp_business_account') return { fallidos: 0 };

  let fallidos = 0;
  for (const { changes } of evento.data.entry) {
    for (const cambio of changes) {
      try {
        fallidos += await procesarCambio(cambio, ahora);
      } catch (error) {
        fallidos += 1;
        logger.error({ fallo: errorParaLog(error) }, 'No se pudo procesar un webhook de WhatsApp');
      }
    }
  }
  return { fallidos };
}
