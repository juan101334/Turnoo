import { Conflicto, DatosInvalidos, NoEncontrado, Prohibido } from '../../compartido/errores.js';
import { diaSemanaIso, fechaLocal, instanteLocal, minutosEntre } from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio, type Transaccion } from '../../db/contexto.js';
import { exigirNegocioOperativo } from '../negocios/negocios.reglas.js';
import * as repositorioNegocios from '../negocios/negocios.repositorio.js';
import * as repositorio from './agenda.repositorio.js';
import type {
  Bloqueo,
  CambiosServicio,
  CitaAfectada,
  EntradaBloqueo,
  EntradaHorario,
  EntradaServicio,
  Horario,
  Servicio,
} from './agenda.tipos.js';
import * as repositorioBarberos from './profesionales.repositorio.js';

const MAX_DIAS_LISTA_BLOQUEOS = 62;
const MINUTOS_POR_DIA = 24 * 60;

function exigirId(id: string, que: string): void {
  if (!esUuid(id)) throw new DatosInvalidos(`${que} indicado no es válido`);
}

async function exigirBarbero(tx: Transaccion, profesionalId: string): Promise<void> {
  exigirId(profesionalId, 'El barbero');
  if (!(await repositorioBarberos.obtener(tx, profesionalId))) throw new NoEncontrado('El barbero');
}

/** Para escribir: el negocio no está suspendido y el barbero existe y está activo. */
async function exigirBarberoEditable(tx: Transaccion, negocioId: string, profesionalId: string): Promise<void> {
  exigirId(profesionalId, 'El barbero');
  await exigirNegocioOperativo(tx, negocioId);
  const barbero = await repositorioBarberos.obtener(tx, profesionalId);
  if (!barbero) throw new NoEncontrado('El barbero');
  if (!barbero.activo) throw new Conflicto('El barbero está desactivado');
}

// ---------------------------------------------------------------------
// Servicios. Se desactivan, no se borran: las citas los referencian.
// El nombre y el precio de una cita ya agendada no cambian: se copiaron al agendar.
// ---------------------------------------------------------------------

export function listarServicios(negocioId: string, profesionalId: string): Promise<Servicio[]> {
  return conNegocio(negocioId, async (tx) => {
    await exigirBarbero(tx, profesionalId);
    return repositorio.listarServicios(tx, profesionalId);
  });
}

/** Barberos activos con sus servicios activos; los que no tienen ninguno se omiten. Lo usa la IA. */
export function catalogoActivo(
  negocioId: string,
): Promise<{ id: string; nombre: string; servicios: Servicio[] }[]> {
  return conNegocio(negocioId, async (tx) => {
    const barberos = (await repositorioBarberos.listar(tx)).filter((b) => b.activo);
    const catalogo = [];
    for (const barbero of barberos) {
      const servicios = (await repositorio.listarServicios(tx, barbero.id)).filter((s) => s.activo);
      if (servicios.length > 0) catalogo.push({ id: barbero.id, nombre: barbero.nombre, servicios });
    }
    return catalogo;
  });
}

export function crearServicio(
  negocioId: string,
  profesionalId: string,
  entrada: EntradaServicio,
): Promise<Servicio> {
  return conNegocio(negocioId, async (tx) => {
    await exigirBarberoEditable(tx, negocioId, profesionalId);
    return repositorio.crearServicio(tx, negocioId, profesionalId, entrada);
  });
}

export function actualizarServicio(
  negocioId: string,
  profesionalId: string,
  servicioId: string,
  cambios: CambiosServicio,
): Promise<Servicio> {
  if (Object.values(cambios).every((valor) => valor === undefined)) {
    throw new DatosInvalidos('Indica al menos un dato para cambiar');
  }
  exigirId(servicioId, 'El servicio');
  return conNegocio(negocioId, async (tx) => {
    await exigirBarberoEditable(tx, negocioId, profesionalId);
    const servicio = await repositorio.actualizarServicio(tx, profesionalId, servicioId, cambios);
    if (!servicio) throw new NoEncontrado('El servicio');
    return servicio;
  });
}

export function cambiarServicioActivo(
  negocioId: string,
  profesionalId: string,
  servicioId: string,
  activo: boolean,
): Promise<Servicio> {
  exigirId(servicioId, 'El servicio');
  return conNegocio(negocioId, async (tx) => {
    await exigirBarberoEditable(tx, negocioId, profesionalId);
    const servicio = await repositorio.cambiarServicioActivo(tx, profesionalId, servicioId, activo);
    if (!servicio) throw new NoEncontrado('El servicio');
    return servicio;
  });
}

// ---------------------------------------------------------------------
// Horarios. Agregar un rango no afecta a ninguna cita; quitarlo sí.
// ---------------------------------------------------------------------

export function listarHorarios(negocioId: string, profesionalId: string): Promise<Horario[]> {
  return conNegocio(negocioId, async (tx) => {
    await exigirBarbero(tx, profesionalId);
    return repositorio.listarHorarios(tx, profesionalId);
  });
}

