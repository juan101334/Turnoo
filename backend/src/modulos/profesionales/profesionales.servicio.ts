import { Conflicto, DatosInvalidos, LimiteDelPlan, NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio, type Transaccion } from '../../db/contexto.js';
import * as repositorioUsuarios from '../auth/auth.repositorio.js';
import { exigirNegocioOperativo } from '../negocios/negocios.reglas.js';
import { asociarUsuarioABarbero } from './profesionales.reglas.js';
import * as repositorio from './profesionales.repositorio.js';
import type { Profesional } from './profesionales.tipos.js';

function exigirId(id: string): void {
  if (!esUuid(id)) throw new DatosInvalidos('El barbero indicado no es válido');
}

/** Bloquea el negocio y comprueba que quepa un barbero activo más en el plan. */
async function exigirCupoDelPlan(tx: Transaccion, negocioId: string): Promise<void> {
  const limite = await repositorio.bloquearLimiteDeBarberos(tx, negocioId);
  if (limite !== null && (await repositorio.contarActivos(tx)) >= limite) {
    throw new LimiteDelPlan(`Tu plan permite hasta ${limite} barberos activos`);
  }
}

export function listarProfesionales(negocioId: string): Promise<Profesional[]> {
  return conNegocio(negocioId, (tx) => repositorio.listar(tx));
}

export async function obtenerProfesional(negocioId: string, id: string): Promise<Profesional> {
  exigirId(id);
  const barbero = await conNegocio(negocioId, (tx) => repositorio.obtener(tx, id));
  if (!barbero) throw new NoEncontrado('El barbero');
  return barbero;
}

/** El barbero de un usuario del panel, esté activo o no. */
export function profesionalDelUsuario(negocioId: string, usuarioId: string): Promise<Profesional | null> {
  return conNegocio(negocioId, (tx) => repositorio.obtenerPorUsuario(tx, usuarioId));
}

export function crearProfesional(negocioId: string, nombre: string): Promise<Profesional> {
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    await exigirCupoDelPlan(tx, negocioId);
    const sedeId = await repositorio.obtenerSedeActiva(tx);
    if (!sedeId) throw new Conflicto('El negocio no tiene una sede activa');
    return repositorio.crear(tx, { negocioId, sedeId, nombre });
  });
}

export async function renombrarProfesional(negocioId: string, id: string, nombre: string): Promise<Profesional> {
  exigirId(id);
  const barbero = await conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    return repositorio.cambiarNombre(tx, id, nombre);
  });
  if (!barbero) throw new NoEncontrado('El barbero');
  return barbero;
}

/**
 * No se desactiva un barbero con citas futuras, porque hoy no se le puede avisar al cliente.
 * El bloqueo de la fila hace que una cita que se esté creando termine antes de contar.
 */
export async function desactivarProfesional(
  negocioId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<Profesional> {
  exigirId(id);
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const barbero = await repositorio.obtenerBloqueado(tx, id);
    if (!barbero) throw new NoEncontrado('El barbero');
    if (!barbero.activo) return barbero;

    const citas = await repositorio.contarCitasFuturas(tx, id, ahora);
    if (citas > 0) {
      throw new Conflicto(`El barbero tiene ${citas} ${citas === 1 ? 'cita futura' : 'citas futuras'}. Cancélalas primero`);
    }
    return repositorio.cambiarActivo(tx, id, false);
  });
}

/** Reactivar también ocupa un cupo: desactivar y reactivar no sirve para pasar el límite del plan. */
export async function activarProfesional(negocioId: string, id: string): Promise<Profesional> {
  exigirId(id);
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    await exigirCupoSiHaceFalta(tx, negocioId, id);
    return repositorio.cambiarActivo(tx, id, true);
  });
}

async function exigirCupoSiHaceFalta(tx: Transaccion, negocioId: string, id: string): Promise<void> {
  const barbero = await repositorio.obtenerBloqueado(tx, id);
  if (!barbero) throw new NoEncontrado('El barbero');
  if (!barbero.activo) await exigirCupoDelPlan(tx, negocioId);
}

/**
 * Asocia o quita el usuario de un barbero. Sirve para empleados y para un dueño que atiende.
 * `usuarioId` null deja al barbero sin usuario; un empleado sin barbero pierde el acceso a citas.
 */
export async function asignarUsuario(
  negocioId: string,
  id: string,
  usuarioId: string | null,
): Promise<Profesional> {
  exigirId(id);
  if (usuarioId !== null && !esUuid(usuarioId)) throw new DatosInvalidos('El usuario indicado no es válido');

  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    if (usuarioId === null) {
      const barbero = await repositorio.obtenerBloqueado(tx, id);
      if (!barbero) throw new NoEncontrado('El barbero');
      return repositorio.asignarUsuario(tx, id, null);
    }
    const usuario = await repositorioUsuarios.obtenerUsuario(tx, usuarioId);
    if (!usuario) throw new NoEncontrado('El usuario');
    if (!usuario.activo && !usuario.pendiente) throw new Conflicto('El usuario está desactivado');
    return asociarUsuarioABarbero(tx, id, usuarioId, { reemplazar: true });
  });
}
