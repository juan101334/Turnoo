import { claveDeTokens, descifrar, TextoCifradoInvalido } from '../../compartido/cifrado.js';
import { Conflicto, DatosInvalidos, NoEncontrado } from '../../compartido/errores.js';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { sumarMinutos } from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import { exigirNegocioOperativo } from '../negocios/negocios.reglas.js';
import { enviarTextoAMeta, type DestinoMeta } from './whatsapp.meta.js';
import * as repositorio from './whatsapp.repositorio.js';
import type { EmisorSaliente, ResultadoEnvio } from './whatsapp.tipos.js';

/** El máximo de Meta para el cuerpo de un mensaje de texto. */
export const MAX_TEXTO = 4096;
/** Fuera de esta ventana desde el último mensaje del cliente, WhatsApp solo admite plantillas. */
const MINUTOS_VENTANA = 24 * 60;

export interface EntradaEnvio {
  negocioId: string;
  conversacionId: string;
  texto: string;
  emisor: EmisorSaliente;
}

export interface DependenciasEnvio {
  pedir?: typeof fetch;
  clave?: () => Buffer;
}

function textoValido(texto: string): string {
  const limpio = texto.replaceAll('\u0000', '').trim();
  if (limpio === '') throw new DatosInvalidos('El mensaje está vacío');
  if (limpio.length > MAX_TEXTO) throw new DatosInvalidos(`El mensaje supera los ${MAX_TEXTO} caracteres`);
  return limpio;
}

/**
 * Envía un texto a la persona de una conversación y lo deja guardado como mensaje saliente.
 *
 * Tres pasos, para no tener una transacción abierta mientras se espera a Meta:
 * 1. Valida y guarda el mensaje sin estado de entrega (si el proceso cae, queda el rastro).
 * 2. Lo envía a Meta.
 * 3. Anota el resultado: `enviado` con su id de WhatsApp, o `fallido`.
 *
 * Lanza un error del dominio si el envío no está permitido (sin guardar nada). Un fallo de Meta
 * no lanza: devuelve `fallido` y si conviene reintentar.
 */
export async function enviarMensaje(
  entrada: EntradaEnvio,
  ahora: Date = new Date(),
  { pedir = fetch, clave = claveDeTokens }: DependenciasEnvio = {},
): Promise<ResultadoEnvio> {
  const { negocioId, conversacionId, emisor } = entrada;
  if (!esUuid(negocioId) || !esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  const texto = textoValido(entrada.texto);

  const { mensajeId, destino, telefono } = await conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const conversacion = await repositorio.destinoDeConversacion(tx, conversacionId);
    if (!conversacion) throw new NoEncontrado('La conversación');
    if (!conversacion.cuentaActiva) throw new Conflicto('La cuenta de WhatsApp del negocio está desactivada');
    if (conversacion.telefono === null) throw new Conflicto('El cliente fue anonimizado: ya no se le puede escribir');
    const ventanaAbierta =
      conversacion.ultimoMensajeClienteEn !== null &&
      sumarMinutos(conversacion.ultimoMensajeClienteEn, MINUTOS_VENTANA) > ahora;
    if (!ventanaAbierta) {
      throw new Conflicto('Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede usar una plantilla');
    }

    let token: string;
    try {
      token = descifrar(conversacion.tokenCifrado, clave());
    } catch (error) {
      if (!(error instanceof TextoCifradoInvalido)) throw error;
      throw new Conflicto('El token de la cuenta de WhatsApp no se puede leer: vuelve a registrarlo');
    }

    const id = await repositorio.guardarMensajeSaliente(tx, negocioId, conversacionId, emisor, texto, ahora);
    const destinoMeta: DestinoMeta = { phoneNumberId: conversacion.phoneNumberId, token };
    return { mensajeId: id, destino: destinoMeta, telefono: conversacion.telefono };
  });

  const respuesta = await enviarTextoAMeta(destino, telefono, texto, pedir);

  try {
    await conNegocio(negocioId, (tx) =>
      repositorio.registrarResultadoEnvio(tx, mensajeId, respuesta.ok ? { waMessageId: respuesta.waMessageId } : { error: respuesta.detalle }),
    );
  } catch (error) {
    // El envío ya ocurrió: lanzar aquí invitaría a reintentar y la persona lo recibiría dos veces.
    // El mensaje queda sin estado de entrega, que es justo lo que indica "no se sabe".
    logger.error({ negocioId, mensajeId, fallo: errorParaLog(error) }, 'No se pudo anotar el resultado de un envío de WhatsApp');
  }

  if (!respuesta.ok) {
    logger.warn({ negocioId, mensajeId, detalle: respuesta.detalle, reintentable: respuesta.reintentable }, 'No se pudo enviar un mensaje de WhatsApp');
    return { estado: 'fallido', mensajeId, reintentable: respuesta.reintentable };
  }
  logger.info({ negocioId, mensajeId, emisor }, 'Mensaje de WhatsApp enviado');
  return { estado: 'enviado', mensajeId, waMessageId: respuesta.waMessageId };
}
