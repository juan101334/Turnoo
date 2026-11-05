import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta firma cada webhook con el App Secret, sobre el cuerpo tal como llegó. Sin secreto configurado
 * nada es válido: una firma con clave vacía la podría calcular cualquiera.
 */
export function firmaValida(cuerpo: Buffer, cabecera: unknown, appSecret: string): boolean {
  if (!appSecret || typeof cabecera !== 'string') return false;
  const esperada = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(cuerpo).digest('hex')}`);
  const recibida = Buffer.from(cabecera);
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** Compara sin revelar por el tiempo de respuesta cuántos caracteres coinciden. */
export function textosIguales(a: string, b: string): boolean {
  const resumen = (texto: string) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(resumen(a), resumen(b));
}
