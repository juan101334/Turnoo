import { createHash } from 'node:crypto';
import { entorno } from '../config/entorno.js';
import { logger } from './logger.js';

/**
 * ¿La contraseña aparece en filtraciones públicas? Pregunta a Pwned Passwords con k-anonimato:
 * solo viajan los 5 primeros caracteres del SHA-1 de la contraseña; el servicio devuelve todos
 * los finales conocidos con ese comienzo y la comparación se hace aquí. Ni la contraseña ni su
 * hash completo salen del servidor. "Add-Padding" pide filas de relleno (con cuenta 0) para que
 * el tamaño de la respuesta tampoco delate nada.
 *
 * Opcional (REVISAR_CONTRASENAS_FILTRADAS, apagada por defecto) y falla abierta: si el servicio no
 * responde en TIEMPO_MS o responde con error, la contraseña se acepta. Es una ayuda, no un
 * requisito para poder entrar.
 */
export const URL_PWNED = 'https://api.pwnedpasswords.com/range/';
const TIEMPO_MS = 2000;

export interface OpcionesFiltradas {
  activa?: boolean;
  pedir?: typeof fetch;
  tiempoMs?: number;
}

export async function estaFiltrada(
  password: string,
  { activa = entorno.REVISAR_CONTRASENAS_FILTRADAS, pedir = fetch, tiempoMs = TIEMPO_MS }: OpcionesFiltradas = {},
): Promise<boolean> {
  if (!activa) return false;
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefijo = hash.slice(0, 5);
  const sufijo = hash.slice(5);
  try {
    const respuesta = await pedir(URL_PWNED + prefijo, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Turnoo' },
      signal: AbortSignal.timeout(tiempoMs),
    });
    if (!respuesta.ok) {
      logger.warn({ estado: respuesta.status }, 'Pwned Passwords respondió con error: la contraseña se acepta');
      return false;
    }
    for (const linea of (await respuesta.text()).split('\n')) {
      const [final, veces] = linea.trim().split(':');
      if (final === sufijo && Number(veces) > 0) return true;
    }
    return false;
  } catch (error) {
    logger.warn({ causa: error instanceof Error ? error.name : 'desconocida' }, 'Pwned Passwords no respondió: la contraseña se acepta');
    return false;
  }
}
