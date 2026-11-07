import { claveDeTokens, descifrar } from '../../compartido/cifrado.js';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { primerDiaDelMes } from '../../compartido/tiempo.js';
import { conNegocio, conSistema } from '../../db/contexto.js';
import { enviarPlantillaAMeta, type Plantilla } from '../whatsapp/whatsapp.meta.js';
import type { RespuestaMeta as RespuestaMetaPlantilla } from '../whatsapp/whatsapp.tipos.js';
import * as repositorio from './avisos.repositorio.js';

/**
 * Avisos al dueño por plantilla de WhatsApp, al teléfono de avisos del negocio:
 * - cuando la IA deriva una conversación (quién es, por qué, qué pidió y cómo contactarlo);
 * - cuando el negocio llega al 80% de las conversaciones de IA de su plan (una vez por mes).
 *
 * Los envía una tarea interna, a cualquier hora. Las plantillas deben estar creadas y aprobadas
 * en la cuenta de WhatsApp Business de CADA negocio, con estos nombres, en español.
 */

export const PLANTILLA_DERIVACION = 'turnoo_derivacion';
export const PLANTILLA_LIMITE = 'turnoo_limite_plan';
export const IDIOMA_PLANTILLAS = 'es_CO';
/** Sin teléfono de avisos, la derivación espera hasta esto a que el dueño lo configure. */
export const VIGENCIA_AVISO_MS = 24 * 3_600_000;
export const MAX_INTENTOS_AVISO = 3;
const RESERVA_MS = 2 * 60_000;
const LIMITE_POR_VUELTA = 20;

export const MOTIVOS: Record<string, string> = {
  sin_informacion: 'la IA no tenía esa información',
  cliente_pidio_humano: 'pidió hablar con una persona',
  fuera_de_tema: 'insistió en un tema que no es del negocio',
  sin_comprension: 'la IA no entendió lo que quería',
  limite_plan: 'el plan llegó al límite de conversaciones con IA',
  error: 'la IA falló varias veces seguidas',
};

/**
 * Meta rechaza parámetros con saltos de línea, tabulaciones o muchos espacios seguidos, y uno
 * vacío. El texto del cliente se deja en una línea, corto, y nunca vacío.
 */
export function parametro(texto: string | null | undefined, maximo = 200): string {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return '-';
  return [...limpio].length > maximo ? `${[...limpio].slice(0, maximo - 1).join('')}…` : limpio;
}

export function plantillaDeDerivacion(d: {
  motivo: string;
  detalle: string | null;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  horasModoHumano: number;
}): Plantilla {
  return {
    nombre: PLANTILLA_DERIVACION,
    idioma: IDIOMA_PLANTILLAS,
    parametros: {
      cliente: parametro(d.clienteNombre ?? 'Un cliente', 60),
      motivo: parametro(MOTIVOS[d.motivo] ?? d.motivo),
      detalle: parametro(d.detalle ?? 'no lo indicó'),
      contacto: d.clienteTelefono ? `+${d.clienteTelefono}` : 'no comparte su número; respóndele desde Turnoo',
      horas: String(d.horasModoHumano),
    },
  };
}

export interface DependenciasAvisos {
  pedir?: typeof fetch;
  clave?: () => Buffer;
}

async function enviar(
  negocioId: string,
  destino: { phoneNumberId: string; tokenCifrado: string },
  telefono: string,
  plantilla: Plantilla,
  { pedir, clave = claveDeTokens }: DependenciasAvisos,
): Promise<RespuestaMetaPlantilla> {
  let token: string;
  try {
    token = descifrar(destino.tokenCifrado, clave());
  } catch (error) {
    logger.error({ negocioId, fallo: errorParaLog(error) }, 'No se pudo leer el token para avisar al dueño');
    return { ok: false, reintentable: false, detalle: 'Token ilegible' };
  }
  return enviarPlantillaAMeta({ phoneNumberId: destino.phoneNumberId, token }, telefono, plantilla, pedir);
}

/** Una vuelta: vence lo viejo, reserva lo pendiente y avisa. Devuelve cuántos avisos salieron. */
export async function avisarDerivaciones(ahora: Date, deps: DependenciasAvisos = {}): Promise<number> {
  const { vencidas, reservadas } = await conSistema(async (tx) => ({
    vencidas: await repositorio.vencerAvisos(tx, ahora, VIGENCIA_AVISO_MS),
    reservadas: await repositorio.reservarDerivaciones(tx, ahora, LIMITE_POR_VUELTA, RESERVA_MS),
  }));
  if (vencidas > 0) logger.warn({ vencidas }, 'Derivaciones sin avisar al dueño en 24 horas');

  let enviados = 0;
  for (const { id, negocioId } of reservadas) {
    const datos = await conNegocio(negocioId, (tx) => repositorio.datosDelAviso(tx, id));
    if (!datos || !datos.telefonoAvisos) continue; // Cambió mientras tanto: la reserva vence sola.
    const respuesta = datos.cuentaActiva
      ? await enviar(negocioId, datos, datos.telefonoAvisos, plantillaDeDerivacion(datos), deps)
      : ({ ok: false, reintentable: false, detalle: 'La cuenta de WhatsApp está desactivada' } as const);

    await conNegocio(negocioId, async (tx) => {
      if (respuesta.ok) {
        await repositorio.marcarAvisada(tx, id, ahora);
        await repositorio.sumarPlantilla(tx, negocioId, primerDiaDelMes(ahora, datos.zonaHoraria));
      } else {
        await repositorio.registrarFalloDeAviso(tx, id, !respuesta.reintentable, MAX_INTENTOS_AVISO);
      }
    });
    if (respuesta.ok) enviados += 1;
    else logger.warn({ negocioId, detalle: respuesta.detalle, reintentable: respuesta.reintentable }, 'No se pudo avisar al dueño de una derivación');
  }
  return enviados;
}

/** Aviso del 80% del límite de conversaciones de IA, una vez por mes y por negocio. */
export async function avisarLimitesDelPlan(ahora: Date, deps: DependenciasAvisos = {}): Promise<number> {
  const porAvisar = await conSistema((tx) => repositorio.reservarAvisosDeLimite(tx, ahora, LIMITE_POR_VUELTA));
  let enviados = 0;
  for (const l of porAvisar) {
    const destino = await conNegocio(l.negocioId, (tx) => repositorio.destinoDelNegocio(tx, l.negocioId));
    const respuesta: RespuestaMetaPlantilla =
      destino?.telefonoAvisos
        ? await enviar(l.negocioId, destino, destino.telefonoAvisos, {
            nombre: PLANTILLA_LIMITE,
            idioma: IDIOMA_PLANTILLAS,
            parametros: { negocio: parametro(l.nombreNegocio, 60), usadas: String(l.usadas), limite: String(l.limite) },
          }, deps)
        : { ok: false, reintentable: false, detalle: 'Sin cuenta activa o sin teléfono de avisos' };

    await conNegocio(l.negocioId, async (tx) => {
      if (respuesta.ok) await repositorio.sumarPlantilla(tx, l.negocioId, l.periodo);
      // Pasajero: se reintenta en la vuelta siguiente. Definitivo: queda marcado y solo se registra.
      else if (respuesta.reintentable) await repositorio.liberarAvisoDeLimite(tx, l.negocioId, l.periodo);
    });
    if (respuesta.ok) enviados += 1;
    else logger.warn({ negocioId: l.negocioId, detalle: respuesta.detalle }, 'No se pudo avisar al dueño del límite del plan');
  }
  return enviados;
}
