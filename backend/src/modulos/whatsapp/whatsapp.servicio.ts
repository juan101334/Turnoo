import { z } from 'zod';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { conNegocio } from '../../db/contexto.js';
import { buscarCuentaWhatsapp, type CuentaWhatsapp } from '../../db/previas.js';
import * as repositorioClientes from '../clientes/clientes.repositorio.js';
import { normalizarTelefono } from '../clientes/clientes.servicio.js';
import * as repositorio from './whatsapp.repositorio.js';
import { VERSION_AVISO } from './whatsapp.aviso.js';
import type { AvisoPendiente, MensajeEntrante, ResultadoEvento, TipoMensaje } from './whatsapp.tipos.js';

const MAX_NOMBRE = 100;
/** BSUID: indicativo ISO del país, un punto y hasta 128 letras o números (ej. CO.1349120865530274). */
const FORMATO_BSUID = /^[A-Z]{2}\.[A-Za-z0-9]{1,128}$/;

// El formato es de Meta y puede crecer: solo se exige lo que se usa y lo demás se ignora.
const esquemaEvento = z.object({
  object: z.string(),
  entry: z.array(z.object({ changes: z.array(z.unknown()) })),
});

const esquemaCambio = z.object({
  field: z.literal('messages'),
  value: z.object({
    metadata: z.object({ phone_number_id: z.string().min(1) }),
    // Con nombre de usuario de WhatsApp, `wa_id` puede faltar; `user_id` (el BSUID) llega siempre.
    contacts: z
      .array(
        z.object({
          wa_id: z.string().optional(),
          user_id: z.string().optional(),
          profile: z.object({ name: z.string() }).optional(),
        }),
      )
      .optional()
      .catch(undefined),
    // Los `statuses` (entregado, leído) llegan aparte y se ignoran: aún no se envían mensajes.
    messages: z.array(z.unknown()).optional(),
  }),
});

