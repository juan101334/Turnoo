import { DatosInvalidos, NoEncontrado } from '../../compartido/errores.js';
import { esZonaHoraria, sumarMinutos } from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio, conSistema, type Transaccion } from '../../db/contexto.js';
import { normalizarTelefono } from '../clientes/clientes.servicio.js';
import { exigirNegocioOperativo } from './negocios.reglas.js';
import * as repositorio from './negocios.repositorio.js';
import type {
  CambiosAdministrativos,
  CambiosConfiguracion,
  CambiosMiNegocio,
  ConfiguracionNegocio,
  EntradaNegocio,
  Negocio,
  NegocioDeLaLista,
} from './negocios.tipos.js';

/** Al crear un negocio, y al volver a ponerlo en prueba sin indicar hasta cuándo. */
const DIAS_DE_PRUEBA = 15;
/** Tope para la fecha que escribe el superadmin: evita una prueba "para siempre" por un error de año. */
const DIAS_MAXIMOS_DE_PRUEBA = 365;
const MINUTOS_POR_DIA = 24 * 60;
const ZONA_POR_DEFECTO = 'America/Bogota';

function exigirCambios(cambios: object): void {
  if (Object.values(cambios).every((valor) => valor === undefined)) {
    throw new DatosInvalidos('Indica al menos un dato para cambiar');
  }
}

function exigirIdValido(negocioId: string): void {
  if (!esUuid(negocioId)) throw new DatosInvalidos('El negocio indicado no es válido');
}

function exigirZona(zona: string): void {
  if (!esZonaHoraria(zona)) throw new DatosInvalidos('La zona horaria no es válida');
}

/** Teléfono en formato de WhatsApp; null lo borra y undefined significa "no se toca". */
function telefonoNormalizado<T extends string | null | undefined>(telefono: T): T | string {
  return typeof telefono === 'string' ? normalizarTelefono(telefono) : telefono;
}

async function exigirPlan(tx: Transaccion, planId: string | null | undefined): Promise<void> {
  if (planId === null || planId === undefined) return;
  if (!esUuid(planId) || !(await repositorio.planActivoExiste(tx, planId))) {
    throw new DatosInvalidos('El plan no existe o no está activo');
  }
}

// ---------------------------------------------------------------------
// Superadmin: cruza negocios, por eso usa conSistema
// ---------------------------------------------------------------------

/** Crea el negocio en prueba. La base le agrega su sede principal y su configuración por defecto. */
export async function crearNegocio(entrada: EntradaNegocio, ahora: Date = new Date()): Promise<Negocio> {
  const zonaHoraria = entrada.zonaHoraria ?? ZONA_POR_DEFECTO;
  exigirZona(zonaHoraria);
  const telefonoAvisos = telefonoNormalizado(entrada.telefonoAvisos ?? null);
  const pruebaHasta = sumarMinutos(ahora, DIAS_DE_PRUEBA * MINUTOS_POR_DIA);

  return conSistema(async (tx) => {
    await exigirPlan(tx, entrada.planId);
    return repositorio.crearNegocio(tx, {
      nombre: entrada.nombre,
      zonaHoraria,
      telefonoAvisos,
      planId: entrada.planId ?? null,
      pruebaHasta,
    });
  });
}

export function listarNegocios(): Promise<NegocioDeLaLista[]> {
  return conSistema((tx) => repositorio.listarNegocios(tx));
}

export async function obtenerNegocio(negocioId: string): Promise<Negocio> {
  exigirIdValido(negocioId);
  const negocio = await conSistema((tx) => repositorio.obtenerNegocio(tx, negocioId));
  if (!negocio) throw new NoEncontrado('El negocio');
  return negocio;
}

/**
 * Plan, estado y fin de la prueba. Reglas de la prueba:
 * - pasar a "prueba" desde otro estado sin decir hasta cuándo la deja en 15 días desde ahora
 *   (si no, quedaría sin fecha o con una ya vencida); si ya estaba en prueba, la fecha no cambia;
 * - `pruebaHasta` lo fija el superadmin: debe ser futura, a lo sumo en un año, y solo si el
 *   negocio queda en prueba (en un negocio activo no significaría nada).
 */
