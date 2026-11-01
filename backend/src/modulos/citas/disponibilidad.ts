import {
  diaSemanaIso,
  instanteLocal,
  redondearArriba,
} from '../../compartido/tiempo.js';
import type { HorarioTrabajo, Intervalo } from './citas.tipos.js';

/**
 * Cálculo de disponibilidad. Es una función PURA: no toca la base de datos ni
 * el reloj, así que se prueba con facilidad. Recibe todo lo que necesita.
 *
 * Para cada día pedido:
 *   1. toma los rangos de trabajo del barbero ese día de la semana,
 *   2. les resta lo ocupado (bloqueos y citas activas),
 *   3. en lo que queda libre, propone horas de inicio alineadas al reloj
 *      (cada `intervaloMinutos`) donde quepa la duración completa,
 *   4. descarta lo que queda antes de la anticipación mínima o después de la máxima.
 */

export interface EntradaDisponibilidad {
  zonaHoraria: string;
  /** Fechas locales 'AAAA-MM-DD' a calcular. */
  fechas: string[];
  horarios: HorarioTrabajo[];
  /** Bloqueos y citas activas, en instantes UTC. Pueden solaparse entre sí. */
  ocupados: Intervalo[];
  /** Suma de la duración de todos los servicios pedidos. */
  duracionMinutos: number;
  intervaloMinutos: number;
  /** "Ahora": se recibe como parámetro para poder probar. */
  ahora: Date;
  anticipacionMinMinutos: number;
  anticipacionMaxDias: number;
}

interface Rango {
  inicio: number;
  fin: number;
}

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 86_400_000;

/** Ordena y fusiona intervalos que se tocan o se solapan. */
function unir(intervalos: Rango[]): Rango[] {
  const ordenados = [...intervalos].sort((a, b) => a.inicio - b.inicio);
  const unidos: Rango[] = [];
  for (const actual of ordenados) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && actual.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin);
    } else {
      unidos.push({ ...actual });
    }
  }
  return unidos;
}

/** Lo que queda libre de `base` al quitar los `ocupados` (ya ordenados y unidos). */
function restar(base: Rango, ocupados: Rango[]): Rango[] {
  const libres: Rango[] = [];
  let cursor = base.inicio;
  for (const ocupado of ocupados) {
    if (ocupado.fin <= cursor) continue;
    if (ocupado.inicio >= base.fin) break;
    if (ocupado.inicio > cursor) {
      libres.push({ inicio: cursor, fin: ocupado.inicio });
    }
    cursor = Math.max(cursor, ocupado.fin);
    if (cursor >= base.fin) break;
  }
  if (cursor < base.fin) {
    libres.push({ inicio: cursor, fin: base.fin });
  }
  return libres;
}

/** Devuelve cada hueco donde podría empezar una cita, ordenados por hora. */
export function calcularHuecos(entrada: EntradaDisponibilidad): Intervalo[] {
  const duracionMs = entrada.duracionMinutos * MS_POR_MINUTO;
  const pasoMs = entrada.intervaloMinutos * MS_POR_MINUTO;
  const ocupados = unir(
    entrada.ocupados.map((o) => ({ inicio: o.inicio.getTime(), fin: o.fin.getTime() })),
  );
  const masTemprano = entrada.ahora.getTime() + entrada.anticipacionMinMinutos * MS_POR_MINUTO;
  const masTarde = entrada.ahora.getTime() + entrada.anticipacionMaxDias * MS_POR_DIA;

  const huecos: Intervalo[] = [];

  for (const fecha of entrada.fechas) {
    const dia = diaSemanaIso(fecha, entrada.zonaHoraria);
    const rangosDeTrabajo = entrada.horarios
      .filter((h) => h.diaSemana === dia)
      .map((h) => ({
        inicio: instanteLocal(fecha, h.horaInicio, entrada.zonaHoraria).getTime(),
        fin: instanteLocal(fecha, h.horaFin, entrada.zonaHoraria).getTime(),
      }));

    for (const rango of rangosDeTrabajo) {
      for (const libre of restar(rango, ocupados)) {
        let inicio = redondearArriba(
          new Date(libre.inicio),
          entrada.intervaloMinutos,
          entrada.zonaHoraria,
        ).getTime();

        while (inicio + duracionMs <= libre.fin) {
          if (inicio >= masTemprano && inicio <= masTarde) {
            huecos.push({ inicio: new Date(inicio), fin: new Date(inicio + duracionMs) });
          }
          inicio += pasoMs;
        }
      }
    }
  }

  return huecos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
