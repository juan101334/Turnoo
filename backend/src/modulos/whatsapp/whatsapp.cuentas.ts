import { cifrar, claveDeTokens } from '../../compartido/cifrado.js';
import { DatosInvalidos, NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import { normalizarTelefono } from '../clientes/clientes.servicio.js';
import { estadoDeNegocio } from '../negocios/negocios.reglas.js';
import * as repositorio from './whatsapp.repositorio.js';
import type { CambiosCuenta, CuentaRegistrada, EntradaCuenta } from './whatsapp.tipos.js';

/**
 * Registro de las cuentas de WhatsApp de un negocio. Lo hace el superadmin, porque el alta de
 * cada negocio en Meta es manual. Usa conNegocio y no conSistema: solo necesita ese negocio.
 * El token se cifra antes de llegar a la base y nunca se devuelve.
 */

function exigirIds(...ids: string[]): void {
  if (!ids.every(esUuid)) throw new DatosInvalidos('El identificador indicado no es válido');
}

export async function registrarCuenta(
  negocioId: string,
  entrada: EntradaCuenta,
  clave: () => Buffer = claveDeTokens,
): Promise<CuentaRegistrada> {
  exigirIds(negocioId);
  // Primero la clave: sin ella no se guarda nada a medias.
  const tokenCifrado = cifrar(entrada.token, clave());
  return conNegocio(negocioId, async (tx) => {
    await estadoDeNegocio(tx, negocioId);
    return repositorio.crearCuenta(tx, negocioId, {
      phoneNumberId: entrada.phoneNumberId,
      wabaId: entrada.wabaId,
      numeroVisible: normalizarTelefono(entrada.numeroVisible),
      tokenCifrado,
    });
  });
}

export async function listarCuentas(negocioId: string): Promise<CuentaRegistrada[]> {
  exigirIds(negocioId);
  return conNegocio(negocioId, async (tx) => {
    await estadoDeNegocio(tx, negocioId);
    return repositorio.listarCuentas(tx);
  });
}

/** Cambiar el token sirve para rotarlo; desactivar la cuenta hace que el webhook la ignore. */
export async function cambiarCuenta(
  negocioId: string,
  cuentaId: string,
  cambios: CambiosCuenta,
  clave: () => Buffer = claveDeTokens,
): Promise<CuentaRegistrada> {
  exigirIds(negocioId, cuentaId);
  if (Object.values(cambios).every((valor) => valor === undefined)) {
    throw new DatosInvalidos('Indica al menos un dato para cambiar');
  }
  const tokenCifrado = cambios.token === undefined ? undefined : cifrar(cambios.token, clave());
  return conNegocio(negocioId, async (tx) => {
    await estadoDeNegocio(tx, negocioId);
    const cuenta = await repositorio.actualizarCuenta(tx, cuentaId, {
      numeroVisible: cambios.numeroVisible === undefined ? undefined : normalizarTelefono(cambios.numeroVisible),
      tokenCifrado,
      activa: cambios.activa,
    });
    if (!cuenta) throw new NoEncontrado('La cuenta de WhatsApp');
    return cuenta;
  });
}
