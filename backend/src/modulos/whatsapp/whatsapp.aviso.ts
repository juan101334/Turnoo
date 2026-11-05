import { errorParaLog, logger } from '../../compartido/logger.js';
import { conNegocio } from '../../db/contexto.js';
import { enviarMensaje, type DependenciasEnvio } from './whatsapp.envio.js';
import * as repositorio from './whatsapp.repositorio.js';
import type { AvisoPendiente } from './whatsapp.tipos.js';

/**
 * Aviso de tratamiento de datos (Ley 1581 de 2012).
 *
 * PENDIENTE DE REVISIÓN LEGAL: debe revisarlo un abogado antes de atender clientes reales.
 * Si cambia el texto, cambia también la versión: así cada cliente vuelve a recibirlo y
 * `consentimientos` registra qué versión aceptó cada uno.
 */
export const VERSION_AVISO = '2026-11-v1';

export function textoDelAviso(nombreNegocio: string): string {
  return (
    `Hola, te escribe el asistente virtual de ${nombreNegocio}. ` +
    `Para atenderte y agendar tus citas, ${nombreNegocio} trata tu nombre, tu número y lo que escribas aquí, con apoyo de Turnoo. ` +
    'Tus mensajes pasan por WhatsApp (Meta) y por OpenAI, el proveedor de inteligencia artificial, que pueden procesarlos fuera de Colombia. ' +
    'Puedes pedir en cualquier momento que borremos tus datos. ' +
    'Si sigues escribiendo, entendemos que aceptas este tratamiento. ¿En qué te podemos ayudar?'
  );
}

/** Si una reserva tiene más de esto, el envío anterior se dio por perdido y se puede volver a intentar. */
export const MINUTOS_RESERVA_AVISO = 2;

/**
 * Envía el aviso al cliente, si nadie más lo está enviando y aún no lo recibió en esta versión.
 * La hora que cuenta es la de la confirmación de Meta: un mensaje escrito mientras el aviso
 * viajaba no se toma como aceptación. Nunca lanza: un fallo se registra, se libera la reserva
 * y el siguiente mensaje del cliente lo vuelve a intentar.
 */
export async function enviarAvisoDeDatos(
  aviso: AvisoPendiente,
  dependencias: DependenciasEnvio & { reloj?: () => Date } = {},
): Promise<'enviado' | 'omitido' | 'fallido'> {
  const { negocioId, conversacionId, clienteId } = aviso;
  const reloj = dependencias.reloj ?? (() => new Date());
  try {
    const nombreNegocio = await conNegocio(negocioId, async (tx) => {
      const reservado = await repositorio.reservarAviso(tx, clienteId, VERSION_AVISO, reloj(), MINUTOS_RESERVA_AVISO);
      return reservado ? repositorio.nombreDelNegocio(tx, negocioId) : null;
    });
    if (nombreNegocio === null) return 'omitido';

    let resultado: Awaited<ReturnType<typeof enviarMensaje>> | null = null;
    try {
      resultado = await enviarMensaje(
        { negocioId, conversacionId, texto: textoDelAviso(nombreNegocio), emisor: 'sistema' },
        reloj(),
        dependencias,
      );
    } finally {
      const confirmadoEn = reloj();
      await conNegocio(negocioId, (tx) =>
        resultado?.estado === 'enviado'
          ? repositorio.marcarAvisoEnviado(tx, clienteId, VERSION_AVISO, confirmadoEn)
          : repositorio.liberarAviso(tx, clienteId),
      );
    }
    if (resultado.estado === 'enviado') {
      logger.info({ negocioId, version: VERSION_AVISO }, 'Aviso de datos enviado');
      return 'enviado';
    }
    return 'fallido';
  } catch (error) {
    logger.error({ negocioId, fallo: errorParaLog(error) }, 'No se pudo enviar el aviso de datos');
    return 'fallido';
  }
}
