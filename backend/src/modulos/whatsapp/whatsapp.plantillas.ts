import { claveDeTokens, descifrar } from '../../compartido/cifrado.js';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { enviarPlantillaAMeta, type Plantilla } from './whatsapp.meta.js';
import type { RespuestaMeta } from './whatsapp.tipos.js';

/**
 * Lo común de las plantillas que envían las tareas (avisos al dueño y recordatorios).
 *
 * Meta trata cada idioma como una plantilla distinta: las de Turnoo se crean en
 * "Spanish (COL)" (es_CO). Con otro idioma, aunque sea 'es', responde 132001.
 */
export const IDIOMA_PLANTILLAS = 'es_CO';

/**
 * Meta rechaza parámetros con saltos de línea, tabulaciones o muchos espacios seguidos, y uno
 * vacío. El texto del cliente se deja en una línea, corto, y nunca vacío.
 */
export function parametro(texto: string | null | undefined, maximo = 200): string {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return '-';
  return [...limpio].length > maximo ? `${[...limpio].slice(0, maximo - 1).join('')}…` : limpio;
}

export interface DependenciasPlantillas {
  pedir?: typeof fetch;
  clave?: () => Buffer;
}

/** Descifra el token de la cuenta y envía. No lanza: un token ilegible es un fallo definitivo. */
export async function enviarPlantilla(
  negocioId: string,
  destino: { phoneNumberId: string; tokenCifrado: string },
  telefono: string,
  plantilla: Plantilla,
  { pedir, clave = claveDeTokens }: DependenciasPlantillas,
): Promise<RespuestaMeta> {
  let token: string;
  try {
    token = descifrar(destino.tokenCifrado, clave());
  } catch (error) {
    logger.error({ negocioId, fallo: errorParaLog(error) }, 'No se pudo leer el token para enviar una plantilla');
    return { ok: false, reintentable: false, detalle: 'Token ilegible' };
  }
  return enviarPlantillaAMeta({ phoneNumberId: destino.phoneNumberId, token }, telefono, plantilla, pedir);
}
