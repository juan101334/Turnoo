import {
  DatosInvalidos,
  FueraDePlazo,
  HorarioNoDisponible,
  LimiteDeCitas,
  LimiteDelPlan,
  NoEncontrado,
  Prohibido,
  TransicionNoPermitida,
} from '../../compartido/errores.js';
import {
  esFechaLocal,
  fechaLocal,
  fechasEntre,
  horaLocal,
  inicioDelDia,
  minutosEntre,
  primerDiaDelMes,
  sumarDias,
  sumarMinutos,
} from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio, type Transaccion } from '../../db/contexto.js';
import { calcularHuecos } from './disponibilidad.js';
import * as repositorio from './citas.repositorio.js';
import {
  ESTADOS_ACTIVOS,
  type Actor,
  type Cita,
  type CitaCreada,
  type ConsultaDisponibilidad,
  type DiaDisponible,
  type Disponibilidad,
  type EntradaCita,
  type ReglasDeAgenda,
} from './citas.tipos.js';

const MAX_DIAS_POR_CONSULTA = 31;

function validar(consulta: ConsultaDisponibilidad): void {
  if (!esUuid(consulta.profesionalId)) {
    throw new DatosInvalidos('El barbero indicado no es válido');
  }
  if (consulta.servicioIds.length === 0) {
    throw new DatosInvalidos('Debes indicar al menos un servicio');
  }
  if (!consulta.servicioIds.every(esUuid)) {
    throw new DatosInvalidos('Alguno de los servicios indicados no es válido');
  }
  if (new Set(consulta.servicioIds).size !== consulta.servicioIds.length) {
    throw new DatosInvalidos('Hay servicios repetidos');
  }
  if (!esFechaLocal(consulta.desde) || !esFechaLocal(consulta.hasta)) {
    throw new DatosInvalidos('Las fechas deben tener el formato AAAA-MM-DD');
  }
  if (consulta.hasta < consulta.desde) {
    throw new DatosInvalidos('La fecha final no puede ser anterior a la inicial');
  }
  if (fechasEntre(consulta.desde, consulta.hasta).length > MAX_DIAS_POR_CONSULTA) {
    throw new DatosInvalidos(`Puedes consultar hasta ${MAX_DIAS_POR_CONSULTA} días a la vez`);
  }
}

/**
 * Horarios disponibles de un barbero para una combinación de servicios.
 * `ahora` se puede indicar para las pruebas; en producción es la hora actual.
 */
export async function consultarDisponibilidad(
  negocioId: string,
  consulta: ConsultaDisponibilidad,
  ahora: Date = new Date(),
): Promise<Disponibilidad> {
  validar(consulta);

  return conNegocio(negocioId, async (tx) => {
    const reglas = await repositorio.obtenerReglasDeAgenda(tx, negocioId);
    if (!reglas) throw new NoEncontrado('El negocio');

    if (!(await repositorio.obtenerProfesionalActivo(tx, consulta.profesionalId))) {
      throw new NoEncontrado('El barbero');
    }

    const servicios = await repositorio.obtenerServiciosDelProfesional(
      tx,
      consulta.profesionalId,
      consulta.servicioIds,
    );
    if (servicios.length !== consulta.servicioIds.length) {
      throw new DatosInvalidos('Alguno de los servicios no existe o no lo ofrece este barbero');
    }
    const duracionTotalMinutos = servicios.reduce((suma, s) => suma + s.duracionMinutos, 0);
    const precioTotalCop = servicios.reduce((suma, s) => suma + s.precioCop, 0);

    const fechas = fechasEntre(consulta.desde, consulta.hasta);
    const [horarios, ocupados] = await Promise.all([
      repositorio.obtenerHorariosDeTrabajo(tx, consulta.profesionalId),
      repositorio.obtenerOcupados(
        tx,
        consulta.profesionalId,
        inicioDelDia(consulta.desde, reglas.zonaHoraria),
        inicioDelDia(sumarDias(consulta.hasta, 1), reglas.zonaHoraria),
      ),
    ]);

    const huecos = calcularHuecos({
      zonaHoraria: reglas.zonaHoraria,
      fechas,
      horarios,
      ocupados,
      duracionMinutos: duracionTotalMinutos,
      intervaloMinutos: reglas.intervaloMinutos,
      ahora,
      anticipacionMinMinutos: reglas.anticipacionMinMinutos,
      anticipacionMaxDias: reglas.anticipacionMaxDias,
    });

    const porDia = new Map<string, DiaDisponible>();
    for (const hueco of huecos) {
      const fecha = fechaLocal(hueco.inicio, reglas.zonaHoraria);
      const dia = porDia.get(fecha) ?? { fecha, huecos: [] };
      dia.huecos.push({
        inicio: hueco.inicio,
        fin: hueco.fin,
        hora: horaLocal(hueco.inicio, reglas.zonaHoraria),
      });
      porDia.set(fecha, dia);
    }

    return {
      profesionalId: consulta.profesionalId,
      servicios,
      duracionTotalMinutos,
      precioTotalCop,
      zonaHoraria: reglas.zonaHoraria,
      dias: [...porDia.values()],
    };
  });
}