const esquemaMensaje = z.object({
  id: z.string().min(1).max(1000),
  // `from` (teléfono) puede faltar si la persona activó su nombre de usuario; `from_user_id` es su BSUID.
  from: z.string().optional(),
  from_user_id: z.string().optional(),
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

/** Un BSUID con otro formato se ignora; un teléfono inválido también, si hay BSUID. */
function identidad(crudo: z.infer<typeof esquemaMensaje>): { telefono: string | null; waUserId: string | null } {
  const waUserId = crudo.from_user_id !== undefined && FORMATO_BSUID.test(crudo.from_user_id) ? crudo.from_user_id : null;
  let telefono: string | null = null;
  if (crudo.from !== undefined) {
    try {
      telefono = normalizarTelefono(crudo.from);
    } catch (error) {
      if (waUserId === null) throw error;
    }
  }
  if (telefono === null && waUserId === null) throw new Error('Mensaje sin teléfono ni BSUID');
  return { telefono, waUserId };
}

function aMensajeEntrante(
  crudo: z.infer<typeof esquemaMensaje>,
  nombres: Map<string, string>,
  ahora: Date,
): MensajeEntrante {
  const { telefono, waUserId } = identidad(crudo);
  const nombre = (waUserId !== null ? nombres.get(waUserId) : undefined) ?? (crudo.from !== undefined ? nombres.get(crudo.from) : undefined);
  return {
    waMessageId: crudo.id,
    telefono,
    waUserId,
    nombre: textoGuardable(nombre)?.slice(0, MAX_NOMBRE) ?? null,
    tipo: TIPOS[crudo.type] ?? 'otro',
    contenido: textoGuardable(crudo.type === 'text' ? crudo.text?.body : crudo.type === 'image' ? crudo.image?.caption : undefined),
    mediaId: (crudo.type === 'audio' ? crudo.audio?.id : crudo.type === 'image' ? crudo.image?.id : undefined) ?? null,
    enviadoEn: horaDeEnvio(crudo.timestamp, ahora),
  };
}

/**
 * Cliente, conversación, mensaje y consentimiento van juntos: o queda todo o no queda nada y Meta
 * lo reenvía. Devuelve el aviso de datos que hay que enviar, si este cliente aún no lo recibió.
 */
async function guardarMensaje(cuenta: CuentaWhatsapp, mensaje: MensajeEntrante): Promise<AvisoPendiente | null> {
  const { negocioId, cuentaId } = cuenta;
  const { nuevo, aviso } = await conNegocio(negocioId, async (tx) => {
    const cliente = await repositorioClientes.obtenerOCrearPorWhatsapp(
      tx,
      negocioId,
      { telefono: mensaje.telefono, waUserId: mensaje.waUserId },
      mensaje.nombre,
    );
    const conversacionId = await repositorio.obtenerOCrearConversacion(tx, negocioId, cliente.id, cuentaId);
    const guardado = await repositorio.guardarMensajeEntrante(tx, negocioId, conversacionId, mensaje);
    // Un reenvío de Meta ya se evaluó la primera vez.
    if (!guardado) return { nuevo: false, aviso: null };
    await repositorio.registrarMensajeDelCliente(tx, conversacionId, mensaje.enviadoEn);
    const consentimiento = await repositorio.evaluarConsentimiento(tx, negocioId, cliente.id, VERSION_AVISO, mensaje);
    return {
      nuevo: true,
      aviso: consentimiento === 'requiere_aviso' ? { negocioId, conversacionId, clienteId: cliente.id } : null,
    };
  });
  logger.info({ negocioId, tipo: mensaje.tipo, duplicado: !nuevo }, 'Mensaje de WhatsApp recibido');
  return aviso;
}

async function procesarCambio(crudo: unknown, ahora: Date): Promise<ResultadoEvento> {
  const sinNada: ResultadoEvento = { fallidos: 0, avisos: [] };
  const cambio = esquemaCambio.safeParse(crudo);
  if (!cambio.success) return sinNada;
  const { metadata, contacts, messages = [] } = cambio.data.value;
  if (messages.length === 0) return sinNada;

  const cuenta = await buscarCuentaWhatsapp(metadata.phone_number_id);
  if (!cuenta) {
    logger.warn({ phoneNumberId: metadata.phone_number_id }, 'Webhook de una cuenta de WhatsApp desconocida o inactiva');
    return sinNada;
  }
  if (cuenta.estadoNegocio === 'suspendido') {
    logger.info({ negocioId: cuenta.negocioId }, 'Webhook ignorado: negocio suspendido');
    return sinNada;
  }

  // El nombre de perfil se busca por BSUID o por teléfono, según lo que traiga el contacto.
  const nombres = new Map(
    (contacts ?? []).flatMap((c) =>
      c.profile ? [c.user_id, c.wa_id].flatMap((clave) => (clave ? [[clave, c.profile!.name] as const] : [])) : [],
    ),
  );
  let fallidos = 0;
  const avisos: AvisoPendiente[] = [];
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
      const aviso = await guardarMensaje(cuenta, mensaje);
      // Los repetidos de un mismo cliente se quitan en procesarEvento.
      if (aviso) avisos.push(aviso);
    } catch (error) {
      fallidos += 1;
      logger.error({ negocioId: cuenta.negocioId, fallo: errorParaLog(error) }, 'No se pudo guardar un mensaje de WhatsApp');
    }
  }
  return { fallidos, avisos };
}

/**
 * Guarda los mensajes de un evento ya verificado. Un fallo no frena a los demás: se responde error y
 * Meta reenvía el evento completo, y lo ya guardado no se duplica.
 */
export async function procesarEvento(datos: unknown, ahora: Date = new Date()): Promise<ResultadoEvento> {
  const evento = esquemaEvento.safeParse(datos);
  if (!evento.success || evento.data.object !== 'whatsapp_business_account') return { fallidos: 0, avisos: [] };

  let fallidos = 0;
  const avisos: AvisoPendiente[] = [];
  for (const { changes } of evento.data.entry) {
    for (const cambio of changes) {
      try {
        const resultado = await procesarCambio(cambio, ahora);
        fallidos += resultado.fallidos;
        for (const aviso of resultado.avisos) {
          if (!avisos.some((a) => a.clienteId === aviso.clienteId)) avisos.push(aviso);
        }
      } catch (error) {
        fallidos += 1;
        logger.error({ fallo: errorParaLog(error) }, 'No se pudo procesar un webhook de WhatsApp');
      }
    }
  }
  return { fallidos, avisos };
}
