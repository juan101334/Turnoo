import { logger } from '../../compartido/logger.js';
import { primerDiaDelMes } from '../../compartido/tiempo.js';
import { conNegocio, conSistema } from '../../db/contexto.js';
import { sumarPlantilla } from '../uso/uso.repositorio.js';
import type { Plantilla } from '../whatsapp/whatsapp.meta.js';
import {
  enviarPlantilla as enviar,
  IDIOMA_PLANTILLAS,
  parametro,
  type DependenciasPlantillas,
} from '../whatsapp/whatsapp.plantillas.js';
import type { RespuestaMeta as RespuestaMetaPlantilla } from '../whatsapp/whatsapp.tipos.js';
import * as repositorio from './avisos.repositorio.js';

export { IDIOMA_PLANTILLAS, parametro };

/**
 * Avisos al dueño por plantilla de WhatsApp, al teléfono de avisos del negocio:
 * - cuando la IA deriva una conversación (quién es, por qué, qué pidió y cómo contactarlo);
 * - cuando el negocio llega al 80% de las conversaciones de IA de su plan (una vez por mes).
 *
 * Los envía una tarea interna, a cualquier hora. Las plantillas deben estar creadas y aprobadas
 * en la cuenta de WhatsApp Business de CADA negocio, con estos nombres, en Spanish (COL).
 */

export const PLANTILLA_DERIVACION = 'turnoo_derivacion';
export const PLANTILLA_LIMITE = 'turnoo_limite_plan';
/** Sin teléfono de avisos, la derivación espera hasta esto a que el dueño lo configure. */
export const VIGENCIA_AVISO_MS = 24 * 3_600_000;
export const MAX_INTENTOS_AVISO = 3;
const RESERVA_MS = 2 * 60_000;
const LIMITE_POR_VUELTA = 20;

/**
 * Cada dato va en su propia línea de la plantilla ("*Motivo:* {{motivo}}"): empieza en
 * mayúscula, no termina en punto y habla del "asistente", que es lo que ve el dueño.
 */
export const MOTIVOS: Record<string, string> = {
  sin_informacion: 'El asistente no tenía esa información',
  cliente_pidio_humano: 'Pidió hablar con una persona',
  fuera_de_tema: 'Insistió en un tema que no es del negocio',
  sin_comprension: 'El asistente no entendió lo que quería',
  limite_plan: 'El plan llegó al límite de conversaciones con el asistente',
  error: 'El asistente falló varias veces seguidas',
};

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
      cliente: parametro(d.clienteNombre ?? 'Sin nombre', 60),
      motivo: parametro(MOTIVOS[d.motivo] ?? d.motivo),
      detalle: parametro(d.detalle ?? 'No lo indicó'),
      contacto: d.clienteTelefono ? `+${d.clienteTelefono}` : 'No comparte su número. Respóndele desde Turnoo',
      horas: String(d.horasModoHumano),
    },
  };
}

export type DependenciasAvisos = DependenciasPlantillas;

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
        await sumarPlantilla(tx, negocioId, primerDiaDelMes(ahora, datos.zonaHoraria));
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
      if (respuesta.ok) await sumarPlantilla(tx, l.negocioId, l.periodo);
      // Pasajero: se reintenta en la vuelta siguiente. Definitivo: queda marcado y solo se registra.
      else if (respuesta.reintentable) await repositorio.liberarAvisoDeLimite(tx, l.negocioId, l.periodo);
    });
    if (respuesta.ok) enviados += 1;
    else logger.warn({ negocioId: l.negocioId, detalle: respuesta.detalle }, 'No se pudo avisar al dueño del límite del plan');
  }
  return enviados;
}
