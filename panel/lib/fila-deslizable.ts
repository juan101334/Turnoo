/** Ancho del degradado en el borde que todavía tiene más contenido. */
const DESVANECIDO = '2rem';

/**
 * Máscara de la fila: transparente en el borde que todavía tiene más, para que se note que se
 * desliza. Sin nada oculto, ninguna (el último elemento no queda desvanecido).
 */
export function mascaraDeBordes({ antes, despues }: { antes: boolean; despues: boolean }): string | undefined {
  if (!antes && !despues) return undefined;
  const izquierda = antes ? `transparent, black ${DESVANECIDO}` : 'black, black';
  const derecha = despues ? `black calc(100% - ${DESVANECIDO}), transparent` : 'black, black';
  return `linear-gradient(to right, ${izquierda}, ${derecha})`;
}

/**
 * Cuánto mover la fila con "Semana siguiente": 7 días (`paso` es lo que ocupa un día con su
 * separación), pero nunca más de lo que se ve, para no saltarse días sin mostrarlos.
 */
export function pasoDeSemana(paso: number, visible: number): number {
  return Math.max(paso, Math.min(paso * 7, Math.floor(visible / paso) * paso));
}
