import { errorParaLog, logger } from '../compartido/logger.js';
import { conSistema, type Transaccion } from '../db/contexto.js';
import { inicioDeVentanaVigente } from '../modulos/auth/auth.intentos.js';
import { borrarIntentosVencidos } from '../modulos/auth/auth.repositorio.js';
import { avisarDerivaciones, avisarLimitesDelPlan } from '../modulos/avisos/avisos.servicio.js';
import { autocompletarVencidas, expirarPorAprobar } from '../modulos/citas/citas.repositorio.js';

/**
 * Tareas internas. Cruzan negocios, por eso usan conSistema, e incluyen a los negocios suspendidos:
 * que pase el tiempo no es una modificación hecha por el negocio.
 *
 * No guardan estado: buscan lo pendiente por estado y fecha. Si un ciclo se pierde, el siguiente
 * lo recoge, y lo que pase del límite por ciclo también.
 */
export const LIMITE_POR_CICLO = 500;

/** Identifican los candados de PostgreSQL de estas tareas: el primer número es el de Turnoo. */
export const ESPACIO_CANDADOS = 7001;
export const CANDADOS = { autocompletar: 1, expirar: 2, limpiar: 3 } as const;

/**
 * Si otra instancia ya corre esta tarea, se salta el ciclo y devuelve null. El candado evita
 * trabajo doble; que una cita no se procese dos veces lo garantiza la condición de cada consulta.
 * Es de transacción: se suelta solo al terminar, aunque la instancia se caiga.
 */
function conCandado(candado: number, trabajo: (tx: Transaccion) => Promise<number>): Promise<number | null> {
  return conSistema(async (tx) => {
    const { rows } = await tx.consultar<{ tomado: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS tomado',
      [ESPACIO_CANDADOS, candado],
    );
    return rows[0]!.tomado ? trabajo(tx) : null;
  });
}

/** Libera el hueco de las citas `por_aprobar` cuyo plazo venció. */
export function expirarAprobaciones(ahora: Date, limite = LIMITE_POR_CICLO): Promise<number | null> {
  return conCandado(CANDADOS.expirar, (tx) => expirarPorAprobar(tx, ahora, limite));
}

/** Completa las citas que nadie marcó, pasadas `horas_autocompletar_cita` desde su fin. */
export function autocompletarCitas(ahora: Date, limite = LIMITE_POR_CICLO): Promise<number | null> {
  return conCandado(CANDADOS.autocompletar, (tx) => autocompletarVencidas(tx, ahora, limite));
}

export function limpiarIntentosLogin(ahora: Date): Promise<number | null> {
  return conCandado(CANDADOS.limpiar, (tx) => borrarIntentosVencidos(tx, inicioDeVentanaVigente(ahora)));
}

export interface Tarea {
  nombre: string;
  ejecutar: (ahora: Date) => Promise<number | null>;
}

const TAREAS: Tarea[] = [
  { nombre: 'expirar_aprobaciones', ejecutar: (ahora) => expirarAprobaciones(ahora) },
  { nombre: 'autocompletar_citas', ejecutar: (ahora) => autocompletarCitas(ahora) },
  { nombre: 'limpiar_intentos_login', ejecutar: limpiarIntentosLogin },
  // Estas dos no usan candado: reservan cada aviso con SKIP LOCKED, como el procesador.
  { nombre: 'avisar_derivaciones', ejecutar: (ahora) => avisarDerivaciones(ahora) },
  { nombre: 'avisar_limites_del_plan', ejecutar: (ahora) => avisarLimitesDelPlan(ahora) },
];

/**
 * Corre cada tarea una vez y nunca lanza: el fallo de una no frena a las demás ni tumba la API.
 */
export async function ejecutarCiclo(ahora: Date, tareas: Tarea[] = TAREAS): Promise<void> {
  for (const { nombre, ejecutar } of tareas) {
    const inicio = performance.now();
    try {
      const cantidad = await ejecutar(ahora);
      const duracionMs = Math.round(performance.now() - inicio);
      if (cantidad) {
        logger.info({ tarea: nombre, cantidad, duracionMs }, 'Tarea interna con cambios');
      } else {
        logger.debug({ tarea: nombre, cantidad, duracionMs }, 'Tarea interna sin cambios');
      }
    } catch (error) {
      logger.error({ tarea: nombre, fallo: errorParaLog(error) }, 'Falló una tarea interna');
    }
  }
}
