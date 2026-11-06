import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { entorno } from '../../config/entorno.js';

/**
 * Único lugar que toca el disco. Las rutas que se guardan en la base son relativas a
 * ARCHIVOS_DIR y se arman solo con uuids y una extensión fija, nunca con datos del cliente.
 * Aun así, cada ruta se comprueba antes de usarla: no puede salir de la carpeta base.
 */

const base = () => resolve(entorno.ARCHIVOS_DIR);

function rutaAbsoluta(rutaRelativa: string): string {
  const absoluta = resolve(base(), rutaRelativa);
  const dentro = relative(base(), absoluta);
  if (!dentro || dentro.startsWith('..') || isAbsolute(dentro)) throw new Error('Ruta de archivo fuera de la carpeta de archivos');
  return absoluta;
}

export function rutaDeImagen(negocioId: string, mensajeId: string, extension: string): string {
  return `imagenes/${negocioId}/${mensajeId}.${extension}`;
}

export async function guardarArchivo(rutaRelativa: string, bytes: Buffer): Promise<void> {
  const destino = rutaAbsoluta(rutaRelativa);
  await mkdir(dirname(destino), { recursive: true, mode: 0o700 });
  // Solo el dueño del proceso puede leerlo: son datos personales.
  await writeFile(destino, bytes, { mode: 0o600 });
}

export function leerArchivo(rutaRelativa: string): Promise<Buffer> {
  return readFile(rutaAbsoluta(rutaRelativa));
}

/** Borra los archivos que existan; uno que ya no está no es un error. */
export async function borrarArchivos(rutasRelativas: string[]): Promise<void> {
  await Promise.all(rutasRelativas.map((r) => rm(rutaAbsoluta(r), { force: true })));
}