export async function cambiarPlanYEstado(
  negocioId: string,
  cambios: CambiosAdministrativos,
  ahora: Date = new Date(),
): Promise<Negocio> {
  exigirIdValido(negocioId);
  exigirCambios(cambios);
  if (cambios.pruebaHasta !== undefined) {
    const maximo = sumarMinutos(ahora, DIAS_MAXIMOS_DE_PRUEBA * MINUTOS_POR_DIA);
    if (cambios.pruebaHasta <= ahora) throw new DatosInvalidos('El fin de la prueba debe ser una fecha futura');
    if (cambios.pruebaHasta > maximo) throw new DatosInvalidos('El fin de la prueba no puede pasar de un año');
  }
  const negocio = await conSistema(async (tx) => {
    await exigirPlan(tx, cambios.planId);
    const actual = await repositorio.obtenerNegocio(tx, negocioId);
    if (!actual) return null;
    const quedaEn = cambios.estado ?? actual.estado;
    if (cambios.pruebaHasta !== undefined && quedaEn !== 'prueba') {
      throw new DatosInvalidos('El fin de la prueba solo se fija a un negocio en prueba');
    }
    const pruebaHasta =
      cambios.pruebaHasta ??
      (cambios.estado === 'prueba' && actual.estado !== 'prueba' ? sumarMinutos(ahora, DIAS_DE_PRUEBA * MINUTOS_POR_DIA) : undefined);
    return repositorio.actualizarPlanYEstado(tx, negocioId, { ...cambios, pruebaHasta });
  });
  if (!negocio) throw new NoEncontrado('El negocio');
  return negocio;
}

// ---------------------------------------------------------------------
// Dueño: siempre aislado a su propio negocio
// ---------------------------------------------------------------------

export async function obtenerMiNegocio(
  negocioId: string,
): Promise<{ negocio: Negocio; configuracion: ConfiguracionNegocio }> {
  return conNegocio(negocioId, async (tx) => {
    const negocio = await repositorio.obtenerNegocio(tx, negocioId);
    const configuracion = await repositorio.obtenerConfiguracion(tx, negocioId);
    if (!negocio || !configuracion) throw new NoEncontrado('El negocio');
    return { negocio, configuracion };
  });
}

export async function actualizarMiNegocio(negocioId: string, cambios: CambiosMiNegocio): Promise<Negocio> {
  exigirCambios(cambios);
  if (cambios.zonaHoraria !== undefined) exigirZona(cambios.zonaHoraria);
  const telefonoAvisos = telefonoNormalizado(cambios.telefonoAvisos);

  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const negocio = await repositorio.actualizarMiNegocio(tx, negocioId, { ...cambios, telefonoAvisos });
    if (!negocio) throw new NoEncontrado('El negocio');
    return negocio;
  });
}

/**
 * Las reglas entre campos se revisan sobre el resultado del UPDATE: así comparan los valores nuevos
 * con los que ya estaban, y si no se cumplen la excepción deshace el cambio.
 */
function exigirConfiguracionCoherente(c: ConfiguracionNegocio): void {
  // Se comparan como texto: 'HH:MM' con ceros a la izquierda ordena igual que la hora.
  if (c.recordatorioNoAntesDe >= c.recordatorioNoDespuesDe) {
    throw new DatosInvalidos('El horario de recordatorios debe empezar antes de terminar');
  }
  if (c.anticipacionMinMinutos >= c.anticipacionMaxDias * MINUTOS_POR_DIA) {
    throw new DatosInvalidos('La anticipación mínima debe ser menor que la máxima');
  }
}

export async function actualizarConfiguracion(
  negocioId: string,
  cambios: CambiosConfiguracion,
): Promise<ConfiguracionNegocio> {
  exigirCambios(cambios);
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const configuracion = await repositorio.actualizarConfiguracion(tx, negocioId, cambios);
    if (!configuracion) throw new NoEncontrado('El negocio');
    exigirConfiguracionCoherente(configuracion);
    return configuracion;
  });
}
