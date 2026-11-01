import { DatosInvalidos, NoEncontrado } from '../../compartido/errores.js';
import {
  esFechaLocal,
  fechaLocal,
  fechasEntre,
  horaLocal,
  inicioDelDia,
  sumarDias,
} from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import { calcularHuecos } from './disponibilidad.js';
import * as repositorio from './citas.repositorio.js';
import type { ConsultaDisponibilidad, DiaDisponible, Disponibilidad } from './citas.tipos.js';

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

    if (!(await repositorio.existeProfesionalActivo(tx, consulta.profesionalId))) {
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
