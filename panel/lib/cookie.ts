/**
 * Nombre de la cookie de sesión. En producción lleva el prefijo __Host-: el navegador solo la
 * acepta con Secure, sin Domain y con Path=/, así que ningún subdominio puede pisarla.
 * En desarrollo (http://localhost) va sin prefijo.
 *
 * Sin 'server-only': también la lee proxy.ts.
 */
export const COOKIE_PRODUCCION = '__Host-turnoo_sesion';
export const COOKIE_DESARROLLO = 'turnoo_sesion';

export const nombreCookie = (produccion: boolean) => (produccion ? COOKIE_PRODUCCION : COOKIE_DESARROLLO);
