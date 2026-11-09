import type { Transaccion } from '../../db/contexto.js';
import type {
  CambiosAdministrativos,
  CambiosConfiguracion,
  CambiosMiNegocio,
  ConfiguracionNegocio,
  EstadoNegocio,
  Negocio,
  NegocioDeLaLista,
} from './negocios.tipos.js';

/** Único lugar con SQL del módulo de negocios. */

const COLUMNAS_NEGOCIO =
  'id, nombre, telefono_avisos, zona_horaria, estado, plan_id, prueba_hasta, pagado_hasta, created_at';

interface FilaNegocio {
  id: string;
  nombre: string;
  telefono_avisos: string | null;
  zona_horaria: string;
  estado: EstadoNegocio;
  plan_id: string | null;
  prueba_hasta: Date | null;
  pagado_hasta: Date | null;
  created_at: Date;
}

function aNegocio(f: FilaNegocio): Negocio {
  return {
    id: f.id,
    nombre: f.nombre,
    telefonoAvisos: f.telefono_avisos,
    zonaHoraria: f.zona_horaria,
    estado: f.estado,
    planId: f.plan_id,
    pruebaHasta: f.prueba_hasta,
    pagadoHasta: f.pagado_hasta,
    createdAt: f.created_at,
  };
}

/**
 * Parte SET de un UPDATE parcial. Los nombres de columna salen SOLO de `columnas`, escrito en
 * este archivo; los valores siempre van como parámetros. El primer parámetro libre es $2 ($1 = id).
 */
function armarCambios<T extends object>(
  cambios: T,
  columnas: Record<keyof T, string>,
): { asignaciones: string; valores: unknown[] } {
  const asignaciones: string[] = [];
  const valores: unknown[] = [];
  for (const campo of Object.keys(columnas) as (keyof T)[]) {
    if (cambios[campo] === undefined) continue;
    valores.push(cambios[campo]);
    asignaciones.push(`${columnas[campo]} = $${valores.length + 1}`);
  }
  return { asignaciones: asignaciones.join(', '), valores };
}

async function actualizarNegocio<T extends object>(
  tx: Transaccion,
  negocioId: string,
  cambios: T,
  columnas: Record<keyof T, string>,
): Promise<Negocio | null> {
  const { asignaciones, valores } = armarCambios(cambios, columnas);
  const { rows } = await tx.consultar<FilaNegocio>(
    `UPDATE negocios SET ${asignaciones} WHERE id = $1 RETURNING ${COLUMNAS_NEGOCIO}`,
    [negocioId, ...valores],
  );
  return rows[0] ? aNegocio(rows[0]) : null;
}

export async function crearNegocio(
  tx: Transaccion,
  n: {
    nombre: string;
    zonaHoraria: string;
    telefonoAvisos: string | null;
    planId: string | null;
    pruebaHasta: Date;
  },
): Promise<Negocio> {
  const { rows } = await tx.consultar<FilaNegocio>(
    `INSERT INTO negocios (nombre, zona_horaria, telefono_avisos, plan_id, prueba_hasta)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_NEGOCIO}`,
    [n.nombre, n.zonaHoraria, n.telefonoAvisos, n.planId, n.pruebaHasta],
  );
  return aNegocio(rows[0]!);
}

/** Con whatsappConectado: una sola consulta, para no pedir los números negocio por negocio. */
export async function listarNegocios(tx: Transaccion): Promise<NegocioDeLaLista[]> {
  const { rows } = await tx.consultar<FilaNegocio & { whatsapp_conectado: boolean }>(
    `SELECT ${COLUMNAS_NEGOCIO},
            EXISTS (SELECT 1 FROM whatsapp_cuentas w WHERE w.negocio_id = negocios.id AND w.activa) AS whatsapp_conectado
       FROM negocios ORDER BY created_at DESC, id`,
  );
  return rows.map((f) => ({ ...aNegocio(f), whatsappConectado: f.whatsapp_conectado }));
}

export async function obtenerNegocio(tx: Transaccion, negocioId: string): Promise<Negocio | null> {
  const { rows } = await tx.consultar<FilaNegocio>(
    `SELECT ${COLUMNAS_NEGOCIO} FROM negocios WHERE id = $1`,
    [negocioId],
  );
  return rows[0] ? aNegocio(rows[0]) : null;
}

export async function obtenerEstado(tx: Transaccion, negocioId: string): Promise<EstadoNegocio | null> {
  const { rows } = await tx.consultar<{ estado: EstadoNegocio }>(
    'SELECT estado FROM negocios WHERE id = $1',
    [negocioId],
  );
  return rows[0]?.estado ?? null;
}