// ---------------------------------------------------------------------
// Crear, cancelar, reprogramar, aprobar y marcar citas.
// Todo en UNA transacción por operación. Las reglas viven aquí; el SQL, en el repositorio.
// ---------------------------------------------------------------------

const MAX_NOTAS = 500;
const MINUTOS_POR_HORA = 60;

function validarEntradaCita(e: EntradaCita): void {
  if (!esUuid(e.profesionalId)) throw new DatosInvalidos('El barbero indicado no es válido');
  if (!esUuid(e.clienteId)) throw new DatosInvalidos('El cliente indicado no es válido');
  if (e.servicioIds.length === 0) throw new DatosInvalidos('Debes indicar al menos un servicio');
  if (!e.servicioIds.every(esUuid)) throw new DatosInvalidos('Alguno de los servicios no es válido');
  if (new Set(e.servicioIds).size !== e.servicioIds.length) {
    throw new DatosInvalidos('Hay servicios repetidos');
  }
  validarInstante(e.inicio);
  if (e.notas !== undefined && e.notas.length > MAX_NOTAS) {
    throw new DatosInvalidos(`Las notas no pueden pasar de ${MAX_NOTAS} caracteres`);
  }
  if (e.creadaPorUsuarioId !== undefined && !esUuid(e.creadaPorUsuarioId)) {
    throw new DatosInvalidos('El usuario indicado no es válido');
  }
}

function validarInstante(inicio: unknown): asserts inicio is Date {
  if (!(inicio instanceof Date) || Number.isNaN(inicio.getTime())) {
    throw new DatosInvalidos('La fecha y hora de la cita no son válidas');
  }
}

async function reglasDelNegocio(tx: Transaccion, negocioId: string): Promise<ReglasDeAgenda> {
  const reglas = await repositorio.obtenerReglasDeAgenda(tx, negocioId);
  if (!reglas) throw new NoEncontrado('El negocio');
  if (reglas.estadoNegocio === 'suspendido') throw new Prohibido('El negocio está suspendido');
  return reglas;
}

/** Exige que `inicio` sea EXACTAMENTE uno de los huecos que ofrece la disponibilidad. */
async function exigirHuecoLibre(
  tx: Transaccion,
  reglas: ReglasDeAgenda,
  profesionalId: string,
  inicio: Date,
  duracionMinutos: number,
  ahora: Date,
  excluirCitaId: string | null = null,
): Promise<void> {
  const fecha = fechaLocal(inicio, reglas.zonaHoraria);
  const [horarios, ocupados] = await Promise.all([
    repositorio.obtenerHorariosDeTrabajo(tx, profesionalId),
    repositorio.obtenerOcupados(
      tx,
      profesionalId,
      inicioDelDia(fecha, reglas.zonaHoraria),
      inicioDelDia(sumarDias(fecha, 1), reglas.zonaHoraria),
      excluirCitaId,
    ),
  ]);
  const huecos = calcularHuecos({
    zonaHoraria: reglas.zonaHoraria,
    fechas: [fecha],
    horarios,
    ocupados,
    duracionMinutos,
    intervaloMinutos: reglas.intervaloMinutos,
    ahora,
    anticipacionMinMinutos: reglas.anticipacionMinMinutos,
    anticipacionMaxDias: reglas.anticipacionMaxDias,
  });
  if (!huecos.some((h) => h.inicio.getTime() === inicio.getTime())) {
    throw new HorarioNoDisponible();
  }
}

/** La cita, bloqueada. Si es de otro cliente se responde "no existe" para no revelar que existe. */
async function citaDelActor(tx: Transaccion, citaId: string, actor: Actor): Promise<Cita> {
  if (!esUuid(citaId)) throw new DatosInvalidos('La cita indicada no es válida');
  const cita = await repositorio.obtenerCitaParaActualizar(tx, citaId);
  if (!cita || (actor.tipo === 'cliente' && cita.clienteId !== actor.clienteId)) {
    throw new NoEncontrado('La cita');
  }
  return cita;
}

