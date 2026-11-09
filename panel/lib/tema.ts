/**
 * Tema del panel: Sistema (sigue al celular o al PC), Claro u Oscuro. Se guarda en una cookie
 * para que el servidor pinte el tema correcto desde el primer render, sin destello.
 *
 * La cookie solo guarda una de estas tres palabras: nada sensible. No es HttpOnly porque la
 * escribe el navegador al elegir (cambia al instante, sin esperar al servidor). Cualquier otro
 * valor se lee como "sistema".
 *
 * Sin 'server-only': la usan el layout (servidor) y el selector (navegador).
 */
export const COOKIE_TEMA = 'turnoo_tema';
export const TEMAS = ['sistema', 'claro', 'oscuro'] as const;
export type Tema = (typeof TEMAS)[number];

export const ETIQUETAS_TEMA: Record<Tema, string> = { sistema: 'Sistema', claro: 'Claro', oscuro: 'Oscuro' };

export function leerTema(valor: string | undefined): Tema {
  return (TEMAS as readonly string[]).includes(valor ?? '') ? (valor as Tema) : 'sistema';
}

/** Colores de la barra del navegador (y del panel instalado) en cada modo. */
export const COLOR_BARRA = { claro: '#075985', oscuro: '#0b141d' } as const;

/** Un año. */
export const DURACION_COOKIE_TEMA = 60 * 60 * 24 * 365;
