import { ejecutarCiclo, type Tarea } from './tareas.js';

const UN_MINUTO_MS = 60_000;

export interface Programador {
  /** Deja de programar ciclos y espera a que termine el que esté en curso. */
  detener: () => Promise<void>;
}

/**
 * Corre las tareas al arrancar y luego periódicamente. Cada espera empieza cuando termina el ciclo
 * anterior, así que dos ciclos de esta instancia nunca se pisan. Solo lo inicia index.ts: crearApp
 * no lo usa, para que las pruebas y cualquier otro uso de la app no cambien datos por su cuenta.
 */
export function iniciarTareas({ cadaMs = UN_MINUTO_MS, tareas }: { cadaMs?: number; tareas?: Tarea[] } = {}): Programador {
  let detenido = false;
  let temporizador: NodeJS.Timeout | undefined;
  let enCurso: Promise<void>;

  const ciclo = () => {
    enCurso = ejecutarCiclo(new Date(), tareas).then(() => {
      if (!detenido) temporizador = setTimeout(ciclo, cadaMs);
    });
  };
  ciclo();

  return {
    detener: () => {
      detenido = true;
      clearTimeout(temporizador);
      return enCurso;
    },
  };
}
