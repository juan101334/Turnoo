/**
 * Menú lateral del escritorio abierto o plegado (solo íconos). Se guarda en una cookie para que
 * el servidor lo pinte del ancho correcto desde el primer render: al recargar no salta.
 *
 * La cookie solo guarda la palabra "plegado": nada sensible. No es HttpOnly porque la escribe el
 * navegador al plegar o abrir. Sin cookie, o con otro valor, el menú va abierto.
 *
 * Sin 'server-only': la usan el layout (servidor) y el menú (navegador).
 */
export const COOKIE_MENU = 'turnoo_menu';
const PLEGADO = 'plegado';

export function leerMenuPlegado(valor: string | undefined): boolean {
  return valor === PLEGADO;
}

/** Un año. */
const DURACION_COOKIE_MENU = 60 * 60 * 24 * 365;

/** La cookie como la escribe el navegador al plegar (o la borra al abrir). */
export function cookieDelMenu(plegado: boolean, segura: boolean): string {
  const valor = plegado ? `${PLEGADO}; Max-Age=${DURACION_COOKIE_MENU}` : '; Max-Age=0';
  return `${COOKIE_MENU}=${valor}; Path=/; SameSite=Lax${segura ? '; Secure' : ''}`;
}
