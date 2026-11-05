import { errorParaLog, logger } from '../compartido/logger.js';
import { conNegocio, conSistema } from '../db/contexto.js';
import { enviarMensaje, type DependenciasEnvio } from '../modulos/whatsapp/whatsapp.envio.js';
import * as repositorio from './procesador.repositorio.js';
import type { Tiempos } from './procesador.repositorio.js';

/**
 * Procesador de conversaciones pendientes. El webhook solo guarda y marca la conversación; esto
 * la atiende después, fuera de la petición de Meta. Cruza negocios para encontrar lo pendiente,
 * por eso reserva con conSistema, y cada conversación se atiende con su propio negocio.
 *
 * Garantías:
 * - Una conversación se atiende de a una vez (reserva con SKIP LOCKED), en cualquier instancia.
 * - Los mensajes seguidos se juntan: se espera 5 s desde el último (o 30 s desde el primero).
 * - Si `atender` falla, se reintenta hasta 3 veces en pocos minutos; después se deriva a una
 *   persona con motivo `error` y se avisa al cliente.
 *
 * Quien implemente `atender` debe tolerar que se repita: un reintento vuelve a llamarlo con la
 * misma conversación, aunque la vez anterior hubiera hecho parte del trabajo.
 */

export interface ConversacionPendiente {
  negocioId: string;
  conversacionId: string;
  clienteId: string;
}

export type Atender = (conversacion: ConversacionPendiente) => Promise<void>;

export const TIEMPOS: Tiempos = { esperaMs: 5_000, esperaMaximaMs: 30_000, reservaMs: 5 * 60_000 };
/** Espera antes de cada reintento: el primero a los 30 s, luego 1 y 2 minutos. */
export const ESPERAS_REINTENTO_MS = [30_000, 60_000, 120_000];
export const LIMITE_POR_VUELTA = 10;
export const TEXTO_DERIVACION_POR_ERROR =
  'Tuvimos un problema para responderte. Una persona del negocio te va a contactar pronto.';

export interface ResultadoVuelta {
  atendidas: number;
  reintentos: number;
  derivadas: number;
  descartadas: number;
}

export interface OpcionesVuelta {
  atender: Atender;
  limite?: number;
  tiempos?: Tiempos;
  /** Para el aviso al cliente cuando se deriva. */
  envio?: DependenciasEnvio;
}

async function avisarDerivacion(c: ConversacionPendiente, ahora: Date, envio: DependenciasEnvio): Promise<void> {
  try {
    await enviarMensaje({ ...c, texto: TEXTO_DERIVACION_POR_ERROR, emisor: 'sistema' }, ahora, envio);
  } catch (error) {
    // Ya quedó derivada: si el aviso no sale, la persona del negocio igual la ve.
    logger.warn({ negocioId: c.negocioId, fallo: errorParaLog(error) }, 'No se pudo avisar al cliente de la derivación');
  }
}

async function atenderUna(
  reservada: repositorio.Reservada,
  ahora: Date,
  opciones: Required<Pick<OpcionesVuelta, 'atender'>> & { envio: DependenciasEnvio },
): Promise<'atendida' | 'reintento' | 'derivada'> {
  const { negocioId, conversacionId, clienteId, pendienteEn, intentos } = reservada;
  const conversacion = { negocioId, conversacionId, clienteId };
  try {
    await opciones.atender(conversacion);
    await conNegocio(negocioId, (tx) => repositorio.terminar(tx, conversacionId, pendienteEn));
    return 'atendida';
  } catch (error) {
    logger.error({ negocioId, intento: intentos + 1, fallo: errorParaLog(error) }, 'No se pudo atender una conversación');
    const espera = ESPERAS_REINTENTO_MS[intentos];
    if (espera !== undefined) {
      await conNegocio(negocioId, (tx) => repositorio.registrarFallo(tx, conversacionId, new Date(ahora.getTime() + espera)));
      return 'reintento';
    }
    await conNegocio(negocioId, (tx) => repositorio.derivarPorError(tx, negocioId, conversacionId, ahora));
    logger.warn({ negocioId }, 'Conversación derivada a una persona por fallos seguidos');
    await avisarDerivacion(conversacion, ahora, opciones.envio);
    return 'derivada';
  }
}

/** Una vuelta: descarta lo que ya no se responde, reserva lo listo y lo atiende en paralelo. */
export async function procesarPendientes(ahora: Date, opciones: OpcionesVuelta): Promise<ResultadoVuelta> {
  const { limite = LIMITE_POR_VUELTA, tiempos = TIEMPOS, envio = {} } = opciones;
  const { descartadas, reservadas } = await conSistema(async (tx) => ({
    descartadas: await repositorio.descartarPendientes(tx, ahora),
    reservadas: await repositorio.reservarPendientes(tx, ahora, limite, tiempos),
  }));

  const resultados = await Promise.all(
    reservadas.map((r) =>
      atenderUna(r, ahora, { atender: opciones.atender, envio }).catch((error) => {
        // Un fallo de la base al anotar el resultado: la reserva vence sola y se reintenta.
        logger.error({ negocioId: r.negocioId, fallo: errorParaLog(error) }, 'No se pudo anotar una conversación atendida');
        return 'reintento' as const;
      }),
    ),
  );
  const resultado: ResultadoVuelta = {
    atendidas: resultados.filter((r) => r === 'atendida').length,
    reintentos: resultados.filter((r) => r === 'reintento').length,
    derivadas: resultados.filter((r) => r === 'derivada').length,
    descartadas,
  };
  if (Object.values(resultado).some((n) => n > 0)) logger.info(resultado, 'Vuelta del procesador de conversaciones');
  return resultado;
}

export interface Procesador {
  /** Deja de programar vueltas y espera a que termine la que esté en curso. */
  detener: () => Promise<void>;
}

/**
 * Corre una vuelta cada `cadaMs`, contando desde que termina la anterior: dos vueltas de esta
 * instancia nunca se pisan. Una vuelta que falla se registra y no detiene las siguientes.
 */
export function iniciarProcesador({ cadaMs = 2_000, ...opciones }: OpcionesVuelta & { cadaMs?: number }): Procesador {
  let detenido = false;
  let temporizador: NodeJS.Timeout | undefined;
  let enCurso: Promise<void> = Promise.resolve();

  const vuelta = () => {
    enCurso = procesarPendientes(new Date(), opciones)
      .then(() => undefined)
      .catch((error) => logger.error({ fallo: errorParaLog(error) }, 'Falló una vuelta del procesador de conversaciones'))
      .then(() => {
        if (!detenido) temporizador = setTimeout(vuelta, cadaMs);
      });
  };
  vuelta();

  return {
    detener: () => {
      detenido = true;
      clearTimeout(temporizador);
      return enCurso;
    },
  };
}