export function actualizarMiNegocio(
  tx: Transaccion,
  negocioId: string,
  cambios: CambiosMiNegocio,
): Promise<Negocio | null> {
  return actualizarNegocio(tx, negocioId, cambios, {
    nombre: 'nombre',
    telefonoAvisos: 'telefono_avisos',
    zonaHoraria: 'zona_horaria',
  });
}

export function actualizarPlanYEstado(
  tx: Transaccion,
  negocioId: string,
  cambios: CambiosAdministrativos,
): Promise<Negocio | null> {
  return actualizarNegocio(tx, negocioId, cambios, { planId: 'plan_id', estado: 'estado' });
}

export async function planActivoExiste(tx: Transaccion, planId: string): Promise<boolean> {
  const { rows } = await tx.consultar('SELECT 1 FROM planes WHERE id = $1 AND activo', [planId]);
  return rows.length > 0;
}

const COLUMNAS_CONFIGURACION: Record<keyof ConfiguracionNegocio, string> = {
  intervaloMinutos: 'intervalo_minutos',
  anticipacionMinMinutos: 'anticipacion_min_minutos',
  anticipacionMaxDias: 'anticipacion_max_dias',
  maxCitasActivasCliente: 'max_citas_activas_cliente',
  horasLimiteCancelacion: 'horas_limite_cancelacion',
  horasRecordatorio: 'horas_recordatorio',
  recordatorioNoAntesDe: 'recordatorio_no_antes_de',
  recordatorioNoDespuesDe: 'recordatorio_no_despues_de',
  maxInasistencias: 'max_inasistencias',
  ventanaInasistenciasDias: 'ventana_inasistencias_dias',
  horasEsperaAprobacion: 'horas_espera_aprobacion',
  aprobacionMinutosAntesCita: 'aprobacion_minutos_antes_cita',
  horasModoHumano: 'horas_modo_humano',
  horasAutocompletarCita: 'horas_autocompletar_cita',
};

const SELECCION_CONFIGURACION = Object.values(COLUMNAS_CONFIGURACION).join(', ');

interface FilaConfiguracion {
  intervalo_minutos: number;
  anticipacion_min_minutos: number;
  anticipacion_max_dias: number;
  max_citas_activas_cliente: number | null;
  horas_limite_cancelacion: number;
  horas_recordatorio: number;
  recordatorio_no_antes_de: string;
  recordatorio_no_despues_de: string;
  max_inasistencias: number;
  ventana_inasistencias_dias: number;
  horas_espera_aprobacion: number;
  aprobacion_minutos_antes_cita: number;
  horas_modo_humano: number;
  horas_autocompletar_cita: number;
}

function aConfiguracion(f: FilaConfiguracion): ConfiguracionNegocio {
  return {
    intervaloMinutos: f.intervalo_minutos,
    anticipacionMinMinutos: f.anticipacion_min_minutos,
    anticipacionMaxDias: f.anticipacion_max_dias,
    maxCitasActivasCliente: f.max_citas_activas_cliente,
    horasLimiteCancelacion: f.horas_limite_cancelacion,
    horasRecordatorio: f.horas_recordatorio,
    // PostgreSQL entrega `time` como 'HH:MM:SS'; la API usa 'HH:MM'.
    recordatorioNoAntesDe: f.recordatorio_no_antes_de.slice(0, 5),
    recordatorioNoDespuesDe: f.recordatorio_no_despues_de.slice(0, 5),
    maxInasistencias: f.max_inasistencias,
    ventanaInasistenciasDias: f.ventana_inasistencias_dias,
    horasEsperaAprobacion: f.horas_espera_aprobacion,
    aprobacionMinutosAntesCita: f.aprobacion_minutos_antes_cita,
    horasModoHumano: f.horas_modo_humano,
    horasAutocompletarCita: f.horas_autocompletar_cita,
  };
}

export async function obtenerConfiguracion(
  tx: Transaccion,
  negocioId: string,
): Promise<ConfiguracionNegocio | null> {
  const { rows } = await tx.consultar<FilaConfiguracion>(
    `SELECT ${SELECCION_CONFIGURACION} FROM configuracion_negocio WHERE negocio_id = $1`,
    [negocioId],
  );
  return rows[0] ? aConfiguracion(rows[0]) : null;
}

/** Devuelve la configuración completa ya combinada con los cambios. */
export async function actualizarConfiguracion(
  tx: Transaccion,
  negocioId: string,
  cambios: CambiosConfiguracion,
): Promise<ConfiguracionNegocio | null> {
  const { asignaciones, valores } = armarCambios(cambios, COLUMNAS_CONFIGURACION);
  const { rows } = await tx.consultar<FilaConfiguracion>(
    `UPDATE configuracion_negocio SET ${asignaciones} WHERE negocio_id = $1
     RETURNING ${SELECCION_CONFIGURACION}`,
    [negocioId, ...valores],
  );
  return rows[0] ? aConfiguracion(rows[0]) : null;
}
