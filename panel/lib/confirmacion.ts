/**
 * Confirmar escribiendo el nombre (zona de peligro): tiene que ser el nombre exacto, con sus
 * tildes y mayúsculas. Solo se perdonan los espacios de los bordes, que no se ven al escribir.
 */
export function escribioElNombre(escrito: string, nombre: string): boolean {
  return escrito.trim() !== '' && escrito.trim() === nombre.trim();
}
