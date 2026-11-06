import { Conflicto, DatosInvalidos, Duplicado, NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio, type Transaccion } from '../../db/contexto.js';
import { exigirNegocioOperativo } from '../negocios/negocios.reglas.js';
import * as repositorio from './conocimiento.repositorio.js';
import type { BaseDeConocimiento, CambiosEntrada, EntradaConocimiento, NuevaEntrada } from './conocimiento.tipos.js';

/**
 * Base de conocimiento: preguntas y respuestas que el dueño escribe para que la IA conteste
 * sobre su negocio sin inventar. Todas las entradas activas van en cada llamada a la IA, por eso
 * hay topes: el de caracteres activos acota lo que cuesta cada mensaje (unos 20.000 caracteres
 * son del orden de 5.000 tokens), y el de entradas evita que la tabla crezca sin fin.
 */
export const MAX_PREGUNTA = 300;
export const MAX_RESPUESTA = 2_000;
export const MAX_ENTRADAS = 200;
export const MAX_CARACTERES_ACTIVOS = 20_000;

/** Caracteres reales, igual que char_length en PostgreSQL: un emoji cuenta como uno. */
const largo = (texto: string) => [...texto].length;

/** Quita espacios de los extremos y el carácter nulo, que PostgreSQL no acepta en un texto. */
function limpiar(texto: string, maximo: number, campo: string): string {
  const limpio = texto.replaceAll('\u0000', '').trim();
  if (!limpio) throw new DatosInvalidos(`${campo} es obligatoria`);
  if (largo(limpio) > maximo) throw new DatosInvalidos(`${campo} no puede pasar de ${maximo} caracteres`);
  return limpio;
}

function exigirId(id: string): void {
  if (!esUuid(id)) throw new NoEncontrado('La entrada');
}

export async function listarConocimiento(negocioId: string): Promise<BaseDeConocimiento> {
  return conNegocio(negocioId, async (tx) => {
    const entradas = await repositorio.listar(tx);
    const { caracteresActivos } = await repositorio.contar(tx, null);
    return { entradas, caracteresActivos, maxCaracteresActivos: MAX_CARACTERES_ACTIVOS, maxEntradas: MAX_ENTRADAS };
  });
}

/**
 * Revisa los topes y la pregunta repetida con el negocio bloqueado. `excluirId` es la entrada
 * que se edita: se cuenta con sus valores nuevos en lugar de los guardados.
 */
async function exigirQueQuepa(
  tx: Transaccion,
  negocioId: string,
  entrada: { pregunta: string; respuesta: string; activo: boolean },
  excluirId: string | null,
): Promise<void> {
  await repositorio.bloquearNegocio(tx, negocioId);
  if (await repositorio.existePregunta(tx, entrada.pregunta, excluirId)) {
    throw new Duplicado('Ya hay una entrada con esa pregunta');
  }
  const { total, caracteresActivos } = await repositorio.contar(tx, excluirId);
  if (excluirId === null && total >= MAX_ENTRADAS) {
    throw new Conflicto(`La base de conocimiento admite hasta ${MAX_ENTRADAS} entradas. Borra alguna primero`);
  }
  const propios = entrada.activo ? largo(entrada.pregunta) + largo(entrada.respuesta) : 0;
  if (caracteresActivos + propios > MAX_CARACTERES_ACTIVOS) {
    throw new Conflicto(
      `Las entradas activas no pueden pasar de ${MAX_CARACTERES_ACTIVOS} caracteres en total. ` +
        'Acorta alguna respuesta o desactiva otra entrada',
    );
  }
}

export async function crearEntrada(negocioId: string, nueva: NuevaEntrada): Promise<EntradaConocimiento> {
  const entrada = {
    pregunta: limpiar(nueva.pregunta, MAX_PREGUNTA, 'La pregunta'),
    respuesta: limpiar(nueva.respuesta, MAX_RESPUESTA, 'La respuesta'),
    activo: nueva.activo ?? true,
  };
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    await exigirQueQuepa(tx, negocioId, entrada, null);
    return repositorio.crear(tx, { negocioId, ...entrada });
  });
}

export async function actualizarEntrada(
  negocioId: string,
  id: string,
  cambios: CambiosEntrada,
): Promise<EntradaConocimiento> {
  exigirId(id);
  if (cambios.pregunta === undefined && cambios.respuesta === undefined && cambios.activo === undefined) {
    throw new DatosInvalidos('Indica al menos un dato para cambiar');
  }
  const pregunta = cambios.pregunta === undefined ? undefined : limpiar(cambios.pregunta, MAX_PREGUNTA, 'La pregunta');
  const respuesta =
    cambios.respuesta === undefined ? undefined : limpiar(cambios.respuesta, MAX_RESPUESTA, 'La respuesta');

  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const actual = await repositorio.obtenerBloqueada(tx, id);
    if (!actual) throw new NoEncontrado('La entrada');
    const entrada = {
      pregunta: pregunta ?? actual.pregunta,
      respuesta: respuesta ?? actual.respuesta,
      activo: cambios.activo ?? actual.activo,
    };
    await exigirQueQuepa(tx, negocioId, entrada, id);
    return repositorio.actualizar(tx, id, entrada);
  });
}

export async function borrarEntrada(negocioId: string, id: string): Promise<void> {
  exigirId(id);
  await conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    if (!(await repositorio.borrar(tx, id))) throw new NoEncontrado('La entrada');
  });
}
