/**
 * Reglas del aviso al salir con cambios sin guardar (componentes/guardia-de-salida.tsx), sin DOM
 * para probarlas solas.
 */

/** Marca de la entrada de historial "centinela" que se agrega mientras hay cambios. */
export const MARCA_CENTINELA = '__turnooSinGuardar';

/**
 * Si un clic en un enlace pierde lo escrito y hay que preguntar antes. No se pregunta:
 * - hacia otro sitio o con otro protocolo (mailto:, tel:): ahí avisa el navegador (beforeunload);
 * - a la misma página (mismo camino y misma búsqueda; un #ancla no recarga nada);
 * - cuando la pantalla dice que ese destino no pierde nada (`esSegura`, por ejemplo cambiar de
 *   sección en Ajustes, donde todo es un solo formulario).
 */
export function debeAvisar(destino: URL, actual: URL, esSegura: (destino: URL) => boolean): boolean {
  if (destino.origin !== actual.origin) return false;
  if (destino.protocol !== 'http:' && destino.protocol !== 'https:') return false;
  if (destino.pathname === actual.pathname && destino.search === actual.search) return false;
  return !esSegura(destino);
}

/** Lo que importa del clic: botón, teclas y a dónde abre el enlace. */
export interface Clic {
  boton: number;
  conTecla: boolean;
  target: string;
  descarga: boolean;
}

/**
 * Si el clic navega en esta misma pestaña. Clic central, Ctrl/Cmd/Shift/Alt + clic, target="_blank"
 * o download abren aparte (o descargan): la página se queda con lo escrito.
 */
export function navegaAqui(c: Clic): boolean {
  return c.boton === 0 && !c.conTecla && (c.target === '' || c.target === '_self') && !c.descarga;
}

/**
 * iPhone y iPad (todos sus navegadores son Safari por dentro): no muestran el aviso de
 * beforeunload, así que recargar o cerrar la pestaña no pregunta. El iPad se presenta como Mac,
 * pero con pantalla táctil.
 */
export function esIOS(agente: string, plataforma: string, puntosTactiles: number): boolean {
  return /iP(hone|od|ad)/.test(agente) || (plataforma === 'MacIntel' && puntosTactiles > 1);
}
