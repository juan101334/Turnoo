import { Conflicto, DatosInvalidos, NoEncontrado } from '../../compartido/errores.js';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import { borrarArchivos } from '../adjuntos/adjuntos.archivos.js';
import { archivosDelCliente } from '../adjuntos/adjuntos.repositorio.js';
import { listarCitasDelCliente } from '../citas/citas.repositorio.js';
import type { CitaDetalle } from '../citas/citas.tipos.js';
import { exigirNegocioOperativo } from '../negocios/negocios.reglas.js';
import * as repositorio from './clientes.repositorio.js';
import type { CambiosCliente, Cliente, ClienteResumen, EntradaCliente, FiltroClientes } from './clientes.tipos.js';

const MAX_NOMBRE = 100;
const MAX_NOTAS = 2000;

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
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    return repositorio.obtenerOCrear(tx, negocioId, telefono, nombre);
  });
}

/** El siguiente registro se pide de más solo para saber si hay otra página. */
export async function listarClientes(
  negocioId: string,
  filtro: FiltroClientes,
): Promise<{ clientes: Cliente[]; hayMas: boolean }> {
  const buscar = filtro.buscar?.trim() || null;
  const filas = await conNegocio(negocioId, (tx) =>
    repositorio.listar(tx, { ...filtro, buscar, limite: filtro.limite + 1 }),
  );
  return { clientes: filas.slice(0, filtro.limite), hayMas: filas.length > filtro.limite };
}

/** Con `soloBarbero`, un cliente sin citas con ese barbero se responde como "no existe". */
/**
 * Citas del cliente, la más reciente primero, de a `limite`. El empleado solo ve las que tuvo con
 * su barbero, y un cliente sin citas con él se responde como "no existe", igual que su ficha.
 */
export async function historialDelCliente(
  negocioId: string,
  clienteId: string,
  f: { soloBarbero: string | null; limite: number; desplazamiento: number },
): Promise<{ citas: CitaDetalle[]; hayMas: boolean }> {
  if (!esUuid(clienteId)) throw new NoEncontrado('El cliente');
  return conNegocio(negocioId, async (tx) => {
    if (!(await repositorio.obtener(tx, clienteId))) throw new NoEncontrado('El cliente');
    if (f.soloBarbero && !(await repositorio.tieneCitasConBarbero(tx, clienteId, f.soloBarbero))) {
      throw new NoEncontrado('El cliente');
    }
    // Se pide una de más para saber si hay otra página sin contar todas.
    const citas = await listarCitasDelCliente(tx, clienteId, {
      profesionalId: f.soloBarbero,
      limite: f.limite + 1,
      desplazamiento: f.desplazamiento,
    });
    return { citas: citas.slice(0, f.limite), hayMas: citas.length > f.limite };
  });
}

export async function obtenerCliente(
  negocioId: string,
  clienteId: string,
  soloBarbero: string | null,
): Promise<Cliente> {
  if (!esUuid(clienteId)) throw new NoEncontrado('El cliente');
  return conNegocio(negocioId, async (tx) => {
    const cliente = await repositorio.obtener(tx, clienteId);
    if (!cliente) throw new NoEncontrado('El cliente');
    if (soloBarbero && !(await repositorio.tieneCitasConBarbero(tx, clienteId, soloBarbero))) {
      throw new NoEncontrado('El cliente');
    }
    return cliente;
  });
}

/** Texto opcional: vacío o solo espacios significa quitarlo. */
function textoOpcional(texto: string | null | undefined, maximo: number, campo: string) {
  if (texto === undefined) return undefined;
  const limpio = texto?.trim() || null;
  if (limpio && limpio.length > maximo) {
    throw new DatosInvalidos(`${campo} no puede pasar de ${maximo} caracteres`);
  }
  return limpio;
}

export async function actualizarCliente(
  negocioId: string,
  clienteId: string,
  entrada: CambiosCliente,
): Promise<Cliente> {
  if (!esUuid(clienteId)) throw new NoEncontrado('El cliente');
  const cambios: CambiosCliente = {
    nombre: textoOpcional(entrada.nombre, MAX_NOMBRE, 'El nombre'),
    notas: textoOpcional(entrada.notas, MAX_NOTAS, 'Las notas'),
    telefono: entrada.telefono === undefined ? undefined : normalizarTelefono(entrada.telefono),
  };
  if (Object.values(cambios).every((valor) => valor === undefined)) {
    throw new DatosInvalidos('Indica al menos un dato para cambiar');
  }
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const cliente = await repositorio.obtenerBloqueado(tx, clienteId);
    if (!cliente) throw new NoEncontrado('El cliente');
    if (cliente.anonimizadoEn) throw new Conflicto('El cliente está anonimizado');
    return repositorio.actualizar(tx, clienteId, cambios);
  });
}

/**
 * Atiende la solicitud de borrar sus datos (Ley 1581). No se puede deshacer. Se rechaza si tiene
 * citas activas: sin su teléfono, el negocio no podría avisarle de nada sobre ellas.
 * Es lo único que un negocio suspendido puede modificar: un problema de pago del negocio no
 * frena el derecho de la persona a que borren sus datos.
 *
 * Las imágenes que envió se borran del disco después de confirmar la transacción: si se
 * borraran antes y la transacción fallara, el cliente seguiría con imágenes que ya no existen.
 */
export async function anonimizarCliente(negocioId: string, clienteId: string): Promise<void> {
  if (!esUuid(clienteId)) throw new NoEncontrado('El cliente');
  const archivos = await conNegocio(negocioId, async (tx) => {
    const cliente = await repositorio.obtenerBloqueado(tx, clienteId);
    if (!cliente) throw new NoEncontrado('El cliente');
    if (cliente.anonimizadoEn) throw new Conflicto('El cliente ya está anonimizado');
    const activas = await repositorio.contarCitasActivas(tx, clienteId);
    if (activas > 0) {
      throw new Conflicto(`El cliente tiene ${activas} cita(s) activa(s). Cancélalas o márcalas primero`);
    }
    const rutas = await archivosDelCliente(tx, clienteId);
    await repositorio.anonimizar(tx, clienteId);
    return rutas;
  });
  try {
    await borrarArchivos(archivos);
  } catch (error) {
    // Los datos ya no apuntan a esos archivos; queda el rastro para borrarlos a mano.
    logger.error({ negocioId, archivos: archivos.length, fallo: errorParaLog(error) }, 'No se pudieron borrar las imágenes de un cliente anonimizado');
  }
}
