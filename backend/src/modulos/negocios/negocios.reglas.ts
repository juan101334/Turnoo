import { NoEncontrado, Prohibido } from '../../compartido/errores.js';
import type { Transaccion } from '../../db/contexto.js';
import * as repositorio from './negocios.repositorio.js';
import type { EstadoNegocio } from './negocios.tipos.js';

/**
 * Reglas sobre el estado de un negocio que usan otros módulos dentro de SU transacción.
 * Van aparte del servicio para que clientes y auth no dependan de todo el módulo de negocios.
 */

export async function estadoDeNegocio(tx: Transaccion, negocioId: string): Promise<EstadoNegocio> {
  const estado = await repositorio.obtenerEstado(tx, negocioId);
  if (!estado) throw new NoEncontrado('El negocio');
  return estado;
}

/** Un negocio suspendido puede iniciar sesión y consultar, pero no modificar nada. */
export async function exigirNegocioOperativo(tx: Transaccion, negocioId: string): Promise<void> {
  if ((await estadoDeNegocio(tx, negocioId)) === 'suspendido') {
    throw new Prohibido('El negocio está suspendido');
  }
}
