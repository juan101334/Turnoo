import { DatosInvalidos } from '../../compartido/errores.js';
import { conNegocio } from '../../db/contexto.js';
import * as repositorio from './clientes.repositorio.js';
import type { ClienteResumen, EntradaCliente } from './clientes.tipos.js';

const MAX_NOMBRE = 100;

/**
 * Deja el teléfono en el formato de WhatsApp (solo dígitos con indicativo) para que el mismo
 * cliente no aparezca dos veces. Un celular colombiano de 10 dígitos (empieza por 3) recibe el 57.
 */
export function normalizarTelefono(texto: unknown): string {
  if (typeof texto !== 'string') throw new DatosInvalidos('El teléfono no es válido');
  let digitos = texto.replace(/[\s().+-]/g, '');
  if (/^3\d{9}$/.test(digitos)) digitos = `57${digitos}`;
  if (!/^\d{8,15}$/.test(digitos)) {
    throw new DatosInvalidos('El teléfono debe tener entre 8 y 15 dígitos, con indicativo del país');
  }
  return digitos;
}

export async function obtenerOCrearCliente(
  negocioId: string,
  entrada: EntradaCliente,
): Promise<ClienteResumen> {
  const telefono = normalizarTelefono(entrada.telefono);
  const nombre = entrada.nombre?.trim() || null;
  if (nombre && nombre.length > MAX_NOMBRE) {
    throw new DatosInvalidos(`El nombre no puede pasar de ${MAX_NOMBRE} caracteres`);
  }
  return conNegocio(negocioId, (tx) => repositorio.obtenerOCrear(tx, negocioId, telefono, nombre));
}