/** El cliente solo puede cambiar su cita hasta `horasLimiteCancelacion` antes; el negocio, siempre. */
function exigirPlazo(cita: Cita, actor: Actor, reglas: ReglasDeAgenda, ahora: Date): void {
  if (actor.tipo === 'negocio') return;
  const limite = sumarMinutos(cita.inicio, -reglas.horasLimiteCancelacion * MINUTOS_POR_HORA);
  if (ahora > limite) {
    throw new FueraDePlazo(
      `Solo puedes hacer este cambio hasta ${reglas.horasLimiteCancelacion} horas antes de la cita. ` +
        'Comunícate con el negocio.',
    );
  }
}

export async function crearCita(
  negocioId: string,
  entrada: EntradaCita,
  ahora: Date = new Date(),
): Promise<CitaCreada> {
  validarEntradaCita(entrada);

  return conNegocio(negocioId, async (tx) => {
    const reglas = await reglasDelNegocio(tx, negocioId);

    const profesional = await repositorio.obtenerProfesionalActivo(tx, entrada.profesionalId);
    if (!profesional) throw new NoEncontrado('El barbero');
    if (!(await repositorio.existeCliente(tx, entrada.clienteId))) throw new NoEncontrado('El cliente');

    const encontrados = await repositorio.obtenerServiciosDelProfesional(
      tx,
      entrada.profesionalId,
      entrada.servicioIds,
    );
    if (encontrados.length !== entrada.servicioIds.length) {
      throw new DatosInvalidos('Alguno de los servicios no existe o no lo ofrece este barbero');
    }
    const duracionMinutos = encontrados.reduce((suma, s) => suma + s.duracionMinutos, 0);
    const precioTotalCop = encontrados.reduce((suma, s) => suma + s.precioCop, 0);

    await exigirHuecoLibre(tx, reglas, entrada.profesionalId, entrada.inicio, duracionMinutos, ahora);

    if (reglas.maxCitasActivasCliente !== null) {
      const activas = await repositorio.contarCitasActivas(tx, entrada.clienteId, ahora);
      if (activas >= reglas.maxCitasActivasCliente) {
        throw new LimiteDeCitas(
          `Ya tienes ${activas} citas activas (el máximo es ${reglas.maxCitasActivasCliente}). ` +
            'Cancela o espera a que termine una para agendar otra.',
        );
      }
    }

    // Muchas inasistencias recientes: la cita reserva el hueco pero el barbero debe aprobarla.
    const inasistencias = await repositorio.contarInasistencias(
      tx,
      entrada.clienteId,
      sumarMinutos(ahora, -reglas.ventanaInasistenciasDias * 24 * 60),
    );
    let estado: 'pendiente' | 'por_aprobar' = 'pendiente';
    let aprobacionExpiraEn: Date | null = null;
    if (inasistencias >= reglas.maxInasistencias) {
      const espera = sumarMinutos(ahora, reglas.horasEsperaAprobacion * MINUTOS_POR_HORA);
      const tope = sumarMinutos(entrada.inicio, -reglas.aprobacionMinutosAntesCita);
      aprobacionExpiraEn = espera < tope ? espera : tope;
      if (aprobacionExpiraEn <= ahora) {
        throw new HorarioNoDisponible(
          'Esta cita necesita la aprobación del negocio y ya no hay tiempo para pedirla. ' +
            'Comunícate directamente con el negocio.',
        );
      }
      estado = 'por_aprobar';
    }

    const fin = sumarMinutos(entrada.inicio, duracionMinutos);
    const cita = await repositorio.insertarCita(tx, negocioId, {
      sedeId: profesional.sedeId,
      profesionalId: entrada.profesionalId,
      clienteId: entrada.clienteId,
      inicio: entrada.inicio,
      fin,
      estado,
      aprobacionExpiraEn,
      precioTotalCop,
      notas: entrada.notas ?? null,
      origen: entrada.origen ?? 'whatsapp',
      creadaPorUsuarioId: entrada.creadaPorUsuarioId ?? null,
    });
    await repositorio.insertarServiciosDeCita(
      tx,
      negocioId,
      cita.id,
      entrada.profesionalId,
      entrada.servicioIds,
    );

    // Se cuenta al final y de forma atómica; si supera el plan, se deshace toda la transacción.
    const usadas = await repositorio.incrementarUsoDeCitas(
      tx,
      negocioId,
      primerDiaDelMes(ahora, reglas.zonaHoraria),
    );
    if (reglas.maxCitasMes !== null && usadas > reglas.maxCitasMes) {
      throw new LimiteDelPlan('El negocio alcanzó el límite de citas de este mes en su plan');
    }

    const porId = new Map(encontrados.map((s) => [s.id, s]));
    return { ...cita, servicios: entrada.servicioIds.map((id) => porId.get(id)!) };
  });
}