export function crearHorario(
  negocioId: string,
  profesionalId: string,
  entrada: EntradaHorario,
): Promise<Horario> {
  // Se comparan como texto: 'HH:MM' con ceros a la izquierda ordena igual que la hora.
  if (entrada.horaInicio >= entrada.horaFin) {
    throw new DatosInvalidos('El horario debe empezar antes de terminar');
  }
  return conNegocio(negocioId, async (tx) => {
    await exigirBarberoEditable(tx, negocioId, profesionalId);
    return repositorio.crearHorario(tx, negocioId, profesionalId, entrada);
  });
}

/** ¿La cita cae, en hora local del negocio, dentro de ese rango semanal? */
function citaDentroDelRango(cita: CitaAfectada, rango: Horario, zona: string): boolean {
  const fecha = fechaLocal(cita.inicio, zona);
  if (diaSemanaIso(fecha, zona) !== rango.diaSemana) return false;
  return (
    cita.inicio < instanteLocal(fecha, rango.horaFin, zona) &&
    cita.fin > instanteLocal(fecha, rango.horaInicio, zona)
  );
}

/**
 * Quita el rango y devuelve las citas que quedan fuera, sin tocarlas: el negocio decide.
 * El bloqueo del barbero hace que una cita en curso termine antes de calcularlas.
 */
export function eliminarHorario(
  negocioId: string,
  profesionalId: string,
  horarioId: string,
  ahora: Date = new Date(),
): Promise<{ citasAfectadas: CitaAfectada[] }> {
  exigirId(horarioId, 'El horario');
  return conNegocio(negocioId, async (tx) => {
    await exigirBarberoEditable(tx, negocioId, profesionalId);
    await repositorioBarberos.obtenerBloqueado(tx, profesionalId);
    const horario = await repositorio.eliminarHorario(tx, profesionalId, horarioId);
    if (!horario) throw new NoEncontrado('El horario');

    const negocio = await repositorioNegocios.obtenerNegocio(tx, negocioId);
    if (!negocio) throw new NoEncontrado('El negocio');
    const citas = await repositorio.citasActivasEnRango(tx, { profesionalId, desde: ahora, hasta: null });
    return { citasAfectadas: citas.filter((c) => citaDentroDelRango(c, horario, negocio.zonaHoraria)) };
  });
}

// ---------------------------------------------------------------------
// Bloqueos. `soloBarbero` es el alcance de quien pide: null = todo el negocio (dueño);
// con valor = solo ese barbero (empleado).
// ---------------------------------------------------------------------

export function listarBloqueos(
  negocioId: string,
  filtro: { desde: Date; hasta: Date; profesionalId: string | null },
): Promise<Bloqueo[]> {
  if (filtro.hasta <= filtro.desde) throw new DatosInvalidos('"hasta" debe ser posterior a "desde"');
  if (minutosEntre(filtro.desde, filtro.hasta) > MAX_DIAS_LISTA_BLOQUEOS * MINUTOS_POR_DIA) {
    throw new DatosInvalidos(`Puedes consultar hasta ${MAX_DIAS_LISTA_BLOQUEOS} días a la vez`);
  }
  if (filtro.profesionalId !== null) exigirId(filtro.profesionalId, 'El barbero');
  return conNegocio(negocioId, (tx) => repositorio.listarBloqueos(tx, filtro));
}

/** Guarda el bloqueo y devuelve las citas que se cruzan, sin tocarlas: el negocio decide. */
export function crearBloqueo(
  negocioId: string,
  entrada: EntradaBloqueo,
  ahora: Date = new Date(),
): Promise<{ bloqueo: Bloqueo; citasAfectadas: CitaAfectada[] }> {
  if (entrada.fin <= entrada.inicio) throw new DatosInvalidos('El bloqueo debe empezar antes de terminar');
  return conNegocio(negocioId, async (tx) => {
    if (entrada.profesionalId === null) {
      await exigirNegocioOperativo(tx, negocioId);
      await repositorio.bloquearBarberosDelNegocio(tx);
    } else {
      await exigirBarberoEditable(tx, negocioId, entrada.profesionalId);
      await repositorioBarberos.obtenerBloqueado(tx, entrada.profesionalId);
    }
    const bloqueo = await repositorio.crearBloqueo(tx, negocioId, entrada);
    const citasAfectadas = await repositorio.citasActivasEnRango(tx, {
      profesionalId: entrada.profesionalId,
      desde: entrada.inicio > ahora ? entrada.inicio : ahora,
      hasta: entrada.fin,
    });
    return { bloqueo, citasAfectadas };
  });
}

export function eliminarBloqueo(
  negocioId: string,
  bloqueoId: string,
  soloBarbero: string | null,
): Promise<void> {
  exigirId(bloqueoId, 'El bloqueo');
  return conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    const bloqueo = await repositorio.obtenerBloqueo(tx, bloqueoId);
    if (!bloqueo) throw new NoEncontrado('El bloqueo');
    if (soloBarbero !== null) {
      // Un cierre del negocio lo ve, pero solo el dueño lo quita. Uno de otro barbero "no existe".
      if (bloqueo.profesionalId === null) throw new Prohibido();
      if (bloqueo.profesionalId !== soloBarbero) throw new NoEncontrado('El bloqueo');
    }
    await repositorio.eliminarBloqueo(tx, bloqueoId);
  });
}
