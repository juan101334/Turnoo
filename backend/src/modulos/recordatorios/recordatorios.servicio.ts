import { logger } from '../../compartido/logger.js';
import {
  alHorarioPermitido,
  dentroDeHorarioLocal,
  fechaLocal,
  horaEnPalabras,
  primerDiaDelMes,
  sumarMinutos,
} from '../../compartido/tiempo.js';
import { conNegocio, conSistema } from '../../db/contexto.js';
import { fechaEnPalabras } from '../ia/ia.instrucciones.js';
import { sumarPlantilla } from '../uso/uso.repositorio.js';
import type { Plantilla } from '../whatsapp/whatsapp.meta.js';
import { enviarPlantilla, IDIOMA_PLANTILLAS, parametro, type DependenciasPlantillas } from '../whatsapp/whatsapp.plantillas.js';
import type { RespuestaMeta } from '../whatsapp/whatsapp.tipos.js';
import * as repositorio from './recordatorios.repositorio.js';

/**
 * Recordatorio de la cita por plantilla de WhatsApp, uno por cita (ARQUITECTURA, sección 3):
 * - Momento ideal: `horas_recordatorio` antes (11 h por defecto). Si cae fuera del horario
 *   permitido del negocio (07:00 a 21:00 por defecto), se lleva al borde más cercano.
 * - Si la cita se agendó o reprogramó después del momento ideal, no se envía: el cliente
 *   acaba de agendar y ya tiene la confirmación en el chat.
 * - Solo a clientes que aceptaron el aviso de datos y que comparten su teléfono.
 * - Si al recibirlo el cliente responde, se abre la ventana de 24 h y lo atiende la IA.
 *
 * La plantilla debe estar aprobada en la cuenta de WhatsApp Business de cada negocio.
 */

export const PLANTILLA_RECORDATORIO = 'turnoo_recordatorio_cita';
/** Más cerca de la cita que esto, un recordatorio ya no sirve: queda vencido. */
export const MARGEN_MINIMO_MS = 30 * 60_000;
export const MAX_INTENTOS_RECORDATORIO = 3;
/** Si la tarea pasó justo después del momento (al cierre del horario), igual se envía. */
const TOLERANCIA_MS = 5 * 60_000;
const RESERVA_MS = 2 * 60_000;
const CANDIDATAS_POR_VUELTA = 500;
const ENVIOS_POR_VUELTA = 20;

export type Decision = 'esperar' | 'enviar' | 'agendada_tarde';

/** Qué hacer ahora con una cita pendiente de recordatorio. Sin base de datos: se prueba sola. */
export function decidir(c: repositorio.Candidata, ahora: Date): Decision {
  const ideal = sumarMinutos(c.inicio, -c.horasRecordatorio * 60);
  if (c.programadaEn > ideal) return 'agendada_tarde';
  const limite = new Date(c.inicio.getTime() - MARGEN_MINIMO_MS);
  const momento = alHorarioPermitido(ideal, c.noAntesDe, c.noDespuesDe, c.zonaHoraria, limite);
  if (ahora < momento || ahora >= limite) return 'esperar';
  const aTiempo = ahora.getTime() - momento.getTime() <= TOLERANCIA_MS;
  return aTiempo || dentroDeHorarioLocal(ahora, c.noAntesDe, c.noDespuesDe, c.zonaHoraria) ? 'enviar' : 'esperar';
}

/** 'corte y barba' o 'corte, barba y cejas'. */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? 'tu servicio';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

export function plantillaDeRecordatorio(d: {
  inicio: Date;
  zonaHoraria: string;
  negocioNombre: string;
  profesionalNombre: string;
  servicios: string[];
  clienteNombre: string | null;
}): Plantilla {
  return {
    nombre: PLANTILLA_RECORDATORIO,
    idioma: IDIOMA_PLANTILLAS,
    parametros: {
      cliente: parametro(d.clienteNombre ?? 'cliente', 60),
      negocio: parametro(d.negocioNombre, 60),
      fecha: fechaEnPalabras(fechaLocal(d.inicio, d.zonaHoraria)),
      hora: horaEnPalabras(d.inicio, d.zonaHoraria),
      profesional: parametro(d.profesionalNombre, 60),
      servicios: parametro(enumerar(d.servicios), 150),
    },
  };
}

export type DependenciasRecordatorios = DependenciasPlantillas;

/** Una vuelta: vence lo que ya no alcanza, decide qué toca y envía. Devuelve cuántos salieron. */
export async function enviarRecordatorios(ahora: Date, deps: DependenciasRecordatorios = {}): Promise<number> {
  const { vencidos, porEnviar } = await conSistema(async (tx) => {
    const vencidos = await repositorio.vencerRecordatorios(tx, ahora, MARGEN_MINIMO_MS);
    const lista = await repositorio.candidatas(tx, ahora, CANDIDATAS_POR_VUELTA);
    const tarde = lista.filter((c) => decidir(c, ahora) === 'agendada_tarde').map((c) => c.id);
    if (tarde.length > 0) await repositorio.omitir(tx, tarde, 'agendada_tarde');
    const tocan = lista.filter((c) => decidir(c, ahora) === 'enviar').map((c) => c.id).slice(0, ENVIOS_POR_VUELTA);
    return { vencidos, porEnviar: tocan.length > 0 ? await repositorio.reservar(tx, tocan, ahora, RESERVA_MS) : [] };
  });
  if (vencidos > 0) logger.warn({ vencidos }, 'Citas que empezaron sin recordatorio');

  let enviados = 0;
  for (const { id, negocioId } of porEnviar) {
    const datos = await conNegocio(negocioId, (tx) => repositorio.datosDelRecordatorio(tx, id));
    if (!datos) continue; // Se canceló o cambió mientras tanto: la reserva vence sola.
    if (!datos.consintio || !datos.clienteTelefono) {
      await conNegocio(negocioId, (tx) => repositorio.omitir(tx, [id], datos.consintio ? 'sin_telefono' : 'sin_consentimiento'));
      continue;
    }
    const respuesta: RespuestaMeta =
      datos.phoneNumberId && datos.tokenCifrado
        ? await enviarPlantilla(negocioId, { phoneNumberId: datos.phoneNumberId, tokenCifrado: datos.tokenCifrado }, datos.clienteTelefono, plantillaDeRecordatorio(datos), deps)
        : { ok: false, reintentable: false, detalle: 'El negocio no tiene una cuenta de WhatsApp activa' };

    await conNegocio(negocioId, async (tx) => {
      if (respuesta.ok) {
        await repositorio.marcarEnviado(tx, id, ahora);
        await sumarPlantilla(tx, negocioId, primerDiaDelMes(ahora, datos.zonaHoraria));
      } else {
        await repositorio.registrarFallo(tx, id, !respuesta.reintentable, MAX_INTENTOS_RECORDATORIO);
      }
    });
    if (respuesta.ok) enviados += 1;
    else logger.warn({ negocioId, detalle: respuesta.detalle, reintentable: respuesta.reintentable }, 'No se pudo enviar el recordatorio de una cita');
  }
  return enviados;
}
