/** Base de conocimiento: preguntas y respuestas que el asistente usa para contestar. */

export interface EntradaConocimiento {
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BaseDeConocimiento {
  entradas: EntradaConocimiento[];
  caracteresActivos: number;
  maxCaracteresActivos: number;
  maxEntradas: number;
}

/** Los mismos topes que el backend (conocimiento.servicio.ts), para avisar al escribir. */
export const MAX_PREGUNTA = 300;
export const MAX_RESPUESTA = 2_000;

/** Qué tan llena está la base, en porcentaje entero de 0 a 100. Hacia arriba: algo usado nunca se ve como 0 %. */
export function porcentajeUsado(usado: number, maximo: number): number {
  if (maximo <= 0) return 100;
  return Math.min(100, Math.max(0, Math.ceil((usado / maximo) * 100)));
}
