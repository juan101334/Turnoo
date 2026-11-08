import { isIP } from 'node:net';

/**
 * IP real del usuario, para que el backend cuente bien los intentos de login.
 *
 * Cada proxy agrega al FINAL de X-Forwarded-For la IP de quien le habló. Con `saltos` proxies
 * propios delante del panel (1 = Caddy), la entrada que cuenta es la que agregó el primero de
 * ellos: la posición `largo - saltos`. Lo que esté antes lo pudo escribir el navegador y no
 * vale nada. Con 0 saltos no hay proxy propio: la cabecera entera viene del navegador y se ignora.
 *
 * Es la misma regla que aplica el backend con `trust proxy` (SALTOS_PROXY).
 */
export function ipDelCliente(cabecera: string | null | undefined, saltos: number): string | null {
  if (saltos <= 0 || !cabecera) return null;
  const entradas = cabecera
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);
  const ip = entradas[entradas.length - saltos];
  return ip !== undefined && isIP(ip) !== 0 ? ip : null;
}
