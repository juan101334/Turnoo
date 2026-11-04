import { Conflicto, DatosInvalidos, NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import type { Transaccion } from '../../db/contexto.js';
import * as repositorio from './profesionales.repositorio.js';
import type { Profesional } from './profesionales.tipos.js';

/**
 * Asocia un usuario a un barbero activo, dentro de la transacción de quien llama.
 * Va aparte del servicio porque también la usa la invitación de empleados (módulo auth).
 * `reemplazar` indica si quien llama pidió cambiar expresamente al usuario que ya tenía el barbero.
 */
export async function asociarUsuarioABarbero(
  tx: Transaccion,
  profesionalId: string,
  usuarioId: string,
  opciones: { reemplazar: boolean },
): Promise<Profesional> {
  if (!esUuid(profesionalId)) throw new DatosInvalidos('El barbero indicado no es válido');
  const barbero = await repositorio.obtenerBloqueado(tx, profesionalId);
  if (!barbero) throw new NoEncontrado('El barbero');
  if (!barbero.activo) throw new Conflicto('El barbero está desactivado');
  if (!opciones.reemplazar && barbero.usuarioId !== null && barbero.usuarioId !== usuarioId) {
    throw new Conflicto('El barbero ya tiene un usuario asociado');
  }

  const actual = await repositorio.obtenerPorUsuario(tx, usuarioId);
  if (actual && actual.id !== profesionalId) {
    throw new Conflicto('El usuario ya está asociado a otro barbero');
  }
  return repositorio.asignarUsuario(tx, profesionalId, usuarioId);
}