export async function cancelarCita(
  negocioId: string,
  citaId: string,
  actor: Actor,
  ahora: Date = new Date(),
): Promise<Cita> {
  return conNegocio(negocioId, async (tx) => {
    const reglas = await reglasDelNegocio(tx, negocioId);
    const cita = await citaDelActor(tx, citaId, actor);
    if (!ESTADOS_ACTIVOS.includes(cita.estado)) {
      throw new TransicionNoPermitida('Esta cita ya no se puede cancelar');
    }
    exigirPlazo(cita, actor, reglas, ahora);
    return repositorio.cancelar(tx, cita.id, actor.tipo, ahora);
  });
}

/** Cambia la hora de la MISMA cita (misma duración). Reinicia el recordatorio. */
export async function reprogramarCita(
  negocioId: string,
  citaId: string,
  nuevoInicio: Date,
  actor: Actor,
  ahora: Date = new Date(),
): Promise<Cita> {
  validarInstante(nuevoInicio);

  return conNegocio(negocioId, async (tx) => {
    const reglas = await reglasDelNegocio(tx, negocioId);
    const cita = await citaDelActor(tx, citaId, actor);
    if (cita.estado !== 'pendiente' && cita.estado !== 'confirmada') {
      throw new TransicionNoPermitida(
        'Esta cita no se puede reprogramar. Cancélala y agenda una nueva.',
      );
    }
    exigirPlazo(cita, actor, reglas, ahora);

    const duracionMinutos = minutosEntre(cita.inicio, cita.fin);
    await exigirHuecoLibre(
      tx,
      reglas,
      cita.profesionalId,
      nuevoInicio,
      duracionMinutos,
      ahora,
      cita.id,
    );
    return repositorio.reprogramar(tx, cita.id, nuevoInicio, sumarMinutos(nuevoInicio, duracionMinutos));
  });
}

/** El barbero aprueba una cita `por_aprobar` a tiempo. */
export async function aprobarCita(
  negocioId: string,
  citaId: string,
  ahora: Date = new Date(),
): Promise<Cita> {
  return conNegocio(negocioId, async (tx) => {
    await reglasDelNegocio(tx, negocioId);
    const cita = await citaDelActor(tx, citaId, { tipo: 'negocio' });
    if (cita.estado !== 'por_aprobar') {
      throw new TransicionNoPermitida('Esta cita no está esperando aprobación');
    }
    if (cita.aprobacionExpiraEn && cita.aprobacionExpiraEn <= ahora) {
      throw new FueraDePlazo('El plazo para aprobar esta cita venció');
    }
    return repositorio.cambiarEstado(tx, cita.id, 'pendiente');
  });
}

export async function rechazarCita(
  negocioId: string,
  citaId: string,
  ahora: Date = new Date(),
): Promise<Cita> {
  return conNegocio(negocioId, async (tx) => {
    await reglasDelNegocio(tx, negocioId);
    const cita = await citaDelActor(tx, citaId, { tipo: 'negocio' });
    if (cita.estado !== 'por_aprobar') {
      throw new TransicionNoPermitida('Esta cita no está esperando aprobación');
    }
    return repositorio.cancelar(tx, cita.id, 'negocio', ahora);
  });
}

/** El negocio marca el resultado. Solo desde que la cita empezó. Se puede corregir entre ambos. */
export async function marcarCita(
  negocioId: string,
  citaId: string,
  estado: 'completada' | 'no_asistio',
  ahora: Date = new Date(),
): Promise<Cita> {
  if (estado !== 'completada' && estado !== 'no_asistio') {
    throw new DatosInvalidos('El estado debe ser completada o no_asistio');
  }
  return conNegocio(negocioId, async (tx) => {
    await reglasDelNegocio(tx, negocioId);
    const cita = await citaDelActor(tx, citaId, { tipo: 'negocio' });
    if (ahora < cita.inicio) {
      throw new TransicionNoPermitida('Solo se puede marcar una cita desde la hora en que empieza');
    }
    return repositorio.cambiarEstado(tx, cita.id, estado); // el trigger de la base valida la transición
  });
}
